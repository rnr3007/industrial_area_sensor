import config from './config/index.js';

/**
 * Last-known reading from the ESP32's /data endpoint, plus a rolling
 * activity log. The ESP32 (or, locally, the simulator standing in for it)
 * is the source of truth; this backend only polls it and relays what comes
 * back over REST/WebSocket - it never fabricates flow data itself.
 */
const state = {
  linkConnected: false, // whether the last poll to the ESP32 succeeded
  lastSeenAt: null,
  reading: null, // { currentMA, flowRate, totalLiters, flowLpm, flowLps, totalM3, status, ts }
  logs: []
};

export function setLinkConnected(connected) {
  state.linkConnected = connected;
}

export function setReading(reading) {
  state.reading = reading;
  state.lastSeenAt = new Date().toISOString();
}

export function pushLog(entry) {
  state.logs.push(entry);
  if (state.logs.length > config.logHistorySize) state.logs.shift();
}

export function getState() {
  return state;
}

export default state;
