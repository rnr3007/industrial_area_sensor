import net from 'node:net';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { ingestTelemetry, ingestSnapshot } from './ingest.service.js';

/**
 * DualCam / FMC125 TCP endpoint.
 *
 * The device opens a long-lived socket and streams newline-delimited JSON
 * frames. Anything the codec cannot parse is dropped rather than killing the
 * connection, because field units retry rather than resynchronise.
 *
 *   {"type":"telemetry","company":"PTAJ","deviceId":"FMC125-0001", ...}
 *   {"type":"snapshot","company":"PTAJ","deviceId":"FMC125-0001","camera":"front","dataUrl":"data:image/jpeg;base64,..."}
 */

let server = null;
const sockets = new Set();
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

function crc16(buffer) {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}

async function handleFrame(line, socket) {
  let frame;
  try {
    frame = JSON.parse(line);
  } catch {
    logger.warn(`TCP frame from ${socket.remoteAddress} is not JSON - dropped`);
    return;
  }

  // Optional integrity check: devices may append a CRC16/IBM of the payload.
  if (frame.crc !== undefined) {
    const { crc, ...body } = frame;
    const expected = crc16(Buffer.from(JSON.stringify(body)));
    if (Number(crc) !== expected) {
      logger.warn(`TCP frame CRC mismatch from ${socket.remoteAddress} - dropped`);
      socket.write(`${JSON.stringify({ ack: false, error: 'crc' })}\n`);
      return;
    }
  }

  const companyCode = frame.company ?? frame.companyCode;
  const { deviceId } = frame;

  if (frame.type === 'snapshot') {
    await ingestSnapshot({
      companyCode,
      deviceId,
      camera: frame.camera,
      dataUrl: frame.dataUrl ?? frame.image,
      mimeType: frame.mimeType
    });
  } else {
    await ingestTelemetry({ companyCode, deviceId, payload: frame, source: 'tcp' });
  }

  socket.write(`${JSON.stringify({ ack: true, ts: Date.now() })}\n`);
}

export function startTcpService() {
  if (!config.tcp.enabled) {
    logger.info('TCP service disabled');
    return null;
  }

  server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setKeepAlive(true, 30_000);
    logger.info(`TCP device connected: ${socket.remoteAddress}:${socket.remotePort}`);

    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > MAX_FRAME_BYTES) {
        logger.warn(`TCP buffer overflow from ${socket.remoteAddress} - resetting`);
        buffer = '';
        return;
      }

      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          try {
            await handleFrame(line, socket);
          } catch (err) {
            logger.error(`TCP frame handling failed: ${err.message}`);
          }
        }
        index = buffer.indexOf('\n');
      }
    });

    socket.on('error', (err) => logger.warn(`TCP socket error: ${err.message}`));
    socket.on('close', () => {
      sockets.delete(socket);
      logger.info(`TCP device disconnected: ${socket.remoteAddress}`);
    });
  });

  server.listen(config.tcp.port, () => {
    logger.info(`TCP DualCam service listening on :${config.tcp.port}`);
  });

  return server;
}

export function tcpStatus() {
  return { enabled: config.tcp.enabled, port: config.tcp.port, connections: sockets.size };
}

export function stopTcpService() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    for (const socket of sockets) socket.destroy();
    server.close(resolve);
  });
}
