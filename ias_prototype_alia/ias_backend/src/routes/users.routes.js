import { Router } from 'express';
import { z } from 'zod';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES, listUsers, createUser, updateUser, deleteUser } from '../store/users.store.js';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await listUsers() });
  })
);

const createSchema = z
  .object({
    email: z.string().email(),
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLES),
    password: z.string().min(8).optional()
  })
  .refine((data) => data.role !== 'admin' || Boolean(data.password), {
    message: 'Admin accounts require a password (min 8 characters)',
    path: ['password']
  });

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    try {
      const user = await createUser(req.body);
      res.status(201).json({ user });
    } catch (err) {
      throw err.status ? new HttpError(err.status, err.message) : err;
    }
  })
);

const updateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional()
});

router.put(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    try {
      const user = await updateUser(req.params.id, req.body);
      res.json({ user });
    } catch (err) {
      throw err.status ? new HttpError(err.status, err.message) : err;
    }
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw HttpError.badRequest('You cannot delete your own account');
    }
    try {
      await deleteUser(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      throw err.status ? new HttpError(err.status, err.message) : err;
    }
  })
);

export default router;
