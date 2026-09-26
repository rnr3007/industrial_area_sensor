import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { getState } from '../state.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import Reading from '../models/Reading.js';
import ActivityLog from '../models/ActivityLog.js';
import { asyncHandler } from '../utils/http-error.js';

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

// Durable counterpart to /logs above - that one is the in-memory snapshot
// used for the live dashboard/socket bootstrap (fast, but capped and lost
// on every restart); this reads the activity_logs collection (see
// models/ActivityLog.js), so history survives restarts and isn't bounded
// by LOG_HISTORY_SIZE.
router.get(
  '/activity-logs',
  authenticate,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = await ActivityLog.find().sort({ time: -1 }).limit(limit);
    res.json({ items: items.reverse() });
  })
);

// Durable history behind POST /data - every reading the device has ever
// pushed (up to the 30-day TTL - see models/Reading.js), not just what's in
// this session's in-memory state.
const readingsQuerySchema = z.object({
  // Used by the dashboard's date-range export - both bounds are optional
  // but typically sent together as the day's start/end in ISO form.
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // Used by the plain "latest N" case (no from/to) - capped well below the
  // date-range case's cap since that's meant for an at-a-glance read, not
  // an export.
  limit: z.coerce.number().int().positive().optional()
});

const EXPORT_ROW_CAP = 50000;

// Wider ranges are downsampled server-side so a response never has to carry
// a full 30-day-at-1Hz history (~2.6M rows) over the wire:
//   span <  2h  -> every raw reading, unchanged
//   span <= 24h -> averaged into 15-minute buckets
//   span >  24h -> averaged into 1-hour buckets
function pickBucket(spanHours) {
  if (spanHours > 24) return { unit: 'hour', binSize: 1 };
  if (spanHours >= 2) return { unit: 'minute', binSize: 15 };
  return null;
}

router.get(
  '/readings',
  authenticate,
  validate(readingsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { from, to, limit } = req.query;

    if (from || to) {
      const filter = {};
      if (from) filter.ts = { ...filter.ts, $gte: new Date(from) };
      if (to) filter.ts = { ...filter.ts, $lte: new Date(to) };

      const spanHours = from && to ? (new Date(to) - new Date(from)) / (1000 * 60 * 60) : 0;
      const bucket = pickBucket(spanHours);

      if (bucket) {
        // currentMA/flowRate/flowLpm/flowLps are instantaneous readings, so
        // averaging them per bucket is correct. totalLiters/totalM3 are
        // running counters (cumulative since the device booted), so the
        // bucket's LAST value is used instead - averaging a running total
        // would produce a meaningless number.
        const items = await Reading.aggregate([
          { $match: filter },
          { $sort: { ts: 1 } },
          {
            $group: {
              _id: { $dateTrunc: { date: '$ts', unit: bucket.unit, binSize: bucket.binSize } },
              currentMA: { $avg: '$currentMA' },
              flowRate: { $avg: '$flowRate' },
              flowLpm: { $avg: '$flowLpm' },
              flowLps: { $avg: '$flowLps' },
              totalLiters: { $last: '$totalLiters' },
              totalM3: { $last: '$totalM3' },
              status: { $last: '$status' },
              sampleCount: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          { $limit: EXPORT_ROW_CAP },
          {
            $project: {
              _id: 0,
              ts: '$_id',
              currentMA: { $round: ['$currentMA', 2] },
              flowRate: { $round: ['$flowRate', 3] },
              flowLpm: { $round: ['$flowLpm', 3] },
              flowLps: { $round: ['$flowLps', 3] },
              totalLiters: { $round: ['$totalLiters', 2] },
              totalM3: { $round: ['$totalM3', 3] },
              status: 1,
              sampleCount: 1
            }
          }
        ]);
        return res.json({ items, bucket: `${bucket.binSize}${bucket.unit === 'hour' ? 'h' : 'm'}` });
      }

      // < 2 hours (or no explicit range) - complete/raw data, chronological.
      const items = await Reading.find(filter).sort({ ts: 1 }).limit(EXPORT_ROW_CAP);
      return res.json({ items, bucket: null });
    }

    const cappedLimit = Math.min(limit || 100, 1000);
    const items = await Reading.find().sort({ ts: -1 }).limit(cappedLimit);
    res.json({ items, bucket: null });
  })
);

export default router;
