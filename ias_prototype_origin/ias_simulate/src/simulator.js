/**
 * FMC125 + DualCam device simulator.
 *
 * Standalone service: publishes telemetry, camera frames and status heartbeats
 * over MQTT using the same topics a real device would, so the whole pipeline
 * (broker -> web service -> anomaly engine -> WebSocket -> UI) can be exercised
 * without hardware. Runs one independent water-level/flow/quality profile per
 * configured company code, each drifting toward its own baseline.
 *
 * Env:
 *   MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD
 *   SIM_COMPANIES        comma separated company codes (default: the seeded four)
 *   SIM_INTERVAL_MS      telemetry period (default 5000)
 *   SIM_SNAPSHOT_EVERY   publish a camera frame every N telemetry ticks (default 6)
 *   SIM_BACKFILL_HOURS   replay this many hours of history on boot (default 48)
 *   SIM_ANOMALY_CHANCE   probability per tick of an injected excursion (default 0.04)
 */
import mqtt from 'mqtt';

const env = process.env;
const BASE_TOPIC = env.MQTT_BASE_TOPIC || 'ias';
const COMPANIES = (env.SIM_COMPANIES || 'PTAJ,PTBKN,PTSLP,PTHPS')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);
const INTERVAL_MS = Number(env.SIM_INTERVAL_MS || 5000);
const SNAPSHOT_EVERY = Number(env.SIM_SNAPSHOT_EVERY || 6);
const BACKFILL_HOURS = Number(env.SIM_BACKFILL_HOURS ?? 48);
const ANOMALY_CHANCE = Number(env.SIM_ANOMALY_CHANCE || 0.04);

// One baseline profile per company/site - each drifts independently so the
// dashboard shows genuinely different water-level behaviour per site.
const SITES = {
  PTAJ: { lat: -6.2762, lng: 107.1436, baseLevel: 2.6, baseFlow: 78, basePh: 7.2, baseTurbidity: 18, baseTds: 480, baseTemp: 29 },
  PTBKN: { lat: -6.0123, lng: 105.9987, baseLevel: 3.1, baseFlow: 62, basePh: 7.6, baseTurbidity: 12, baseTds: 640, baseTemp: 31 },
  PTSLP: { lat: -7.1543, lng: 112.6512, baseLevel: 3.4, baseFlow: 96, basePh: 7.0, baseTurbidity: 26, baseTds: 520, baseTemp: 33 },
  PTHPS: { lat: 3.6716, lng: 98.7412, baseLevel: 1.9, baseFlow: 44, basePh: 7.1, baseTurbidity: 9, baseTds: 310, baseTemp: 28 }
};

const DEFAULT_SITE = { lat: -6.2, lng: 106.8, baseLevel: 2.5, baseFlow: 70, basePh: 7.2, baseTurbidity: 15, baseTds: 450, baseTemp: 30 };

const state = new Map();

