import mongoose from 'mongoose';

export const METRICS = [
  'waterLevelM',
  'flowRateM3h',
  'ph',
  'turbidityNtu',
  'tdsPpm',
  'temperatureC'
];

export const METRIC_LABELS = {
  waterLevelM: { label: 'Water level', unit: 'm' },
  flowRateM3h: { label: 'Flow rate', unit: 'm³/h' },
  ph: { label: 'pH', unit: '' },
  turbidityNtu: { label: 'Turbidity', unit: 'NTU' },
  tdsPpm: { label: 'TDS', unit: 'ppm' },
  temperatureC: { label: 'Temperature', unit: '°C' }
};

const readingSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null },
    deviceId: { type: String, required: true, index: true },
    ts: { type: Date, required: true, default: Date.now },

    waterLevelM: { type: Number, default: null },
    flowRateM3h: { type: Number, default: null },
    ph: { type: Number, default: null },
    turbidityNtu: { type: Number, default: null },
    tdsPpm: { type: Number, default: null },
    temperatureC: { type: Number, default: null },

    // cumulative intake counter reported by the device (m3)
    intakeTotalM3: { type: Number, default: null },

    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },
    speedKph: { type: Number, default: null },
    battery: { type: Number, default: null },
    signal: { type: Number, default: null },
    source: { type: String, enum: ['mqtt', 'tcp', 'api', 'simulator'], default: 'mqtt' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

readingSchema.index({ company: 1, ts: -1 });
readingSchema.index({ deviceId: 1, ts: -1 });

readingSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Reading', readingSchema);
