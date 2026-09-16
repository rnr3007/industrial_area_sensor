import config from '../config/index.js';
import logger from './logger.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import Device from '../models/Device.js';

const COMPANIES = [
  {
    name: 'PT Anugerah Jaya Textile',
    code: 'PTAJ',
    industry: 'Textile',
    address: 'Kawasan Industri Jababeka Blok C-12',
    city: 'Bekasi',
    province: 'Jawa Barat',
    contactName: 'Sutrisno',
    contactEmail: 'ehs@anugerahjaya.co.id',
    contactPhone: '+62 21 8934 1122',
    location: { lat: -6.2762, lng: 107.1436 },
    geofenceRadiusM: 600,
    waterIntake: {
      sourceType: 'river',
      permitNumber: 'SIPA-2401-JB-0087',
      quotaM3PerDay: 2400,
      pipeDiameterMm: 300,
      notes: 'Intake from Kali Cikarang, upstream of the weir.'
    },
    thresholds: { waterLevelMin: 0.8, waterLevelMax: 4.2, flowRateMax: 110, turbidityMax: 45 }
  },
  {
    name: 'PT Bumi Kimia Nusantara',
    code: 'PTBKN',
    industry: 'Chemicals',
    address: 'Kawasan Industri Cilegon Jl. Raya Anyer KM 9',
    city: 'Cilegon',
    province: 'Banten',
    contactName: 'Rina Halim',
    contactEmail: 'compliance@bumikimia.co.id',
    contactPhone: '+62 254 391 8800',
    location: { lat: -6.0123, lng: 105.9987 },
    geofenceRadiusM: 800,
    waterIntake: {
      sourceType: 'groundwater',
      permitNumber: 'SIPA-2312-BT-0451',
      quotaM3PerDay: 1800,
      pipeDiameterMm: 250
    },
    thresholds: { waterLevelMin: 1.0, waterLevelMax: 5.0, phMin: 6.5, phMax: 8.5, tdsMax: 900 }
  },
  {
    name: 'PT Sinar Logam Perkasa',
    code: 'PTSLP',
    industry: 'Metal smelting',
    address: 'Kawasan Industri Gresik Jl. Tridharma 5',
    city: 'Gresik',
    province: 'Jawa Timur',
    contactName: 'Bagus Wicaksono',
    contactEmail: 'hse@sinarlogam.co.id',
    contactPhone: '+62 31 3981 7744',
    location: { lat: -7.1543, lng: 112.6512 },
    geofenceRadiusM: 500,
    waterIntake: {
      sourceType: 'reservoir',
      permitNumber: 'SIPA-2405-JT-0122',
      quotaM3PerDay: 3200,
      pipeDiameterMm: 400
    },
    thresholds: { waterLevelMax: 4.8, temperatureMax: 38, turbidityMax: 60 }
  },
  {
    name: 'PT Harapan Pangan Sejahtera',
    code: 'PTHPS',
    industry: 'Food processing',
    address: 'Kawasan Industri Medan II Jl. Pulau Solor',
    city: 'Deli Serdang',
    province: 'Sumatera Utara',
    contactName: 'Melati Sinaga',
    contactEmail: 'qhse@harapanpangan.co.id',
    contactPhone: '+62 61 6871 2200',
    location: { lat: 3.6716, lng: 98.7412 },
    geofenceRadiusM: 450,
    waterIntake: {
      sourceType: 'municipal',
      permitNumber: 'SIPA-2402-SU-0033',
      quotaM3PerDay: 1200,
      pipeDiameterMm: 200
    },
    thresholds: { waterLevelMin: 0.6, waterLevelMax: 3.8, phMin: 6.5, phMax: 8.0 }
  }
];

const USERS = [
  {
    name: 'Operations Supervisor',
    email: 'operator@ias.local',
    password: 'Operator#12345',
    role: 'operator'
  },
  {
    name: 'Environment Auditor',
    email: 'viewer@ias.local',
    password: 'Viewer#12345',
    role: 'viewer'
  }
];

/**
 * Idempotent bootstrap data: creates the admin account, four demo sites and
 * their devices when the database is empty. Existing records are left alone.
 */
export async function seed() {
  const adminEmail = config.seed.adminEmail.toLowerCase();

  if (!(await User.findOne({ email: adminEmail }))) {
    const admin = new User({
      name: 'System Administrator',
      email: adminEmail,
      role: 'admin',
      active: true
    });
    await admin.setPassword(config.seed.adminPassword);
    await admin.save();
    logger.info(`Seeded admin account ${adminEmail}`);
  }

  for (const spec of USERS) {
    if (await User.findOne({ email: spec.email })) continue;
    const user = new User({ name: spec.name, email: spec.email, role: spec.role });
    await user.setPassword(spec.password);
    await user.save();
    logger.info(`Seeded ${spec.role} account ${spec.email}`);
  }

  for (const spec of COMPANIES) {
    let company = await Company.findOne({ code: spec.code });
    if (!company) {
      company = await Company.create(spec);
      logger.info(`Seeded company ${company.code}`);
    }

    const deviceSpecs = [
      {
        deviceId: `FMC125-${company.code}-01`,
        name: `${company.name} - intake sensor`,
        type: 'fmc125',
        imei: `3568${String(Math.abs(hash(company.code))).padStart(11, '0').slice(0, 11)}`,
        firmware: '03.27.07.Rev.00'
      },
      {
        deviceId: `DUALCAM-${company.code}-01`,
        name: `${company.name} - intake camera`,
        type: 'dualcam',
        firmware: 'DC-1.4.2'
      }
    ];

    for (const deviceSpec of deviceSpecs) {
      if (await Device.findOne({ deviceId: deviceSpec.deviceId })) continue;
      await Device.create({
        ...deviceSpec,
        company: company._id,
        location: company.location
      });
      logger.info(`Seeded device ${deviceSpec.deviceId}`);
    }
  }
}

function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value << 5) - value + text.charCodeAt(i);
    value |= 0;
  }
  return value;
}

export default seed;
