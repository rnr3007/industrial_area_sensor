import { Router } from 'express';
import { z } from 'zod';
import User, { ROLES } from '../models/User.js';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'invalid id');

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(ROLES).default('viewer'),
  phone: z.string().optional(),
  active: z.boolean().default(true),
  companies: z.array(objectId).default([])
});

const updateSchema = createSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional()
});

router.get(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { q = '', role, active, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];
    if (role) filter.role = role;
    if (active !== undefined) filter.active = active === 'true';

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('companies', 'name code'),
      User.countDocuments(filter)
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  })
);

router.post(
  '/',
  authorize('admin'),
  validate(createSchema),
  audit('user.create', 'user'),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body;
    const exists = await User.findOne({ email: rest.email.toLowerCase() });
    if (exists) throw HttpError.conflict('A user with that email already exists');

    const user = new User(rest);
    await user.setPassword(password);
    await user.save();

    res.locals.auditResourceId = user._id;
    res.locals.auditMeta = { email: user.email, role: user.role };
    res.status(201).json(user.toJSON());
  })
);

router.get(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).populate('companies', 'name code');
    if (!user) throw HttpError.notFound('User not found');
    res.json(user.toJSON());
  })
);

router.put(
  '/:id',
  authorize('admin'),
  validate(updateSchema),
  audit('user.update', 'user'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('+passwordHash');
    if (!user) throw HttpError.notFound('User not found');

    const { password, ...rest } = req.body;

    // Guard against an admin locking everyone out of the console.
    if (
      String(user._id) === String(req.user._id) &&
      ((rest.role && rest.role !== 'admin') || rest.active === false)
    ) {
      throw HttpError.badRequest('You cannot demote or deactivate your own account');
    }

    Object.assign(user, rest);
    if (password) await user.setPassword(password);
    await user.save();

    res.locals.auditMeta = { email: user.email, fields: Object.keys(rest) };
    res.json(user.toJSON());
  })
);

router.delete(
  '/:id',
  authorize('admin'),
  audit('user.delete', 'user'),
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) {
      throw HttpError.badRequest('You cannot delete your own account');
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw HttpError.notFound('User not found');

    res.locals.auditMeta = { email: user.email };
    res.json({ ok: true });
  })
);

export default router;
