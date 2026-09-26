import mongoose from 'mongoose';

export const READING_STATUSES = ['RUN', 'IDLE', 'OVER'];

// One document per reading the device pushes to POST /data - the durable
// history behind the dashboard's trend chart/export, which until now only
// lived in each browser tab's in-memory store and vanished on refresh.
const readingSchema = new mongoose.Schema(
  {
    currentMA: { type: Number, required: true },
    flowRate: { type: Number, required: true }, // m3/h
    flowLpm: { type: Number, required: true },
    flowLps: { type: Number, required: true },
    totalLiters: { type: Number, required: true },
    totalM3: { type: Number, required: true },
    status: { type: String, enum: READING_STATUSES, required: true }
  },
  { timestamps: { createdAt: 'ts', updatedAt: false } }
);

// Doubles as housekeeping: MongoDB's TTL background task drops any document
// once its `ts` is older than 30 days, so the collection doesn't grow
// forever from a device posting once a second. Same index also serves the
// recent/date-range queries below - a single index handles both.
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
readingSchema.index({ ts: -1 }, { expireAfterSeconds: THIRTY_DAYS_SECONDS });

readingSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Reading', readingSchema);
