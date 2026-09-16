/**
 * Rubber Dam device simulator (IAS prototype).
 *
 * Stands in for the real PLC/controller: owns the pressure/water-level/
 * compressor physics (ported 1:1 from the original client-side prototype,
 * see ias_prototype/Prototype.html) and publishes telemetry + activity-log
 * lines over MQTT so the prototype backend/frontend can be fully
 * network-driven instead of simulating state in the browser. Listens for
 * control commands on the same topic family a real device would.
 *
 * Env:
 *   MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD
 *   RUBBERDAM_BASE_TOPIC   topic root (default "rubberdam")
 *   RUBBERDAM_TICK_MS      telemetry period (default 1000)
 *
 * Topics (under RUBBERDAM_BASE_TOPIC):
 *   telemetry  - full state snapshot, published every tick
 *   log        - activity-log lines, published on state-changing events
 *   status     - {online} heartbeat, published on boot
 *   cmd        - inbound control commands (subscribed)
 *     {type:'mode', mode:'auto'|'manual'}
 *     {type:'compressor', on:boolean}      (manual mode only)
 *     {type:'deflate', active:boolean}     (manual mode only)
 *     {type:'threshold', min:number, max:number}
 */
import mqtt from 'mqtt';

const env = process.env;
const BASE_TOPIC = env.RUBBERDAM_BASE_TOPIC || 'rubberdam';
const TICK_MS = Number(env.RUBBERDAM_TICK_MS || 1000);

