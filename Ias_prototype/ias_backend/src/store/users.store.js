import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { JsonStore } from './json-store.js';

export const ROLES = ['admin', 'operator', 'guest_operator'];
// Only admin accounts authenticate with a password; the rest are magic-link only.
export const PASSWORD_ROLES = ['admin'];
export const MAGIC_LINK_ROLES = ['operator', 'guest_operator'];

const store = new JsonStore(path.join(config.dataDir, 'users.json'), { users: [] });

const normalizeEmail = (email) => String(email).trim().toLowerCase();

/** Strips the password hash before a record ever leaves this module. */
function toPublic(user) {
  if (!user) return null;
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function listUsers() {
  const { users } = await store.read();
  return users.map(toPublic);
}

export async function findUserByEmail(email, { includePasswordHash = false } = {}) {
  const { users } = await store.read();
  const user = users.find((u) => u.email === normalizeEmail(email));
  return includePasswordHash ? user || null : toPublic(user);
}

/** Only ever called with an id taken from a verified JWT `sub` claim. */
export async function findUserById(id, { includePasswordHash = false } = {}) {
  const { users } = await store.read();
  const user = users.find((u) => u.id === id);
  return includePasswordHash ? user || null : toPublic(user);
}

export async function createUser({ email, name, role, password, active = true }) {
  if (!ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  const normalized = normalizeEmail(email);

  return store.mutate(async (data) => {
    if (data.users.some((u) => u.email === normalized)) {
      throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    }

    const now = new Date().toISOString();
    const user = {
      // Random, non-sequential id - guessing/incrementing another user's id
      // gets you nowhere, and every /api/users/:id route is admin-gated anyway.
      id: crypto.randomUUID(),
      email: normalized,
      name: name?.trim() || normalized,
      role,
      passwordHash: PASSWORD_ROLES.includes(role) && password ? await bcrypt.hash(password, 12) : null,
      active,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };

    data.users.push(user);
    return { data, result: toPublic(user) };
  });
}

export async function updateUser(id, patch) {
  return store.mutate(async (data) => {
    const index = data.users.findIndex((u) => u.id === id);
    if (index === -1) throw Object.assign(new Error('User not found'), { status: 404 });

    const current = data.users[index];
    const next = { ...current, updatedAt: new Date().toISOString() };

    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.role !== undefined) {
      if (!ROLES.includes(patch.role)) throw new Error(`Invalid role: ${patch.role}`);
      next.role = patch.role;
      // Switching away from admin drops any password; switching a
      // guest/operator into admin requires setting one explicitly.
      if (!PASSWORD_ROLES.includes(next.role)) next.passwordHash = null;
    }
    if (patch.active !== undefined) next.active = Boolean(patch.active);
    if (patch.password) {
      if (!PASSWORD_ROLES.includes(next.role)) {
        throw Object.assign(new Error('Only admin accounts can have a password'), { status: 400 });
      }
      next.passwordHash = await bcrypt.hash(patch.password, 12);
    }

    data.users[index] = next;
    return { data, result: toPublic(next) };
  });
}

export async function deleteUser(id) {
  return store.mutate((data) => {
    const before = data.users.length;
    data.users = data.users.filter((u) => u.id !== id);
    if (data.users.length === before) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }
    return data;
  });
}

export async function touchLastLogin(id) {
  return store.mutate((data) => {
    const user = data.users.find((u) => u.id === id);
    if (user) user.lastLoginAt = new Date().toISOString();
    return data;
  });
}

/** Idempotent - only creates the seed admin if no admin account exists yet. */
export async function seedAdmin() {
  if (!config.seed.enabled) return;

  const { users } = await store.read();
  if (users.some((u) => u.role === 'admin')) return;

  await createUser({
    email: config.seed.adminEmail,
    name: config.seed.adminName,
    role: 'admin',
    password: config.seed.adminPassword,
    active: true
  });
  logger.info(`Seeded admin account: ${config.seed.adminEmail}`);
}
