import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import User from '../models/User.js';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { authenticate, signAccessToken } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

    if (!user || !(await user.verifyPassword(password))) {
      await recordAudit(req, {
        action: 'auth.login.failed',
        resource: 'auth',
        statusCode: 401,
        success: false,
        meta: { attemptedEmail: email }
      });
      throw HttpError.unauthorized('Invalid email or password');
    }

    if (!user.active) {
      await recordAudit(req, {
        action: 'auth.login.blocked',
        resource: 'auth',
        statusCode: 403,
        success: false,
        meta: { attemptedEmail: email }
      });
      throw HttpError.forbidden('This account is deactivated');
    }

    user.lastLoginAt = new Date();
    await user.save();

    req.user = user;
    await recordAudit(req, { action: 'auth.login', resource: 'auth', resourceId: user._id });

    res.json({ token: signAccessToken(user), user: user.toJSON() });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toJSON() });
  })
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
});

router.post(
  '/change-password',
  authenticate,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await user.verifyPassword(req.body.currentPassword))) {
      await recordAudit(req, {
        action: 'auth.password.change.failed',
        resource: 'user',
        resourceId: user._id,
        statusCode: 400,
        success: false
      });
      throw HttpError.badRequest('Current password is incorrect');
    }

    await user.setPassword(req.body.newPassword);
    await user.save();
    await recordAudit(req, {
      action: 'auth.password.change',
      resource: 'user',
      resourceId: user._id
    });

    res.json({ ok: true });
  })
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    // Stateless JWT: the client drops the token. Recorded for the audit trail.
    await recordAudit(req, { action: 'auth.logout', resource: 'auth', resourceId: req.user._id });
    res.json({ ok: true });
  })
);

export default router;
