import { Router } from 'express';
import { z } from 'zod';
import Company from '../models/Company.js';
import Device from '../models/Device.js';
import Reading from '../models/Reading.js';
import Alert from '../models/Alert.js';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { invalidateCompanyCache } from '../services/ingest.service.js';
import { METRIC_LABELS } from '../models/Reading.js';

const router = Router();
router.use(authenticate);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

const waterIntakeSchema = z.object({
  sourceType: z.enum(['river', 'groundwater', 'reservoir', 'municipal', 'sea', 'other']).optional(),
  permitNumber: z.string().optional(),
  permitExpiry: z.coerce.date().nullable().optional(),
  quotaM3PerDay: z.number().min(0).optional(),
  pipeDiameterMm: z.number().min(0).optional(),
  notes: z.string().optional()
});

const thresholdsSchema = z.object({
  waterLevelMin: z.number().optional(),
  waterLevelMax: z.number().optional(),
  flowRateMax: z.number().optional(),
  phMin: z.number().optional(),
  phMax: z.number().optional(),
  turbidityMax: z.number().optional(),
  tdsMax: z.number().optional(),
  temperatureMax: z.number().optional(),
  offlineAfterMinutes: z.number().min(1).optional()
});

const createSchema = z.object({
  name: z.string().min(2),
  code: z.string().regex(/^[A-Za-z0-9_-]{2,20}$/, 'code must be 2-20 chars of A-Z, 0-9, _ or -'),
  industry: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().or(z.literal('')).optional(),
  contactPhone: z.string().optional(),
  location: locationSchema,
  geofenceRadiusM: z.number().min(10).max(50000).optional(),
  waterIntake: waterIntakeSchema.optional(),
  thresholds: thresholdsSchema.optional(),
  active: z.boolean().optional()
});

const updateSchema = createSchema.partial();

/**
 * Environment status derived from the latest reading + open alerts.
 * Drives the colour badge in the company list and on the map.
 */
function deriveEnvironmentStatus(company, reading, openAlerts) {
  if (!reading) return { level: 'unknown', label: 'No data', reasons: ['No telemetry received yet'] };

  const critical = openAlerts.filter((a) => a.severity === 'critical');
  const warnings = openAlerts.filter((a) => a.severity === 'warning');

  const stale =
    Date.now() - new Date(reading.ts).getTime() >
    (company.thresholds?.offlineAfterMinutes ?? 15) * 60_000;

  if (critical.length) {
    return { level: 'critical', label: 'Critical', reasons: critical.slice(0, 3).map((a) => a.message) };
  }
  if (stale) {
    return { level: 'critical', label: 'Offline', reasons: ['Telemetry is stale'] };
  }
  if (warnings.length) {
    return { level: 'warning', label: 'Warning', reasons: warnings.slice(0, 3).map((a) => a.message) };
  }
  return { level: 'normal', label: 'Normal', reasons: ['All monitored parameters within limits'] };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q = '', active, withStatus = 'true' } = req.query;
    const filter = {};
    if (q) {
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { code: new RegExp(q, 'i') },
        { city: new RegExp(q, 'i') }
      ];
    }
    if (active !== undefined) filter.active = active === 'true';
    if (req.user.role !== 'admin' && req.user.companies?.length) {
      filter._id = { $in: req.user.companies };
    }

    const companies = await Company.find(filter).sort({ name: 1 }).lean();
    if (withStatus !== 'true') return res.json({ items: companies, total: companies.length });

    const ids = companies.map((c) => c._id);
    const [latestReadings, openAlerts, deviceCounts] = await Promise.all([
      Reading.aggregate([
        { $match: { company: { $in: ids } } },
        { $sort: { ts: -1 } },
        { $group: { _id: '$company', reading: { $first: '$$ROOT' } } }
      ]),
      Alert.find({ company: { $in: ids }, status: 'open' }).sort({ ts: -1 }).lean(),
      Device.aggregate([
        { $match: { company: { $in: ids }, active: true } },
        {
          $group: {
            _id: '$company',
            total: { $sum: 1 },
            online: { $sum: { $cond: ['$online', 1, 0] } }
          }
        }
      ])
    ]);

    const readingBy = new Map(latestReadings.map((r) => [String(r._id), r.reading]));
    const devicesBy = new Map(deviceCounts.map((d) => [String(d._id), d]));
    const alertsBy = new Map();
    for (const alert of openAlerts) {
      const key = String(alert.company);
      if (!alertsBy.has(key)) alertsBy.set(key, []);
      alertsBy.get(key).push(alert);
    }

    const items = companies.map((company) => {
      const key = String(company._id);
      const reading = readingBy.get(key) || null;
      const alerts = alertsBy.get(key) || [];
      return {
        ...company,
        latestReading: reading,
        openAlerts: alerts.length,
        criticalAlerts: alerts.filter((a) => a.severity === 'critical').length,
        devices: devicesBy.get(key) || { total: 0, online: 0 },
        environmentStatus: deriveEnvironmentStatus(company, reading, alerts)
      };
    });

    res.json({ items, total: items.length });
  })
);

