import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: 'anonymous' },
    userEmail: { type: String, default: '' },
    role: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    resource: { type: String, default: '', index: true },
    resourceId: { type: String, default: '' },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
    statusCode: { type: Number, default: 0 },
    success: { type: Boolean, default: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ts: { type: Date, default: Date.now, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ ts: -1 });

auditLogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('AuditLog', auditLogSchema);
