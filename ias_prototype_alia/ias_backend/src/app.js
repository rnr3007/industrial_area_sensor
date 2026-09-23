import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import config from './config/index.js';
import routes from './routes/index.js';
import dataRoutes from './routes/data.routes.js';
import logger from './utils/logger.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.cors.origins.includes('*') || config.cors.origins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true
    })
  );
  app.use(compression());
  app.use(express.json());

  if (config.env !== 'test') {
    app.use(
      morgan(':method :url :status :res[content-length]b - :response-time ms', {
        stream: { write: (line) => logger.info(line.trim()) }
      })
    );
  }

  app.use('/api', routes);
  // Device-facing, not browser-facing - deliberately outside /api and its
  // operator-JWT expectations. Guarded by X-Device-Key instead.
  app.use('/data', dataRoutes);
  app.get('/', (_req, res) =>
    res.json({ service: 'alia-prototype-backend', version: '1.0.0', docs: '/api/health' })
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
