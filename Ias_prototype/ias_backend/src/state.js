import config from './config/index.js';

/**
 * Last-known snapshot of the rubber dam device, plus a rolling activity log.
 * The device (simulator or, eventually, real PLC) is the source of truth;
 * this backend only relays what it publishes over MQTT to REST/WebSocket
 * clients and never runs the physics itself.
 */
const state = {
  connected: false, // MQTT link to the broker
  deviceOnline: false, // last status heartbeat from the device
  lastSeenAt: null,
  telemetry: null, // full payload from the most recent telemetry message
  logs: []
};

export function setBrokerConnected(connected) {
  state.connected = connected;
}

export function setDeviceStatus(online) {
  state.deviceOnline = online;
  state.lastSeenAt = new Date().toISOString();
}

export function setTelemetry(payload) {
  state.telemetry = payload;
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
