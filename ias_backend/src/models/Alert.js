import mongoose from 'mongoose';

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'];
export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved'];
export const ALERT_TYPES = [
  'threshold-high',
  'threshold-low',
  'rate-of-change',
  'device-offline',
  'geofence-exit',
  'low-battery'
];

const alertSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    companyName: { type: String, default: '' },
    deviceId: { type: String, default: '', index: true },
    type: { type: String, enum: ALERT_TYPES, required: true },
    severity: { type: String, enum: ALERT_SEVERITIES, default: 'warning', index: true },
    metric: { type: String, default: '' },
    value: { type: Number, default: null },
    threshold: { type: Number, default: null },
    message: { type: String, required: true },
    ts: { type: Date, default: Date.now, index: true },
    status: { type: String, enum: ALERT_STATUSES, default: 'open', index: true },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    note: { type: String, default: '' }
  },
  { timestamps: true }
);

alertSchema.index({ company: 1, status: 1, ts: -1 });

alertSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Alert', alertSchema);
