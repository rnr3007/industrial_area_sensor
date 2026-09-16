import mqtt from 'mqtt';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { ingestTelemetry, ingestSnapshot, handleDeviceStatus } from './ingest.service.js';

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
    const topics = [
      `${base()}/+/+/telemetry`,
      `${base()}/+/+/snapshot`,
      `${base()}/+/+/status`
    ];
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) logger.error(`MQTT subscribe failed: ${err.message}`);
      else logger.info(`MQTT subscribed: ${topics.join(', ')}`);
    });
  });

  client.on('reconnect', () => logger.warn('MQTT reconnecting...'));
  client.on('error', (err) => logger.error(`MQTT error: ${err.message}`));
  client.on('close', () => logger.warn('MQTT connection closed'));

  client.on('message', async (topic, message) => {
    try {
      // ias/<companyCode>/<deviceId>/<channel>
      const [root, companyCode, deviceId, channel] = topic.split('/');
      if (root !== base() || !companyCode || !deviceId || !channel) return;

      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch {
        logger.warn(`MQTT payload on ${topic} is not JSON - dropped`);
        return;
      }

      if (channel === 'telemetry') {
        await ingestTelemetry({ companyCode, deviceId, payload, source: 'mqtt' });
      } else if (channel === 'snapshot') {
        await ingestSnapshot({
          companyCode,
          deviceId,
          camera: payload.camera,
          dataUrl: payload.dataUrl ?? payload.image,
          mimeType: payload.mimeType
        });
      } else if (channel === 'status') {
        await handleDeviceStatus({ companyCode, deviceId, payload });
      }
    } catch (err) {
      logger.error(`MQTT message handling failed on ${topic}: ${err.message}`);
    }
  });

  return client;
}

/** Send a command down to a device (e.g. request a fresh camera frame). */
export function publishCommand(companyCode, deviceId, command) {
  if (!client?.connected) throw new Error('MQTT broker is not connected');
  const topic = `${base()}/${String(companyCode).toUpperCase()}/${deviceId}/cmd`;
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
