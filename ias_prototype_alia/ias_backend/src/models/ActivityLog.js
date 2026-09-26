import mongoose from 'mongoose';

export const LOG_TYPES = ['info', 'success', 'warn', 'danger'];

// Durable history behind "Log Aktivitas" - until now this only lived in the
// backend's in-memory state.logs (capped, lost on every restart). This is
// the device-originated activity stream (link up/down, RUN/IDLE/OVER
// transitions, etc. - see esp32.service.js's log()), not the purely
// client-side UI-action entries stores/alia.js's addLog() adds locally
// (those never reach the backend at all).
const activityLogSchema = new mongoose.Schema(
  {
    type: { type: String, enum: LOG_TYPES, required: true },
    message: { type: String, required: true }
  },
  { timestamps: { createdAt: 'time', updatedAt: false }, collection: 'activity_logs' }
);

// Same 30-day TTL as models/Reading.js, for the same reason - a device that
// flaps status every few seconds could otherwise grow this indefinitely.
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
activityLogSchema.index({ time: -1 }, { expireAfterSeconds: THIRTY_DAYS_SECONDS });

activityLogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ActivityLog', activityLogSchema);
