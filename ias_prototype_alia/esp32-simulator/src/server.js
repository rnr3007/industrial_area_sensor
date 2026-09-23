/**
 * Stands in for the real Alia AUF750 ESP32 device. The device pushes
 * readings to the backend (POST /data) rather than hosting its own server
 * for the backend to poll - this replicates that exact behavior, posting
 * the same payload shape the firmware sends, on the same interval.
 *
 * Physics ported 1:1 from the firmware's loop():
 *   - a 4-20mA current loop drives flow rate via linear interpolation
 *     between FLOW_AT_4mA and FLOW_AT_20mA (the AUF750 controller's
 *     M55/M56 window)
 *   - totalLiters accumulates flowRateM3H * 1000 * durationInHours each tick
 *
 * Env:
 *   BACKEND_URL           where to POST (default http://alia_backend:4110)
 *   DEVICE_API_KEY        must match the backend's DEVICE_API_KEY
 *   SAMPLE_INTERVAL_MS    (default 1000, matches the real firmware)
 *   FLOW_AT_4mA / FLOW_AT_20mA   (default 0 / 200 m3/h, matches the sample)
 */
const BACKEND_URL = process.env.BACKEND_URL || 'http://alia_backend:4110';
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || 'change-me-device-key';
const SAMPLE_INTERVAL_MS = Number(process.env.SAMPLE_INTERVAL_MS || 1000);
const FLOW_AT_4MA = Number(process.env.FLOW_AT_4mA ?? 0.0);
const FLOW_AT_20MA = Number(process.env.FLOW_AT_20mA ?? 200.0);

const state = {
  currentMA: 12.0, // start mid-range so the dashboard shows RUN immediately
  flowRateM3H: 0,
  totalLiters: 15000 + Math.random() * 5000
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const log = (...args) => console.log(new Date().toISOString(), '[esp32-sim]', ...args);

/** One sampling tick - a slow random walk on current, with an occasional
 * excursion into idle (<3.5mA) or over-range (>21mA) to exercise the
 * dashboard's status states, same as a real sensor drifting/faulting would. */
function tick() {
  const excursion = Math.random();
  if (excursion < 0.01) {
    state.currentMA = 1.0 + Math.random(); // simulate NO SIGNAL
  } else if (excursion < 0.02) {
    state.currentMA = 21.5 + Math.random() * 2; // simulate OVER RANGE
  } else {
    state.currentMA = clamp(state.currentMA + (Math.random() - 0.5) * 0.8, 3.8, 20.5);
  }

  if (state.currentMA < 3.5) {
    state.flowRateM3H = 0.0;
  } else if (state.currentMA > 21.0) {
    state.flowRateM3H = FLOW_AT_20MA * 1.05;
  } else {
    const ratio = (state.currentMA - 4.0) / 16.0;
    state.flowRateM3H = FLOW_AT_4MA + ratio * (FLOW_AT_20MA - FLOW_AT_4MA);
  }

  const durationInHours = SAMPLE_INTERVAL_MS / 3_600_000;
  state.totalLiters += state.flowRateM3H * 1000 * durationInHours;
}

async function publish() {
  tick();
  const payload = {
    currentMA: Number(state.currentMA.toFixed(2)),
    flowRate: Number(state.flowRateM3H.toFixed(3)),
    totalLiters: Number(state.totalLiters.toFixed(3))
  };

  try {
    const res = await fetch(`${BACKEND_URL}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Key': DEVICE_API_KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log(`POST /data rejected: HTTP ${res.status} ${text}`);
    }
  } catch (err) {
    log(`POST /data failed: ${err.message}`);
  }
}

log(`publishing to ${BACKEND_URL}/data every ${SAMPLE_INTERVAL_MS}ms`);
publish();
setInterval(publish, SAMPLE_INTERVAL_MS);
