import mongoose from 'mongoose';
import config from '../config/index.js';

/**
 * CCTV frame pushed by the DualCam (over TCP) or by the device over MQTT.
 * Frames are heavy, so the collection self-expires via a TTL index.
 */
const snapshotSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    camera: { type: String, default: 'front' },
    mimeType: { type: String, default: 'image/jpeg' },
    // data URL ("data:image/jpeg;base64,....") kept small by the capture side
    dataUrl: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    ts: { type: Date, default: Date.now, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

snapshotSchema.index({ company: 1, camera: 1, ts: -1 });
snapshotSchema.index({ ts: 1 }, { expireAfterSeconds: config.retention.snapshotTtl });

snapshotSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Snapshot', snapshotSchema);