router.post(
  '/',
  authorize('admin', 'operator'),
  validate(createSchema),
  audit('company.create', 'company'),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body, code: req.body.code.toUpperCase() };
    const exists = await Company.findOne({ code: payload.code });
    if (exists) throw HttpError.conflict(`Company code ${payload.code} is already in use`);

    const company = await Company.create(payload);
    invalidateCompanyCache(company.code);

    res.locals.auditResourceId = company._id;
    res.locals.auditMeta = { name: company.name, code: company.code };
    res.status(201).json(company.toJSON());
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.params.id).lean();
    if (!company) throw HttpError.notFound('Company not found');
    if (!req.user.canAccessCompany(company._id)) throw HttpError.forbidden('No access to this site');

    const [devices, latestReading, openAlerts, last24h] = await Promise.all([
      Device.find({ company: company._id }).sort({ name: 1 }).lean(),
      Reading.findOne({ company: company._id }).sort({ ts: -1 }).lean(),
      Alert.find({ company: company._id, status: 'open' }).sort({ ts: -1 }).limit(20).lean(),
      Reading.aggregate([
        { $match: { company: company._id, ts: { $gte: new Date(Date.now() - 86_400_000) } } },
        {
          $group: {
            _id: null,
            samples: { $sum: 1 },
            avgLevel: { $avg: '$waterLevelM' },
            avgFlow: { $avg: '$flowRateM3h' },
            minIntake: { $min: '$intakeTotalM3' },
            maxIntake: { $max: '$intakeTotalM3' }
          }
        }
      ])
    ]);

    const stats = last24h[0] || {};
    const intake24h =
      stats.maxIntake != null && stats.minIntake != null
        ? Number((stats.maxIntake - stats.minIntake).toFixed(2))
        : null;

    res.json({
      ...company,
      devices,
      latestReading,
      openAlerts,
      environmentStatus: deriveEnvironmentStatus(company, latestReading, openAlerts),
      waterIntakeStats: {
        last24hM3: intake24h,
        quotaM3PerDay: company.waterIntake?.quotaM3PerDay ?? 0,
        quotaUsagePct:
          intake24h != null && company.waterIntake?.quotaM3PerDay
            ? Number(((intake24h / company.waterIntake.quotaM3PerDay) * 100).toFixed(1))
            : null,
        avgFlowM3h: stats.avgFlow != null ? Number(stats.avgFlow.toFixed(2)) : null,
        avgLevelM: stats.avgLevel != null ? Number(stats.avgLevel.toFixed(2)) : null,
        samples24h: stats.samples ?? 0
      },
      metricLabels: METRIC_LABELS
    });
  })
);

router.put(
  '/:id',
  authorize('admin', 'operator'),
  validate(updateSchema),
  audit('company.update', 'company'),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.params.id);
    if (!company) throw HttpError.notFound('Company not found');

    const previousCode = company.code;
    const payload = { ...req.body };
    if (payload.code) payload.code = payload.code.toUpperCase();

    // Nested objects are patched, not replaced, so a partial update keeps
    // thresholds the caller did not send.
    if (payload.waterIntake) {
      payload.waterIntake = { ...company.waterIntake?.toObject?.(), ...payload.waterIntake };
    }
    if (payload.thresholds) {
      payload.thresholds = { ...company.thresholds?.toObject?.(), ...payload.thresholds };
    }

    Object.assign(company, payload);
    await company.save();
    invalidateCompanyCache(previousCode);
    invalidateCompanyCache(company.code);

    res.locals.auditMeta = { name: company.name, fields: Object.keys(req.body) };
    res.json(company.toJSON());
  })
);

router.delete(
  '/:id',
  authorize('admin'),
  audit('company.delete', 'company'),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.params.id);
    if (!company) throw HttpError.notFound('Company not found');

    const deviceCount = await Device.countDocuments({ company: company._id });
    if (deviceCount > 0 && req.query.force !== 'true') {
      throw HttpError.conflict(
        `${deviceCount} device(s) are still assigned to this company. Re-assign them or pass force=true.`
      );
    }

    await Promise.all([
      Device.deleteMany({ company: company._id }),
      Reading.deleteMany({ company: company._id }),
      Alert.deleteMany({ company: company._id }),
      Company.deleteOne({ _id: company._id })
    ]);
    invalidateCompanyCache(company.code);

    res.locals.auditMeta = { name: company.name, code: company.code, devicesRemoved: deviceCount };
    res.json({ ok: true });
  })
);

export default router;