const state = {
  mode: 'auto',
  compressorOn: false,
  deflatingMode: false,
  maintainPressure: false,
  pressure: 3.2,
  waterLevel: 2.85,
  thresholdMin: 2.5,
  thresholdMax: 4.5,
  rubberStrength: 98.5,
  rubberHeight: 2.35
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Number(value.toFixed(digits));

const options = {
  clientId: `ias-rubberdam-sim-${Math.random().toString(16).slice(2, 8)}`,
  reconnectPeriod: 5000
};
if (env.MQTT_USERNAME) {
  options.username = env.MQTT_USERNAME;
  options.password = env.MQTT_PASSWORD;
}

const client = mqtt.connect(env.MQTT_URL || 'mqtt://127.0.0.1:1883', options);
const log = (...args) => console.log(new Date().toISOString(), '[rubberdam-sim]', ...args);

function publishLog(type, message) {
  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  client.publish(`${BASE_TOPIC}/log`, JSON.stringify({ time, type, message }), { qos: 1 });
}

function setMode(mode) {
  if (!['auto', 'manual'].includes(mode) || mode === state.mode) return;
  state.mode = mode;
  state.maintainPressure = false;
  if (mode === 'auto') state.deflatingMode = false;
  publishLog('info', 'Mode operasi: ' + (mode === 'auto' ? 'OTOMATIS' : 'MANUAL'));
  if (mode === 'auto') evaluateAutoLogic();
}

function manualCompressorOn() {
  if (state.mode !== 'manual' || state.deflatingMode || state.compressorOn) return;
  state.compressorOn = true;
  state.maintainPressure = false;
  publishLog('success', 'Kompresor dihidupkan (manual)');
}

function manualCompressorOff() {
  if (state.mode !== 'manual' || state.deflatingMode || !state.compressorOn) return;
  state.compressorOn = false;
  state.maintainPressure = true;
  publishLog('info', 'Kompresor dimatikan (manual)');
}

function setDeflate(active) {
  if (state.mode !== 'manual' || active === state.deflatingMode) return;
  state.deflatingMode = active;
  if (active) {
    state.compressorOn = false;
    state.maintainPressure = false;
    publishLog('warn', 'Mode susut rubber diaktifkan');
  } else {
    state.maintainPressure = true;
    publishLog('info', 'Mode susut rubber dihentikan');
  }
}

function setThreshold(min, max) {
  state.thresholdMin = min;
  state.thresholdMax = max;
  publishLog(
    'info',
    'Threshold: ON < ' + min.toFixed(1) + ' | OFF > ' + max.toFixed(1)
  );
}

function evaluateAutoLogic() {
  if (state.mode !== 'auto') return;
  if (state.pressure < state.thresholdMin && !state.compressorOn) {
    state.compressorOn = true;
    publishLog('warn', 'Auto: Tekanan rendah (' + state.pressure.toFixed(2) + ' Bar) -> Kompresor ON');
  } else if (state.pressure > state.thresholdMax && state.compressorOn) {
    state.compressorOn = false;
    publishLog('info', 'Auto: Tekanan tinggi (' + state.pressure.toFixed(2) + ' Bar) -> Kompresor OFF');
  }
}

function updatePhysics(dt) {
  state.waterLevel += (Math.random() - 0.38) * 0.04;
  state.waterLevel = clamp(state.waterLevel, 1.0, 3.0);

  if (!state.maintainPressure) {
    let dp = 0;
    if (state.deflatingMode) dp -= 0.35 * dt;
    else if (state.compressorOn) dp += 0.12 * dt;
    else dp -= 0.04 * dt;
    state.pressure = clamp(state.pressure + dp, 0.5, 6.5);
  }

  const minH = 1.0;
  const maxH = 3.8;
  state.rubberHeight = clamp(minH + ((state.pressure - 0.5) / 6.0) * (maxH - minH), minH, maxH);
  state.rubberStrength = Math.max(0, state.rubberStrength - 0.003 * dt);
}

function publishTelemetry() {
  client.publish(
    `${BASE_TOPIC}/telemetry`,
    JSON.stringify({
      ts: new Date().toISOString(),
      mode: state.mode,
      compressorOn: state.compressorOn,
      deflatingMode: state.deflatingMode,
      maintainPressure: state.maintainPressure,
      pressure: round(state.pressure),
      waterLevel: round(state.waterLevel),
      thresholdMin: round(state.thresholdMin, 1),
      thresholdMax: round(state.thresholdMax, 1),
      rubberStrength: round(state.rubberStrength, 1),
      rubberHeight: round(state.rubberHeight, 2)
    }),
    { qos: 0 }
  );
}

client.on('error', (err) => log('mqtt error:', err.message));
client.on('reconnect', () => log('reconnecting...'));

client.on('connect', () => {
  log(`connected to ${env.MQTT_URL || 'mqtt://127.0.0.1:1883'}; topic root: ${BASE_TOPIC}`);
  client.subscribe(`${BASE_TOPIC}/cmd`, { qos: 1 });
  client.publish(
    `${BASE_TOPIC}/status`,
    JSON.stringify({ online: true, ts: new Date().toISOString() }),
    { qos: 1, retain: true }
  );
  publishLog('info', 'Sistem Rubber Dam siap');
  publishLog(
    'info',
    'Threshold ON: ' + state.thresholdMin.toFixed(1) + ' Bar | OFF: ' + state.thresholdMax.toFixed(1) + ' Bar'
  );

  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min((now - lastTick) / 1000, 1);
    lastTick = now;

    updatePhysics(dt);
    if (state.mode === 'auto' && !state.deflatingMode) evaluateAutoLogic();
    publishTelemetry();
  }, TICK_MS);
});

client.on('message', (topic, message) => {
  if (topic !== `${BASE_TOPIC}/cmd`) return;

  let command;
  try {
    command = JSON.parse(message.toString());
  } catch {
    return;
  }
  log(`command received: ${JSON.stringify(command)}`);

  switch (command.type) {
    case 'mode':
      setMode(command.mode);
      break;
    case 'compressor':
      command.on ? manualCompressorOn() : manualCompressorOff();
      break;
    case 'deflate':
      setDeflate(Boolean(command.active));
      break;
    case 'threshold':
      if (Number.isFinite(command.min) && Number.isFinite(command.max) && command.min < command.max) {
        setThreshold(command.min, command.max);
      }
      break;
    default:
      log(`unknown command type: ${command.type}`);
  }
});

const shutdown = () => {
  log('shutting down');
  client.end(true, () => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
