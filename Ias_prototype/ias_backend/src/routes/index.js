import { Router } from 'express';
import mongoose from 'mongoose';
import { getState } from '../state.js';
import { mqttStatus } from '../services/mqtt.service.js';
import { authenticate } from '../middleware/auth.js';
import controlRoutes from './control.routes.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mongo: { connected: mongoose.connection.readyState === 1 },
    mqtt: mqttStatus(),
    time: new Date().toISOString()
  });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);

// Readable by any authenticated role, including guest_operator.
router.get('/state', authenticate, (_req, res) => {
  const state = getState();
  res.json({
    connected: state.connected,
    deviceOnline: state.deviceOnline,
    lastSeenAt: state.lastSeenAt,
    telemetry: state.telemetry
  });
});

router.get('/logs', authenticate, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const state = getState();
  res.json({ items: state.logs.slice(-limit) });
});

router.use('/control', controlRoutes);

export default router;
