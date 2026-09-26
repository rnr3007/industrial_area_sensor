/**
 * Processes readings pushed by the ESP32 (POST /data, see
 * routes/data.routes.js) and watches for the device going quiet.
 *
 * The device is the client here, not us - it posts once per sample
 * (matching its own SAMPLE_INTERVAL_MS) to this backend, the same way it
 * used to serve its own dashboard's fetch('/data') calls, just inverted.
 * There is no MQTT, and this service no longer initiates any outbound
 * request to the device - see routes/data.routes.js for the inbound side.
 *
 * Request body shape (unchanged from the firmware's original /data
 * response, now sent as the POST body instead):
 *   {"currentMA": 12.34, "flowRate": 87.500, "totalLiters": 1234.56}
 */
import config from '../config/index.js';
import { setLinkConnected, setReading, pushLog } from '../state.js';
import { emitReading, emitLog, emitLinkStatus } from './realtime.service.js';
import Reading from '../models/Reading.js';
import ActivityLog from '../models/ActivityLog.js';
import logger from '../utils/logger.js';

let watchdogTimer = null;
let lastStatus = null; // 'RUN' | 'IDLE' | 'OVER'
let lastReceivedAt = 0;

function classify(currentMA) {
  if (currentMA < config.flow.idleBelowMa) return 'IDLE';
  if (currentMA > config.flow.overAboveMa) return 'OVER';
  return 'RUN';
}

// Raw ISO, not a pre-formatted string - this runs inside a container whose
// system clock is UTC (no TZ set), so formatting "now" here would bake the
// server's UTC time into the log line regardless of who's actually viewing
// the dashboard. ActivityLog.vue formats this into the viewer's own local
// timezone at render time instead, via new Date(l.time) + fmtTimestamp().
function log(type, message) {
  const entry = { time: new Date().toISOString(), type, message };
  pushLog(entry);
  emitLog(entry);

  // Fire-and-forget, same pattern as processReading()'s Reading.create()
  // below - the live in-memory log/socket push above already happened, so
  // a slow or failed write here shouldn't hold up anything. Uses the plain
  // file/console logger (not log() itself) to report a failure, since
  // calling back into log() here could recurse if Mongo stays down.
  ActivityLog.create({ type, message }).catch((err) => {
    logger.error(`Failed to store activity log entry: ${err.message}`);
  });
}

/** Called by the /data route for every reading the device pushes. */
export function processReading({ currentMA, flowRate, totalLiters }) {
  const status = classify(currentMA);
  const reading = {
    currentMA: Number(currentMA.toFixed(2)),
    flowRate: Number(flowRate.toFixed(3)),
    flowLpm: Number(((flowRate * 1000) / 60).toFixed(3)),
    flowLps: Number(((flowRate * 1000) / 3600).toFixed(3)),
    totalLiters: Number(totalLiters.toFixed(2)),
    totalM3: Number((totalLiters / 1000).toFixed(3)),
    status,
    ts: new Date().toISOString()
  };

  const wasDown = lastReceivedAt === 0;
  lastReceivedAt = Date.now();

  setReading(reading);
  emitReading(reading);

  // Fire-and-forget: the device gets its ack and connected browsers get the
  // live update regardless of Mongo latency/availability. A write failure
  // is surfaced as an activity-log entry rather than failing the request -
  // losing one row of history shouldn't make the device think POST /data
  // itself is broken.
  // `ts` is left out here so Mongoose's own `timestamps` option stamps it,
  // rather than relying on the plugin's undocumented handling of a
  // pre-supplied value.
  const { ts: _ts, ...readingFields } = reading;
  Reading.create(readingFields).catch((err) => {
    log('danger', `Device: failed to store reading - ${err.message}`);
  });

  if (wasDown) {
    setLinkConnected(true);
    emitLinkStatus(true);
    log('success', 'Device:  link established');
  }

  if (lastStatus !== status) {
    if (status === 'IDLE') log('warn', `Device:  no signal (${reading.currentMA} mA) -> IDLE`);
    else if (status === 'OVER') log('warn', `Device:  over range (${reading.currentMA} mA) -> OVER`);
    else log('success', `Device:  flow ${reading.flowRate} m3/h -> RUN`);
  }
  lastStatus = status;

  return reading;
}

/** Marks the link down if nothing has arrived within the timeout window. */
function checkStaleness() {
  if (lastReceivedAt === 0) return; // never connected yet - nothing to time out
  const silentFor = Date.now() - lastReceivedAt;
  if (silentFor > config.device.linkTimeoutMs) {
    setLinkConnected(false);
    emitLinkStatus(false);
    log('danger', `Device:  no data for ${Math.round(silentFor / 1000)}s - link considered down`);
    lastReceivedAt = 0; // so the next reading logs "link established" again
    lastStatus = null;
  }
}

export function startLinkWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(checkStaleness, Math.max(1000, config.device.linkTimeoutMs / 2));
}

export function stopLinkWatchdog() {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = null;
}
