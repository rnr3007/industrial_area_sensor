import mqtt from 'mqtt';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/http-error.js';
import { setBrokerConnected, setDeviceStatus, setTelemetry, pushLog } from '../state.js';
import {
  emitTelemetry,
  emitLog,
  emitDeviceStatus,
  emitBrokerStatus
} from './realtime.service.js';

let client = null;

const base = () => config.mqtt.baseTopic;

export function initMqtt() {
  const options = {
    clientId: config.mqtt.clientId,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10_000
  };
  if (config.mqtt.username) {
    options.username = config.mqtt.username;
    options.password = config.mqtt.password;
  }

  client = mqtt.connect(config.mqtt.url, options);

  client.on('connect', () => {
    logger.info(`MQTT connected to ${config.mqtt.url}`);
    setBrokerConnected(true);
    emitBrokerStatus(true);

    const topics = [`${base()}/telemetry`, `${base()}/log`, `${base()}/status`];
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) logger.error(`MQTT subscribe failed: ${err.message}`);
      else logger.info(`MQTT subscribed: ${topics.join(', ')}`);
    });
  });

  client.on('reconnect', () => logger.warn('MQTT reconnecting...'));
  client.on('error', (err) => logger.error(`MQTT error: ${err.message}`));
  client.on('close', () => {
    setBrokerConnected(false);
    emitBrokerStatus(false);
    logger.warn('MQTT connection closed');
  });

  client.on('message', (topic, message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      logger.warn(`MQTT payload on ${topic} is not JSON - dropped`);
      return;
    }

    if (topic === `${base()}/telemetry`) {
      setTelemetry(payload);
      emitTelemetry(payload);
    } else if (topic === `${base()}/log`) {
      pushLog(payload);
      emitLog(payload);
    } else if (topic === `${base()}/status`) {
      setDeviceStatus(Boolean(payload.online));
      emitDeviceStatus(Boolean(payload.online));
    }
  });

  return client;
}

/** Send a control command down to the device over the cmd topic. */
export function publishCommand(command) {
  if (!client?.connected) throw HttpError.serviceUnavailable('MQTT broker is not connected');
  const topic = `${base()}/cmd`;
  client.publish(topic, JSON.stringify(command), { qos: 1 });
  return topic;
}

export function mqttStatus() {
  return {
    url: config.mqtt.url,
    connected: Boolean(client?.connected)
  };
}

export function closeMqtt() {
  return new Promise((resolve) => {
    if (!client) return resolve();
    client.end(false, {}, resolve);
  });
}
