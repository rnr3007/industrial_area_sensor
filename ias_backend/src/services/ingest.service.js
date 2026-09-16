import Company from '../models/Company.js';
import Device from '../models/Device.js';
import Reading from '../models/Reading.js';
import Snapshot from '../models/Snapshot.js';
import { evaluateReading } from './anomaly.service.js';
import { emitGlobal, emitToCompany } from './realtime.service.js';
import logger from '../utils/logger.js';

const COMPANY_CACHE_TTL = 60_000;
const companyCache = new Map();

export function invalidateCompanyCache(code) {
  if (code) companyCache.delete(String(code).toUpperCase());
  else companyCache.clear();
}

async function resolveCompany(code) {
  const key = String(code || '').toUpperCase();
  const cached = companyCache.get(key);
  if (cached && Date.now() - cached.at < COMPANY_CACHE_TTL) return cached.doc;

  const doc = await Company.findOne({ code: key }).lean();
  if (doc) companyCache.set(key, { doc, at: Date.now() });
  return doc;
}

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Normalise a device payload. Accepts both our canonical field names and the
 * shorter AVL keys the FMC125 emits so the same path serves MQTT and TCP.
 */
export function normalizeTelemetry(raw = {}) {
  const lat = num(raw.lat ?? raw.latitude ?? raw.location?.lat);
  const lng = num(raw.lng ?? raw.lon ?? raw.longitude ?? raw.location?.lng);

  return {
    ts: raw.ts ? new Date(raw.ts) : new Date(),
    waterLevelM: num(raw.waterLevelM ?? raw.water_level ?? raw.wl),
    flowRateM3h: num(raw.flowRateM3h ?? raw.flow_rate ?? raw.flow),
    ph: num(raw.ph ?? raw.pH),
    turbidityNtu: num(raw.turbidityNtu ?? raw.turbidity ?? raw.ntu),
    tdsPpm: num(raw.tdsPpm ?? raw.tds),
    temperatureC: num(raw.temperatureC ?? raw.temperature ?? raw.temp),
    intakeTotalM3: num(raw.intakeTotalM3 ?? raw.intake_total ?? raw.totalizer),
    speedKph: num(raw.speedKph ?? raw.speed),
    battery: num(raw.battery ?? raw.batt),
    signal: num(raw.signal ?? raw.rssi ?? raw.gsm),
    location: lat !== null && lng !== null ? { lat, lng } : { lat: null, lng: null }
  };
}

/**
 * Store one telemetry frame, run anomaly detection and fan it out to the UI.
 */
export async function ingestTelemetry({ companyCode, deviceId, payload, source = 'mqtt' }) {
  const company = await resolveCompany(companyCode);
  if (!company) {
    logger.warn(`telemetry dropped - unknown company code "${companyCode}"`);
    return null;
  }
  if (!deviceId) {
    logger.warn('telemetry dropped - missing deviceId');
    return null;
  }

  const data = normalizeTelemetry(payload);

  const device = await Device.findOneAndUpdate(
    { deviceId },
    {
      $set: {
        lastSeenAt: data.ts,
        online: true,
        ...(data.battery !== null ? { battery: data.battery } : {}),
        ...(data.location.lat !== null ? { location: data.location } : {})
      },
      $setOnInsert: {
        deviceId,
        name: `Device ${deviceId}`,
        type: 'fmc125',
        company: company._id
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const reading = await Reading.create({
    company: company._id,
    device: device._id,
    deviceId,
    source,
    ...data
  });

  const json = reading.toJSON();
  emitToCompany(String(company._id), 'telemetry', json);
  emitGlobal('telemetry:any', { companyId: String(company._id), deviceId, ts: json.ts });

  const alerts = await evaluateReading(company, reading);
  return { reading: json, alerts };
}

/**
 * Store a CCTV frame from the DualCam and push it to anyone watching the site.
 */
export async function ingestSnapshot({ companyCode, deviceId, camera = 'front', dataUrl, mimeType }) {
  const company = await resolveCompany(companyCode);
  if (!company || !dataUrl) return null;

  const snapshot = await Snapshot.create({
    company: company._id,
    deviceId,
    camera,
    mimeType: mimeType || 'image/jpeg',
    dataUrl,
    sizeBytes: Buffer.byteLength(dataUrl, 'utf8'),
    ts: new Date()
  });

  const json = snapshot.toJSON();
  emitToCompany(String(company._id), 'snapshot', json);
  return json;
}

export async function handleDeviceStatus({ companyCode, deviceId, payload }) {
  const company = await resolveCompany(companyCode);
  if (!company) return null;

  const online = payload?.online ?? payload?.status === 'online';
  const device = await Device.findOneAndUpdate(
    { deviceId },
    { $set: { online: Boolean(online), lastSeenAt: new Date() } },
    { new: true }
  );
  if (!device) return null;

  emitGlobal('device:status', { deviceId, online: Boolean(online) });
  return device;
}
