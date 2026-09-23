import http from 'node:http';
import config from './config/index.js';
import logger from './utils/logger.js';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { initRealtime } from './services/realtime.service.js';
import { startLinkWatchdog, stopLinkWatchdog } from './services/esp32.service.js';
import { seedAdmin } from './store/users.store.js';

async function bootstrap() {
  await connectDb();
  await seedAdmin();

  const app = createApp();
  const server = http.createServer(app);

  initRealtime(server);
  startLinkWatchdog();

  server.listen(config.port, () => {
    logger.info(`Alia prototype backend listening on :${config.port} (${config.env})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    stopLinkWatchdog();
    await disconnectDb();
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
