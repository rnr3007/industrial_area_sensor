import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './auth.routes.js';
import userRoutes from './users.routes.js';
import companyRoutes from './companies.routes.js';
import deviceRoutes from './devices.routes.js';
import telemetryRoutes from './telemetry.routes.js';
import alertRoutes from './alerts.routes.js';
import auditRoutes from './audit.routes.js';
import reportRoutes from './reports.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import { mqttStatus } from '../services/mqtt.service.js';
import { tcpStatus } from '../services/tcp.service.js';

const router = Router();

router.get('/health', (_req, res) => {
  const mongoUp = mongoose.connection.readyState === 1;
  const mqtt = mqttStatus();
  res.status(mongoUp ? 200 : 503).json({
    status: mongoUp ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    mongo: { connected: mongoUp },
    mqtt,
    tcp: tcpStatus(),
    time: new Date().toISOString()
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/companies', companyRoutes);
router.use('/devices', deviceRoutes);
router.use('/telemetry', telemetryRoutes);
router.use('/alerts', alertRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
