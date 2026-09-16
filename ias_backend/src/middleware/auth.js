import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import HttpError from '../utils/http-error.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, name: user.name, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTtl }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query.access_token) return String(req.query.access_token);
  return null;
}

export async function authenticate(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw HttpError.unauthorized('Missing bearer token');

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw HttpError.unauthorized('Account disabled or removed');

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(HttpError.unauthorized('Token expired'));
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
