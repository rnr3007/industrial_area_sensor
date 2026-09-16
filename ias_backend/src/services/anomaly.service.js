import Alert from '../models/Alert.js';
import Reading from '../models/Reading.js';
import Device from '../models/Device.js';
import Company from '../models/Company.js';
import { METRIC_LABELS } from '../models/Reading.js';
import { emitGlobal, emitToCompany } from './realtime.service.js';
import logger from '../utils/logger.js';

// Suppress repeats of the same alert signature for this long.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const recentAlerts = new Map();

function shouldEmit(signature) {
  const now = Date.now();
  const last = recentAlerts.get(signature);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  recentAlerts.set(signature, now);
  if (recentAlerts.size > 5000) {
    for (const [key, at] of recentAlerts) {
      if (now - at > DEDUPE_WINDOW_MS) recentAlerts.delete(key);
    }
  }
  return true;
}

const fmt = (metric, value) => {
  const meta = METRIC_LABELS[metric];
  if (!meta) return String(value);
  return `${Number(value).toFixed(2)}${meta.unit ? ` ${meta.unit}` : ''}`;
};

function severityFor(metric, value, limit, direction) {
  // 20% past the limit escalates the alert to critical.
  const span = Math.abs(limit) || 1;
  const overshoot = direction === 'high' ? (value - limit) / span : (limit - value) / span;
  return overshoot >= 0.2 ? 'critical' : 'warning';
}

const RULES = [
  { metric: 'waterLevelM', limit: 'waterLevelMax', direction: 'high' },
  { metric: 'waterLevelM', limit: 'waterLevelMin', direction: 'low' },
  { metric: 'flowRateM3h', limit: 'flowRateMax', direction: 'high' },
  { metric: 'ph', limit: 'phMax', direction: 'high' },
  { metric: 'ph', limit: 'phMin', direction: 'low' },
  { metric: 'turbidityNtu', limit: 'turbidityMax', direction: 'high' },
  { metric: 'tdsPpm', limit: 'tdsMax', direction: 'high' },
  { metric: 'temperatureC', limit: 'temperatureMax', direction: 'high' }
];

async function raise(company, reading, alertData) {
  const signature = [
    String(company._id),
    reading.deviceId,
    alertData.type,
    alertData.metric,
    alertData.severity
  ].join('|');
  if (!shouldEmit(signature)) return null;

  const alert = await Alert.create({
    company: company._id,
    companyName: company.name,
    deviceId: reading.deviceId,
    ts: reading.ts,
    ...alertData
  });

  const payload = alert.toJSON();
  emitGlobal('alert:new', payload);
  emitToCompany(String(company._id), 'alert:new', payload);
  logger.warn(`ALERT [${alert.severity}] ${company.name}/${reading.deviceId}: ${alert.message}`);
  return alert;
}

/**
 * Evaluate a freshly stored reading against the company thresholds and the
 * previous reading (rate of change). Returns the alerts that were raised.
 */
export async function evaluateReading(company, reading) {
  const alerts = [];
  const t = company.thresholds || {};

  for (const rule of RULES) {
    const value = reading[rule.metric];
    const limit = t[rule.limit];
    if (value === null || value === undefined || limit === null || limit === undefined) continue;

    const breached = rule.direction === 'high' ? value > limit : value < limit;
    if (!breached) continue;

    const meta = METRIC_LABELS[rule.metric];
    alerts.push(
      await raise(company, reading, {
        type: rule.direction === 'high' ? 'threshold-high' : 'threshold-low',
        severity: severityFor(rule.metric, value, limit, rule.direction),
        metric: rule.metric,
        value,
        threshold: limit,
        message: `${meta.label} ${fmt(rule.metric, value)} is ${
          rule.direction === 'high' ? 'above' : 'below'
        } the ${rule.direction === 'high' ? 'maximum' : 'minimum'} of ${fmt(rule.metric, limit)}`
      })
    );
  }

  // Rate of change on water level: a sudden jump usually means a burst pipe or
  // an unauthorised discharge, even when the absolute value is still in range.
  if (reading.waterLevelM !== null && reading.waterLevelM !== undefined) {
    const previous = await Reading.findOne({
      company: company._id,
      deviceId: reading.deviceId,
      _id: { $ne: reading._id },
      waterLevelM: { $ne: null }
    })
      .sort({ ts: -1 })
      .lean();

    if (previous) {
      const minutes = Math.abs(new Date(reading.ts) - new Date(previous.ts)) / 60000;
      const delta = reading.waterLevelM - previous.waterLevelM;
      if (minutes > 0 && minutes <= 30 && Math.abs(delta) >= 0.75) {
        alerts.push(
          await raise(company, reading, {
            type: 'rate-of-change',
            severity: Math.abs(delta) >= 1.5 ? 'critical' : 'warning',
            metric: 'waterLevelM',
            value: reading.waterLevelM,
            threshold: previous.waterLevelM,
            message: `Water level changed by ${delta > 0 ? '+' : ''}${delta.toFixed(
              2
            )} m in ${minutes.toFixed(1)} min`
          })
        );
      }
    }
  }

  if (reading.battery !== null && reading.battery !== undefined && reading.battery < 20) {
    alerts.push(
      await raise(company, reading, {
        type: 'low-battery',
        severity: reading.battery < 10 ? 'critical' : 'warning',
        metric: 'battery',
        value: reading.battery,
        threshold: 20,
        message: `Device battery at ${Math.round(reading.battery)}%`
      })
    );
  }

  // Geofence: the sensor pod should never leave its declared site.
  if (reading.location?.lat != null && reading.location?.lng != null && company.location) {
    const distance = haversineMeters(company.location, reading.location);
    const radius = company.geofenceRadiusM || 500;
    if (distance > radius) {
      alerts.push(
        await raise(company, reading, {
          type: 'geofence-exit',
          severity: 'critical',
          metric: 'location',
          value: Math.round(distance),
          threshold: radius,
          message: `Device is ${Math.round(distance)} m from the site (geofence ${radius} m)`
        })
      );
    }
  }

  return alerts.filter(Boolean);
}

export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Periodic sweep that flags devices which stopped reporting.
 */
export async function sweepOfflineDevices() {
  const companies = await Company.find({ active: true }).lean();
  const byId = new Map(companies.map((c) => [String(c._id), c]));
  const devices = await Device.find({ active: true });

  for (const device of devices) {
    const company = byId.get(String(device.company));
    if (!company) continue;

    const limitMinutes = company.thresholds?.offlineAfterMinutes ?? 15;
    const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
    const stale = !lastSeen || Date.now() - lastSeen > limitMinutes * 60000;

    if (stale && device.online) {
      device.online = false;
      await device.save();
      emitGlobal('device:status', { deviceId: device.deviceId, online: false });
      await raise(company, { deviceId: device.deviceId, ts: new Date() }, {
        type: 'device-offline',
        severity: 'critical',
        metric: 'heartbeat',
        value: null,
        threshold: limitMinutes,
        message: `No telemetry from ${device.name} for more than ${limitMinutes} min`
      });
    }
  }
}
