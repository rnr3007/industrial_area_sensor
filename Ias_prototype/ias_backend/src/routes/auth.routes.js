import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { validate } from '../middleware/validate.js';
import { authenticate, signSessionToken, signMagicLinkToken, verifyToken } from '../middleware/auth.js';
import { findUserByEmail, findUserById, touchLastLogin, MAGIC_LINK_ROLES } from '../store/users.store.js';
import { consumeOnce } from '../store/magic-links.store.js';
import { sendMagicLinkEmail } from '../utils/email.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const router = Router();

// Generous enough for a real user, tight enough to blunt enumeration/brute-force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' }
});

const magicLinkSchema = z.object({ email: z.string().email() });

/**
 * Always returns the same generic response whether or not the email is
 * registered - this is the standard anti-enumeration pattern, so a caller
 * can't use this endpoint to discover which addresses have accounts.
 */
router.post(
  '/magic-link',
  authLimiter,
  validate(magicLinkSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const genericReply = { message: 'If that email is registered, a sign-in link has been sent.' };

    const user = await findUserByEmail(email);
    if (!user || !user.active || !MAGIC_LINK_ROLES.includes(user.role)) {
      res.json(genericReply);
      return;
    }

    const token = signMagicLinkToken(user);
    const link = `${config.appBaseUrl}/auth/callback?token=${encodeURIComponent(token)}`;
    await sendMagicLinkEmail(user.email, link);

    res.json(genericReply);
  })
);

const consumeSchema = z.object({ token: z.string().min(1) });

router.post(
  '/magic-link/consume',
  authLimiter,
  validate(consumeSchema),
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = verifyToken(req.body.token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') throw HttpError.unauthorized('This link has expired');
      throw HttpError.unauthorized('This link is invalid');
    }

    if (payload.purpose !== 'magic-link') throw HttpError.unauthorized('This link is invalid');

    // One-time use: a second click (or a copy-pasted/leaked URL) gets rejected
    // even though the JWT signature itself would still verify until it expires.
    if (!consumeOnce(payload.jti, payload.exp)) {
      throw HttpError.unauthorized('This link has already been used');
    }

    // Identity comes only from the verified `sub` - the request body carries
    // no user id, so there is nothing here for a caller to tamper with.
    const user = await findUserById(payload.sub);
    if (!user || !user.active || !MAGIC_LINK_ROLES.includes(user.role)) {
      throw HttpError.unauthorized('Account no longer available');
    }

    await touchLastLogin(user.id);
    logger.info(`Magic-link sign-in: ${user.email} (${user.role})`);

    res.json({ token: signSessionToken(user), user });
  })
);

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post(
  '/admin/login',
  authLimiter,
  validate(adminLoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await findUserByEmail(email, { includePasswordHash: true });

    if (!user || user.role !== 'admin' || !user.passwordHash) {
      throw HttpError.unauthorized('Invalid email or password');
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw HttpError.unauthorized('Invalid email or password');
    }
    if (!user.active) throw HttpError.forbidden('This account is deactivated');

    await touchLastLogin(user.id);
    const { passwordHash, ...publicUser } = user;

    res.json({ token: signSessionToken(publicUser), user: publicUser });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

router.post('/logout', authenticate, (_req, res) => {
  // Stateless session JWT - the client just drops it.
  res.json({ ok: true });
});

export default router;
