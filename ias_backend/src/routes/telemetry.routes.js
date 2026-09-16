import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Reading, { METRICS } from '../models/Reading.js';
import Snapshot from '../models/Snapshot.js';
import Company from '../models/Company.js';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { authenticate } from '../middleware/auth.js';
import { ingestTelemetry } from '../services/ingest.service.js';

const router = Router();
router.use(authenticate);

const rangeFrom = (req) => {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(to.getTime() - 24 * 3600 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw HttpError.badRequest('Invalid from/to date');
  }
  if (from >= to) throw HttpError.badRequest('"from" must be earlier than "to"');
  return { from, to };
};

async function assertAccess(req, companyId) {
  const company = await Company.findById(companyId).lean();
  if (!company) throw HttpError.notFound('Company not found');
  if (!req.user.canAccessCompany(company._id)) throw HttpError.forbidden('No access to this site');
  return company;
}

/** Latest reading for a company - used to hydrate the dashboard on load. */
router.get(
  '/latest/:companyId',
  asyncHandler(async (req, res) => {
    await assertAccess(req, req.params.companyId);
    const reading = await Reading.findOne({ company: req.params.companyId })
      .sort({ ts: -1 })
      .lean();
    res.json(reading || null);
  })
);

/** Raw readings, newest first. */
router.get(
  '/:companyId',
  asyncHandler(async (req, res) => {
    await assertAccess(req, req.params.companyId);
    const { from, to } = rangeFrom(req);
    const limit = Math.min(Number(req.query.limit) || 500, 5000);

    const filter = { company: req.params.companyId, ts: { $gte: from, $lte: to } };
    if (req.query.deviceId) filter.deviceId = req.query.deviceId;

    const items = await Reading.find(filter).sort({ ts: -1 }).limit(limit).lean();
    res.json({ items, total: items.length, from, to });
  })
);

/** Down-sampled series for the charts. */
router.get(
  '/:companyId/series',
  asyncHandler(async (req, res) => {
    await assertAccess(req, req.params.companyId);
    const { from, to } = rangeFrom(req);

    const spanHours = (to - from) / 3_600_000;
    const bucketMinutes =
      Number(req.query.bucketMinutes) ||
      (spanHours <= 6 ? 5 : spanHours <= 48 ? 30 : spanHours <= 24 * 14 ? 180 : 720);

    const metrics = (req.query.metrics ? String(req.query.metrics).split(',') : METRICS).filter(
      (m) => METRICS.includes(m)
    );

    const group = { _id: { $dateTrunc: { date: '$ts', unit: 'minute', binSize: bucketMinutes } } };
    for (const metric of metrics) {
      group[metric] = { $avg: `$${metric}` };
      group[`${metric}_min`] = { $min: `$${metric}` };
      group[`${metric}_max`] = { $max: `$${metric}` };
    }
    group.samples = { $sum: 1 };

    const rows = await Reading.aggregate([
      {
        $match: {
          company: new mongoose.Types.ObjectId(req.params.companyId),
          ts: { $gte: from, $lte: to }
        }
      },
      { $group: group },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      from,
      to,
      bucketMinutes,
      metrics,
      points: rows.map((row) => {
        const point = { ts: row._id, samples: row.samples };
        for (const metric of metrics) {
          point[metric] = row[metric] != null ? Number(row[metric].toFixed(3)) : null;
          point[`${metric}_min`] = row[`${metric}_min`] ?? null;
          point[`${metric}_max`] = row[`${metric}_max`] ?? null;
        }
        return point;
      })
    });
  })
);

/** GPS breadcrumb trail for the sensor-location map. */
router.get(
  '/:companyId/track',
  asyncHandler(async (req, res) => {
    await assertAccess(req, req.params.companyId);
    const { from, to } = rangeFrom(req);

    const points = await Reading.find({
      company: req.params.companyId,
      ts: { $gte: from, $lte: to },
      'location.lat': { $ne: null }
    })
      .select('deviceId ts location speedKph')
      .sort({ ts: 1 })
      .limit(2000)
      .lean();

    res.json({ items: points, total: points.length });
  })
);

/** Latest CCTV frames for the monitor panel. */
router.get(
  '/:companyId/snapshots',
  asyncHandler(async (req, res) => {
    await assertAccess(req, req.params.companyId);
    const limit = Math.min(Number(req.query.limit) || 8, 50);
    const filter = { company: req.params.companyId };
    if (req.query.camera) filter.camera = req.query.camera;

    const items = await Snapshot.find(filter).sort({ ts: -1 }).limit(limit).lean();
    res.json({ items, total: items.length });
  })
);

/**
 * HTTP ingest fallback for devices or gateways that cannot reach the broker.
 * Same pipeline as MQTT, so anomaly detection and fan-out still apply.
 */
const ingestSchema = z.object({
  company: z.string().min(2),
  deviceId: z.string().min(1),
  ts: z.coerce.date().optional()
}).passthrough();

router.post(
  '/ingest',
  asyncHandler(async (req, res) => {
    const payload = ingestSchema.parse(req.body);
    const result = await ingestTelemetry({
      companyCode: payload.company,
      deviceId: payload.deviceId,
      payload,
      source: 'api'
    });
    if (!result) throw HttpError.badRequest('Unknown company code or device');
    res.status(201).json(result);
  })
);

export default router;
