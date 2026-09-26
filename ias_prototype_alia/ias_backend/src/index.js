import http from 'node:http';
import config from './config/index.js';
import logger from './utils/logger.js';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { initRealtime } from './services/realtime.service.js';
import { startLinkWatchdog, stopLinkWatchdog } from './services/esp32.service.js';
import { seedAdmin } from './store/users.store.js';
import Reading from './models/Reading.js';
import ActivityLog from './models/ActivityLog.js';

async function bootstrap() {
  await connectDb();
  await seedAdmin();
  // Keeps the DB's actual index in sync with the schema - in particular,
  // this is what applies/updates the 30-day TTL on Reading.ts/ActivityLog.time
  // if it was added after the index already existed (a plain createIndexes()
  // call can't alter an existing index's options, only add missing indexes).
  await Reading.syncIndexes();
  await ActivityLog.syncIndexes();

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
