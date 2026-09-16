import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['admin', 'operator', 'viewer'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'viewer', index: true },
    phone: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    // empty array = access to every company (admins)
    companies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.canAccessCompany = function canAccessCompany(companyId) {
  if (this.role === 'admin') return true;
  if (!this.companies || this.companies.length === 0) return true;
  return this.companies.some((c) => String(c) === String(companyId));
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('User', userSchema);
