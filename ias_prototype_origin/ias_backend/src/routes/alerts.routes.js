import { Router } from 'express';
import { z } from 'zod';
import Alert from '../models/Alert.js';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { emitGlobal } from '../services/realtime.service.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { companyId, status, severity, type, from, to, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (companyId) filter.company = companyId;
    else if (req.user.role !== 'admin' && req.user.companies?.length) {
      filter.company = { $in: req.user.companies };
    }
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (type) filter.type = type;
    if (from || to) {
      filter.ts = {};
      if (from) filter.ts.$gte = new Date(from);
      if (to) filter.ts.$lte = new Date(to);
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [items, total, openCount] = await Promise.all([
      Alert.find(filter)
        .sort({ ts: -1 })
        .skip(skip)
        .limit(Math.min(Number(limit), 200))
        .populate('acknowledgedBy', 'name email')
        .lean(),
      Alert.countDocuments(filter),
      Alert.countDocuments({ ...filter, status: 'open' })
    ]);

    res.json({ items, total, openCount, page: Number(page), limit: Number(limit) });
  })
);

/** Counters for the dashboard alert strip. */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const match = {};
    if (req.query.companyId) match.company = req.query.companyId;

    const rows = await Alert.aggregate([
      { $match: { ...match, status: 'open' } },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);

    const bySeverity = { info: 0, warning: 0, critical: 0 };
    for (const row of rows) bySeverity[row._id] = row.count;

    const last24h = await Alert.countDocuments({
      ...match,
      ts: { $gte: new Date(Date.now() - 86_400_000) }
    });

    res.json({
      open: bySeverity.info + bySeverity.warning + bySeverity.critical,
      bySeverity,
      last24h
    });
  })
);

const ackSchema = z.object({ note: z.string().max(500).optional() });

router.post(
  '/:id/acknowledge',
  authorize('admin', 'operator'),
  validate(ackSchema),
  audit('alert.acknowledge', 'alert'),
  asyncHandler(async (req, res) => {
    const alert = await Alert.findById(req.params.id);
    if (!alert) throw HttpError.notFound('Alert not found');
    if (alert.status !== 'open') throw HttpError.badRequest(`Alert is already ${alert.status}`);

    alert.status = 'acknowledged';
    alert.acknowledgedBy = req.user._id;
    alert.acknowledgedAt = new Date();
    if (req.body.note) alert.note = req.body.note;
    await alert.save();

    emitGlobal('alert:update', alert.toJSON());
    res.locals.auditMeta = { message: alert.message, severity: alert.severity };
    res.json(alert.toJSON());
  })
);

router.post(
  '/:id/resolve',
  authorize('admin', 'operator'),
  validate(ackSchema),
  audit('alert.resolve', 'alert'),
  asyncHandler(async (req, res) => {
    const alert = await Alert.findById(req.params.id);
    if (!alert) throw HttpError.notFound('Alert not found');
    if (alert.status === 'resolved') throw HttpError.badRequest('Alert is already resolved');

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    if (!alert.acknowledgedBy) {
      alert.acknowledgedBy = req.user._id;
      alert.acknowledgedAt = new Date();
    }
    if (req.body.note) alert.note = req.body.note;
    await alert.save();

    emitGlobal('alert:update', alert.toJSON());
    res.locals.auditMeta = { message: alert.message, severity: alert.severity };
    res.json(alert.toJSON());
  })
);

export default router;
