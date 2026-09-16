import http from 'node:http';
import config from './config/index.js';
import logger from './utils/logger.js';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { initRealtime } from './services/realtime.service.js';
import { initMqtt, closeMqtt } from './services/mqtt.service.js';
import { startTcpService, stopTcpService } from './services/tcp.service.js';
import { sweepOfflineDevices } from './services/anomaly.service.js';
import { seed } from './utils/seed.js';

let offlineSweepTimer = null;

async function bootstrap() {
  await connectDb();

  if (config.seed.enabled) {
    await seed();
  }

  const app = createApp();
  const server = http.createServer(app);

  initRealtime(server);
  initMqtt();
  startTcpService();

  // Devices that go quiet must still raise an alarm, so poll independently of
  // the ingest path.
  offlineSweepTimer = setInterval(() => {
    sweepOfflineDevices().catch((err) => logger.error(`offline sweep failed: ${err.message}`));
  }, 60_000);

  server.listen(config.port, () => {
    logger.info(`IAS web service listening on :${config.port} (${config.env})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    clearInterval(offlineSweepTimer);
    server.close();
    await Promise.allSettled([closeMqtt(), stopTcpService(), disconnectDb()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason?.stack || reason}`);
});

bootstrap().catch((err) => {
  logger.error(`Startup failed: ${err.stack || err.message}`);
  process.exit(1);
});