function siteState(code) {
  if (!state.has(code)) {
    const site = SITES[code] || DEFAULT_SITE;
    state.set(code, {
      site,
      level: site.baseLevel,
      flow: site.baseFlow,
      ph: site.basePh,
      turbidity: site.baseTurbidity,
      tds: site.baseTds,
      temp: site.baseTemp,
      intakeTotal: 10_000 + Math.random() * 5000,
      battery: 88 + Math.random() * 10,
      tick: 0
    });
  }
  return state.get(code);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const drift = (value, base, volatility, pull = 0.05) =>
  value + (base - value) * pull + (Math.random() - 0.5) * volatility;
const round = (value, digits = 2) => Number(value.toFixed(digits));

/**
 * Advance one site by a single tick. `hourOfDay` shapes the daily production
 * curve; industrial intake peaks during the day shift.
 */
function step(code, hourOfDay, allowAnomaly = true) {
  const s = siteState(code);
  const { site } = s;
  s.tick += 1;

  const shift = Math.sin(((hourOfDay - 6) / 24) * Math.PI * 2) * 0.5 + 0.5; // 0..1
  const demand = 0.7 + shift * 0.6;

  s.level = clamp(drift(s.level, site.baseLevel * (0.9 + shift * 0.2), 0.06), 0.2, 6);
  s.flow = clamp(drift(s.flow, site.baseFlow * demand, 4), 0, 200);
  s.ph = clamp(drift(s.ph, site.basePh, 0.06), 4, 11);
  s.turbidity = clamp(drift(s.turbidity, site.baseTurbidity * demand, 2), 0, 400);
  s.tds = clamp(drift(s.tds, site.baseTds * demand, 12), 50, 3000);
  s.temp = clamp(drift(s.temp, site.baseTemp + shift * 3, 0.4), 10, 60);
  s.battery = clamp(s.battery - 0.004 + (Math.random() < 0.002 ? 12 : 0), 5, 100);
  s.intakeTotal += (s.flow * INTERVAL_MS) / 3_600_000;

  let injected = null;
  if (allowAnomaly && Math.random() < ANOMALY_CHANCE) {
    const kinds = ['level-spike', 'ph-swing', 'turbidity-burst', 'overdraw', 'battery-drop'];
    injected = kinds[Math.floor(Math.random() * kinds.length)];
    if (injected === 'level-spike') s.level = clamp(s.level + 1.4 + Math.random(), 0, 6);
    if (injected === 'ph-swing') s.ph = Math.random() > 0.5 ? 9.6 : 5.4;
    if (injected === 'turbidity-burst') s.turbidity = 70 + Math.random() * 90;
    if (injected === 'overdraw') s.flow = 130 + Math.random() * 50;
    if (injected === 'battery-drop') s.battery = 8 + Math.random() * 8;
  }

  // A metre or two of GPS jitter around the intake point.
  const jitter = () => (Math.random() - 0.5) * 0.00025;

  return {
    payload: {
      ts: new Date().toISOString(),
      waterLevelM: round(s.level),
      flowRateM3h: round(s.flow, 1),
      ph: round(s.ph),
      turbidityNtu: round(s.turbidity, 1),
      tdsPpm: round(s.tds, 0),
      temperatureC: round(s.temp, 1),
      intakeTotalM3: round(s.intakeTotal, 2),
      lat: round(site.lat + jitter(), 6),
      lng: round(site.lng + jitter(), 6),
      speedKph: 0,
      battery: round(s.battery, 1),
      signal: Math.round(55 + Math.random() * 35)
    },
    injected
  };
}

/** Lightweight synthetic camera frame - an SVG data URL the browser renders directly. */
function makeFrame(code, deviceId) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const s = siteState(code);
  const waterY = 220 - clamp(s.level / 6, 0, 1) * 120;
  const noise = Array.from({ length: 26 }, () => {
    const x = Math.random() * 480;
    const y = waterY + Math.random() * (260 - waterY);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(Math.random() * 2.2).toFixed(
      1
    )}" fill="#ffffff" opacity="${(0.05 + Math.random() * 0.2).toFixed(2)}"/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2b3a4a"/><stop offset="100%" stop-color="#4a5d70"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2f6d84"/><stop offset="100%" stop-color="#12303d"/>
    </linearGradient>
  </defs>
  <rect width="480" height="270" fill="url(#sky)"/>
  <rect x="40" y="120" width="80" height="150" fill="#1f2a35"/>
  <rect x="150" y="90" width="52" height="180" fill="#243140"/>
  <rect x="330" y="110" width="110" height="160" fill="#1d2733"/>
  <rect x="0" y="${waterY}" width="480" height="${270 - waterY}" fill="url(#water)"/>
  ${noise}
  <rect x="212" y="60" width="14" height="${waterY - 60}" fill="#c9d6e2"/>
  <rect x="0" y="0" width="480" height="22" fill="#000" opacity="0.55"/>
  <text x="8" y="15" font-family="monospace" font-size="11" fill="#e6edf3">${deviceId} | CAM-FRONT</text>
  <text x="352" y="15" font-family="monospace" font-size="11" fill="#e6edf3">${now}</text>
  <rect x="0" y="248" width="480" height="22" fill="#000" opacity="0.55"/>
  <text x="8" y="263" font-family="monospace" font-size="11" fill="#9fe870">LEVEL ${s.level.toFixed(
    2
  )} m | FLOW ${s.flow.toFixed(1)} m3/h | pH ${s.ph.toFixed(2)}</text>
  <circle cx="466" cy="259" r="4" fill="#ff4d4f"/>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const options = { clientId: `ias-simulator-${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 5000 };
if (env.MQTT_USERNAME) {
  options.username = env.MQTT_USERNAME;
  options.password = env.MQTT_PASSWORD;
}

const client = mqtt.connect(env.MQTT_URL || 'mqtt://127.0.0.1:1883', options);
const log = (...args) => console.log(new Date().toISOString(), '[simulator]', ...args);

client.on('error', (err) => log('mqtt error:', err.message));
client.on('reconnect', () => log('reconnecting...'));

client.on('connect', async () => {
  log(`connected to ${env.MQTT_URL || 'mqtt://127.0.0.1:1883'}; sites: ${COMPANIES.join(', ')}`);

  // Listen for downlink commands so "request a frame" from the UI does something.
  client.subscribe(`${BASE_TOPIC}/+/+/cmd`, { qos: 1 });

  for (const code of COMPANIES) {
    client.publish(
      `${BASE_TOPIC}/${code}/FMC125-${code}-01/status`,
      JSON.stringify({ online: true, ts: new Date().toISOString() }),
      { qos: 1, retain: true }
    );
  }

  if (BACKFILL_HOURS > 0) await backfill();

  setInterval(tick, INTERVAL_MS);
  tick();
});

client.on('message', (topic, message) => {
  const [, code, deviceId, channel] = topic.split('/');
  if (channel !== 'cmd') return;

  let command = {};
  try {
    command = JSON.parse(message.toString());
  } catch {
    return;
  }
  log(`command "${command.command}" for ${deviceId}`);

  if (command.command === 'capture') {
    const camId = deviceId.startsWith('DUALCAM') ? deviceId : `DUALCAM-${code}-01`;
    client.publish(
      `${BASE_TOPIC}/${code}/${camId}/snapshot`,
      JSON.stringify({
        camera: 'front',
        mimeType: 'image/svg+xml',
        dataUrl: makeFrame(code, camId),
        ts: new Date().toISOString()
      }),
      { qos: 1 }
    );
  }
});

/** Replay history so the charts and reports have something to show immediately. */
async function backfill() {
  const points = BACKFILL_HOURS * 4; // one sample every 15 minutes
  log(`backfilling ${BACKFILL_HOURS}h (${points} points per site)...`);

  for (let i = points; i > 0; i -= 1) {
    const ts = new Date(Date.now() - i * 15 * 60_000);
    for (const code of COMPANIES) {
      const { payload } = step(code, ts.getHours(), Math.random() < 0.25);
      payload.ts = ts.toISOString();
      client.publish(
        `${BASE_TOPIC}/${code}/FMC125-${code}-01/telemetry`,
        JSON.stringify(payload),
        { qos: 0 }
      );
    }
    // Let the broker and the web service keep up with the replay.
    if (i % 40 === 0) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  log('backfill done');
}

let tickCount = 0;

function tick() {
  tickCount += 1;
  const hour = new Date().getHours();

  for (const code of COMPANIES) {
    const deviceId = `FMC125-${code}-01`;
    const { payload, injected } = step(code, hour);

    client.publish(`${BASE_TOPIC}/${code}/${deviceId}/telemetry`, JSON.stringify(payload), {
      qos: 1
    });
    if (injected) log(`${code}: injected ${injected}`);

    if (tickCount % SNAPSHOT_EVERY === 0) {
      const camId = `DUALCAM-${code}-01`;
      client.publish(
        `${BASE_TOPIC}/${code}/${camId}/snapshot`,
        JSON.stringify({
          camera: 'front',
          mimeType: 'image/svg+xml',
          dataUrl: makeFrame(code, camId),
          ts: new Date().toISOString()
        }),
        { qos: 0 }
      );
    }
  }
}

const shutdown = () => {
  log('shutting down');
  client.end(true, () => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
