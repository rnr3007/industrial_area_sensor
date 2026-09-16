import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import User, { ROLES, PASSWORD_ROLES, MAGIC_LINK_ROLES } from '../models/User.js';

export { ROLES, PASSWORD_ROLES, MAGIC_LINK_ROLES };

const normalizeEmail = (email) => String(email).trim().toLowerCase();

/** Plain object including the hash - only used internally for password checks. */
function withHash(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    passwordHash: doc.passwordHash,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastLoginAt: doc.lastLoginAt
  };
}

export async function listUsers() {
  const users = await User.find().sort({ createdAt: 1 });
  return users.map((u) => u.toJSON());
}

export async function findUserByEmail(email, { includePasswordHash = false } = {}) {
  const query = User.findOne({ email: normalizeEmail(email) });
  if (includePasswordHash) {
    const doc = await query.select('+passwordHash');
    return withHash(doc);
  }
  const doc = await query;
  return doc ? doc.toJSON() : null;
}

/** Only ever called with an id taken from a verified JWT `sub` claim. */
export async function findUserById(id, { includePasswordHash = false } = {}) {
  let query;
  try {
    query = User.findById(id);
  } catch {
    return null;
  }
  if (includePasswordHash) {
    const doc = await query.select('+passwordHash').catch(() => null);
    return withHash(doc);
  }
  const doc = await query.catch(() => null);
  return doc ? doc.toJSON() : null;
}

export async function createUser({ email, name, role, password, active = true }) {
  if (!ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  const normalized = normalizeEmail(email);

  if (await User.findOne({ email: normalized })) {
    throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
  }

  const user = new User({
    email: normalized,
    name: name?.trim() || normalized,
    role,
    passwordHash: PASSWORD_ROLES.includes(role) && password ? await bcrypt.hash(password, 12) : null,
    active
  });

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) {
      throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    }
    throw err;
  }

  return user.toJSON();
}

export async function updateUser(id, patch) {
  const user = await User.findById(id).catch(() => null);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  if (patch.email !== undefined) {
    const normalized = normalizeEmail(patch.email);
    const clash = await User.findOne({ email: normalized, _id: { $ne: user._id } });
    if (clash) throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    user.email = normalized;
  }
  if (patch.name !== undefined) user.name = patch.name.trim();
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new Error(`Invalid role: ${patch.role}`);
    user.role = patch.role;
    // Switching away from admin drops any password; switching a
    // guest/operator into admin requires setting one explicitly.
    if (!PASSWORD_ROLES.includes(user.role)) user.passwordHash = null;
  }
  if (patch.active !== undefined) user.active = Boolean(patch.active);
  if (patch.password) {
    if (!PASSWORD_ROLES.includes(user.role)) {
      throw Object.assign(new Error('Only admin accounts can have a password'), { status: 400 });
    }
    user.passwordHash = await bcrypt.hash(patch.password, 12);
  }

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) {
      throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    }
    throw err;
  }

  return user.toJSON();
}

export async function deleteUser(id) {
  let result;
  try {
    result = await User.findByIdAndDelete(id);
  } catch {
    result = null;
  }
  if (!result) throw Object.assign(new Error('User not found'), { status: 404 });
}

export async function touchLastLogin(id) {
  await User.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});
}

/** Idempotent - only creates the seed admin if no admin account exists yet. */
export async function seedAdmin() {
  if (!config.seed.enabled) return;
  if (await User.findOne({ role: 'admin' })) return;

  await createUser({
    email: config.seed.adminEmail,
    name: config.seed.adminName,
    role: 'admin',
    password: config.seed.adminPassword,
    active: true
  });
  logger.info(`Seeded admin account: ${config.seed.adminEmail}`);
}
