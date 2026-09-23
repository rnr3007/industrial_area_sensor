import mongoose from 'mongoose';
import config from './index.js';
import logger from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
      logger.info(`MongoDB connected (${mongoose.connection.name})`);
      return mongoose.connection;
    } catch (err) {
      logger.warn(`MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  return null;
}

export async function disconnectDb() {
  await mongoose.connection.close();
}
