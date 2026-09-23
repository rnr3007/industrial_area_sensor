import { Router } from 'express';
import mongoose from 'mongoose';
import { getState } from '../state.js';
import { authenticate } from '../middleware/auth.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  const state = getState();
  res.json({
    status: 'ok',
    mongo: { connected: mongoose.connection.readyState === 1 },
    esp32: { connected: state.linkConnected },
    time: new Date().toISOString()
  });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);

// Readable by any authenticated role - this dashboard is monitoring-only,
// there is nothing to control (unlike the rubber dam prototype).
router.get('/state', authenticate, (_req, res) => {
  const state = getState();
  res.json({
    linkConnected: state.linkConnected,
    lastSeenAt: state.lastSeenAt,
    reading: state.reading
  });
});

router.get('/logs', authenticate, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const state = getState();
  res.json({ items: state.logs.slice(-limit) });
});

export default router;
