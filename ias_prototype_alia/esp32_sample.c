#include <WiFi.h>
#include <HTTPClient.h>

// ================= KONFIGURASI WIFI =================
const char* ssid     = "<ssid>";
const char* password = "<Password>";

// ================= KONFIGURASI SERVER (Alia backend) =================
// Backend sekarang menerima data yang di-POST oleh device ini, bukan
// meng-host dashboard sendiri untuk di-poll. Arahkan ke IP/host backend
// (ias_prototype_alia/ias_infra), port BACKEND_PORT (default 4110).
const char* serverUrl   = "http://<backend-host>:4110/data";
// Harus sama persis dengan DEVICE_API_KEY di backend (.env) - dikirim
// sebagai header X-Device-Key, bukan lewat auth operator/JWT.
const char* deviceApiKey = "<DEVICE_API_KEY>";

// ================= KONFIGURASI 4-20mA =================
const int   ADC_PIN             = 34;       // GPIO 34 (input only, ADC1_CH6)
const float SHUNT_RESISTOR_OHM  = 150.0;    // Resistor shunt 150Ω (1% metal film)
const float ADC_VREF_MV         = 3300.0;   // Referensi ADC ESP32 (mV)
const float ADC_MAX_COUNTS      = 4095.0;   // ADC 12-bit

// ================= KONFIGURASI AUF750 =================
// Sesuaikan dengan Window M55 dan M56 di kontroler AUF750 Anda!
const float FLOW_AT_4mA  = 0.0;     // Debit saat 4mA (Window M55)  [m3/h]
const float FLOW_AT_20mA = 200.0;   // Debit saat 20mA (Window M56) [m3/h]

// ================= INTERVAL =================
const unsigned long SAMPLE_INTERVAL_MS = 1000;   // 1 detik - harus cocok
                                                   // dengan asumsi LINK_TIMEOUT_MS
                                                   // di backend (default 5x interval ini)
const int   ADC_SAMPLES = 30;                    // rata-rata 30 sampel

// ================= VARIABEL =================
float currentMA   = 0.0;     // arus terukur (mA)
float flowRateM3H = 0.0;     // debit (m3/h)
float totalLiters = 0.0;     // total volume (Liter)
unsigned long oldTime = 0;

// ================= BACA ADC (RATA-RATA) =================
float readADCAverage() {
  uint32_t sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    sum += analogRead(ADC_PIN);
    delayMicroseconds(200);
  }
  return (float)sum / ADC_SAMPLES;
}

// ================= KIRIM DATA KE BACKEND =================
// POST /data {"currentMA":..,"flowRate":..,"totalLiters":..} - payload yang
// sama persis dengan yang dulu dikembalikan oleh endpoint GET /data lokal,
// sekarang dikirim keluar alih-alih disajikan untuk di-poll.
void postReading() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi terputus, skip pengiriman data.");
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", deviceApiKey);
  http.setTimeout(3000);

  char body[160];
  snprintf(body, sizeof(body),
           "{\"currentMA\":%.2f,\"flowRate\":%.3f,\"totalLiters\":%.3f}",
           currentMA, flowRateM3H, totalLiters);

  int status = http.POST(body);
  if (status > 0) {
    Serial.printf("POST /data -> HTTP %d\n", status);
  } else {
    Serial.printf("[ERROR] POST /data gagal: %s\n", http.errorToString(status).c_str());
  }
  http.end();
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Konfigurasi ADC ESP32
  analogReadResolution(12);              // 12-bit (0-4095)
  analogSetAttenuation(ADC_11db);        // Rentang penuh ~0-3.3V
  pinMode(ADC_PIN, INPUT);

  Serial.println();
  Serial.println("=== Alia AUF750 4-20mA Monitor ===");
  Serial.printf("Shunt Resistor : %.1f Ohm\n", SHUNT_RESISTOR_OHM);
  Serial.printf("Flow @ 4mA     : %.2f m3/h\n", FLOW_AT_4mA);
  Serial.printf("Flow @ 20mA    : %.2f m3/h\n", FLOW_AT_20mA);
  Serial.printf("Server         : %s\n", serverUrl);

  // Koneksi WiFi
  Serial.print("Menghubungkan ke ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[ERROR] Gagal konek WiFi.");
    return;
  }

  Serial.println();
  Serial.println("Wi-Fi Terhubung!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  oldTime = millis();
  Serial.println("Sampling 4-20mA setiap 1 detik, mengirim ke backend...");
}

// ================= LOOP =================
void loop() {
  if ((millis() - oldTime) >= SAMPLE_INTERVAL_MS) {
    unsigned long duration = millis() - oldTime;
    oldTime = millis();

    // ---- Baca ADC ----
    float adcAvg = readADCAverage();
    float voltage_mV = (adcAvg / ADC_MAX_COUNTS) * ADC_VREF_MV;

    // ---- Konversi tegangan → arus ----
    currentMA = voltage_mV / SHUNT_RESISTOR_OHM;

    // ---- Validasi rentang 4-20mA ----
    if (currentMA < 3.5) {
      flowRateM3H = 0.0;
    } else if (currentMA > 21.0) {
      flowRateM3H = FLOW_AT_20mA * 1.05;
    } else {
      float ratio = (currentMA - 4.0) / 16.0;
      flowRateM3H = FLOW_AT_4mA + ratio * (FLOW_AT_20mA - FLOW_AT_4mA);
    }

    // Akumulasi total volume
    float durationInHours = duration / 3600000.0;
    totalLiters += flowRateM3H * 1000.0 * durationInHours;

    // ---- Kirim ke backend ----
    postReading();

    // ---- Debug Serial ----
    Serial.printf("ADC=%.1f  V=%.1f mV  I=%.2f mA  Flow=%.3f m3/h  Total=%.2f L  Heap=%u\n",
                  adcAvg, voltage_mV, currentMA, flowRateM3H, totalLiters, ESP.getFreeHeap());
  }
}
