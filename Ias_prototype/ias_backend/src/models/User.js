import mongoose from 'mongoose';

export const ROLES = ['admin', 'operator', 'guest_operator'];
// Only admin accounts authenticate with a password; the rest are magic-link only.
export const PASSWORD_ROLES = ['admin'];
export const MAGIC_LINK_ROLES = ['operator', 'guest_operator'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, required: true, index: true },
    passwordHash: { type: String, default: null, select: false },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Public API shape stays `{ id, email, name, role, active, ... }` - matching
// what the JSON-file store used to return - so routes/frontend/JWT `sub`
// never had to change when this moved to Mongo.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  }
});

export default mongoose.model('User', userSchema);
