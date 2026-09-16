import { Router } from 'express';
import Company from '../models/Company.js';
import Device from '../models/Device.js';
import Alert from '../models/Alert.js';
import Reading from '../models/Reading.js';
import { asyncHandler } from '../utils/http-error.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

/** Top-of-dashboard counters across every site the user can see. */
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const companyFilter = {};
    if (req.user.role !== 'admin' && req.user.companies?.length) {
      companyFilter._id = { $in: req.user.companies };
    }

    const companies = await Company.find(companyFilter).select('_id name code location').lean();
    const ids = companies.map((c) => c._id);

    const [deviceStats, alertRows, readingsToday] = await Promise.all([
      Device.aggregate([
        { $match: { company: { $in: ids }, active: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            online: { $sum: { $cond: ['$online', 1, 0] } }
          }
        }
      ]),
      Alert.aggregate([
        { $match: { company: { $in: ids }, status: 'open' } },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      Reading.countDocuments({
        company: { $in: ids },
        ts: { $gte: new Date(Date.now() - 86_400_000) }
      })
    ]);

    const bySeverity = { info: 0, warning: 0, critical: 0 };
    for (const row of alertRows) bySeverity[row._id] = row.count;

    res.json({
      companies: companies.length,
      devices: deviceStats[0] || { total: 0, online: 0 },
      openAlerts: bySeverity.info + bySeverity.warning + bySeverity.critical,
      alertsBySeverity: bySeverity,
      readings24h: readingsToday
    });
  })
);

/** One pin per site for the map, with its live status colour. */
router.get(
  '/map',
  asyncHandler(async (req, res) => {
    const companyFilter = { active: true };
    if (req.user.role !== 'admin' && req.user.companies?.length) {
      companyFilter._id = { $in: req.user.companies };
    }

    const companies = await Company.find(companyFilter)
      .select('name code location geofenceRadiusM city')
      .lean();
    const ids = companies.map((c) => c._id);

    const [devices, alerts] = await Promise.all([
      Device.find({ company: { $in: ids }, active: true })
        .select('deviceId name type company location online lastSeenAt battery')
        .lean(),
      Alert.aggregate([
        { $match: { company: { $in: ids }, status: 'open' } },
        { $group: { _id: { company: '$company', severity: '$severity' }, count: { $sum: 1 } } }
      ])
    ]);

    const severityBy = new Map();
    for (const row of alerts) {
      const key = String(row._id.company);
      const current = severityBy.get(key) || { info: 0, warning: 0, critical: 0 };
      current[row._id.severity] = row.count;
      severityBy.set(key, current);
    }

    res.json({
      companies: companies.map((company) => {
        const sev = severityBy.get(String(company._id)) || { info: 0, warning: 0, critical: 0 };
        return {
          ...company,
          alerts: sev,
          status: sev.critical ? 'critical' : sev.warning ? 'warning' : 'normal'
        };
      }),
      devices
    });
  })
);

export default router;
