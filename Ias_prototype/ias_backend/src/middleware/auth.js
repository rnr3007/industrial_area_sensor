import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import config from '../config/index.js';
import HttpError from '../utils/http-error.js';
import { findUserById } from '../store/users.store.js';

/** 30-minute (by default) session token, handed out by either login flow. */
export function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name, purpose: 'session' },
    config.jwt.secret,
    { expiresIn: config.jwt.sessionTtl }
  );
}

/**
 * Single-use magic sign-in link token. `sub` is the only identity carried -
 * the signature prevents forging it for a different user, and the `jti` lets
 * the consume endpoint reject a second use of the same link (see
 * store/magic-links.store.js).
 */
export function signMagicLinkToken(user) {
  return jwt.sign(
    { sub: user.id, purpose: 'magic-link', jti: crypto.randomUUID() },
    config.jwt.secret,
    { expiresIn: config.jwt.magicLinkTtl }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Requires a valid, non-expired session token; attaches the current user. */
export async function authenticate(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw HttpError.unauthorized('Missing bearer token');

    const payload = verifyToken(token);
    if (payload.purpose !== 'session') throw HttpError.unauthorized('Invalid token');

    // Identity always comes from the verified `sub` claim, never from a
    // client-supplied id - this is what keeps every authenticated route
    // IDOR-safe regardless of what a caller puts in the URL/body.
    const user = await findUserById(payload.sub);
    if (!user || !user.active) throw HttpError.unauthorized('Account disabled or removed');

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(HttpError.unauthorized('Session expired'));
    if (err.name === 'JsonWebTokenError') return next(HttpError.unauthorized('Invalid token'));
    return next(err);
  }
}

export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(HttpError.unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(HttpError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    return next();
  };
