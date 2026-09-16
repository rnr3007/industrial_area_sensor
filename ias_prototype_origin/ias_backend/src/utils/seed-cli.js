import { connectDb, disconnectDb } from '../config/db.js';
import { seed } from './seed.js';
import logger from './logger.js';

await connectDb();
await seed();
await disconnectDb();
logger.info('Seed complete');
process.exit(0);
