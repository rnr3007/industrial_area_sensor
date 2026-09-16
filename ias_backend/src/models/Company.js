import mongoose from 'mongoose';

const thresholdSchema = new mongoose.Schema(
  {
    waterLevelMin: { type: Number, default: 0.5 },
    waterLevelMax: { type: Number, default: 4.5 },
    flowRateMax: { type: Number, default: 120 },
    phMin: { type: Number, default: 6 },
    phMax: { type: Number, default: 9 },
    turbidityMax: { type: Number, default: 50 },
    tdsMax: { type: Number, default: 1000 },
    temperatureMax: { type: Number, default: 40 },
    // minutes without telemetry before the device is flagged offline
    offlineAfterMinutes: { type: Number, default: 15 }
  },
  { _id: false }
);

const waterIntakeSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ['river', 'groundwater', 'reservoir', 'municipal', 'sea', 'other'],
      default: 'river'
    },
    permitNumber: { type: String, default: '', trim: true },
    permitExpiry: { type: Date, default: null },
    // m3/day allowed by the abstraction permit
    quotaM3PerDay: { type: Number, default: 0 },
    pipeDiameterMm: { type: Number, default: 0 },
    notes: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]{2,20}$/, 'code must be 2-20 chars of A-Z, 0-9, _ or -']
    },
    industry: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    province: { type: String, default: '', trim: true },
    contactName: { type: String, default: '', trim: true },
    contactEmail: { type: String, default: '', lowercase: true, trim: true },
    contactPhone: { type: String, default: '', trim: true },
    location: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 }
    },
    // used by turf.js on the client to detect a device leaving the site
    geofenceRadiusM: { type: Number, default: 500 },
    waterIntake: { type: waterIntakeSchema, default: () => ({}) },
    thresholds: { type: thresholdSchema, default: () => ({}) },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

companySchema.index({ name: 'text', code: 'text', city: 'text' });

companySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Company', companySchema);
