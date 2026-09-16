import mongoose from 'mongoose';

export const DEVICE_TYPES = ['fmc125', 'dualcam', 'water-sensor'];

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: DEVICE_TYPES, default: 'fmc125', index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    imei: { type: String, default: '', trim: true },
    firmware: { type: String, default: '', trim: true },
    // optional HLS/MJPEG url when the camera is reachable directly
    streamUrl: { type: String, default: '', trim: true },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },
    lastSeenAt: { type: Date, default: null },
    battery: { type: Number, default: null },
    online: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

deviceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Device', deviceSchema);
