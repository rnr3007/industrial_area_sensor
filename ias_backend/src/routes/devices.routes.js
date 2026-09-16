import { Router } from 'express';
import { z } from 'zod';
import Device, { DEVICE_TYPES } from '../models/Device.js';
import Company from '../models/Company.js';
import HttpError, { asyncHandler } from '../utils/http-error.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { publishCommand } from '../services/mqtt.service.js';

const router = Router();
router.use(authenticate);

const deviceSchema = z.object({
  deviceId: z.string().min(3),
  name: z.string().min(2),
  type: z.enum(DEVICE_TYPES).default('fmc125'),
  company: z.string().regex(/^[a-f\d]{24}$/i),
  imei: z.string().optional(),
  firmware: z.string().optional(),
  streamUrl: z.string().url().or(z.literal('')).optional(),
  active: z.boolean().optional()
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.companyId) filter.company = req.query.companyId;
    if (req.query.type) filter.type = req.query.type;

    const items = await Device.find(filter)
      .sort({ name: 1 })
      .populate('company', 'name code')
      .lean();
    res.json({ items, total: items.length });
  })
);

router.post(
  '/',
  authorize('admin', 'operator'),
  validate(deviceSchema),
  audit('device.create', 'device'),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.body.company);
    if (!company) throw HttpError.badRequest('Unknown company');

    const device = await Device.create(req.body);
    res.locals.auditResourceId = device._id;
    res.locals.auditMeta = { deviceId: device.deviceId, company: company.code };
    res.status(201).json(device.toJSON());
  })
);

router.put(
  '/:id',
  authorize('admin', 'operator'),
  validate(deviceSchema.partial()),
  audit('device.update', 'device'),
  asyncHandler(async (req, res) => {
    const device = await Device.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!device) throw HttpError.notFound('Device not found');
    res.locals.auditMeta = { deviceId: device.deviceId, fields: Object.keys(req.body) };
    res.json(device.toJSON());
  })
);

router.delete(
  '/:id',
  authorize('admin'),
  audit('device.delete', 'device'),
  asyncHandler(async (req, res) => {
    const device = await Device.findByIdAndDelete(req.params.id);
    if (!device) throw HttpError.notFound('Device not found');
    res.locals.auditMeta = { deviceId: device.deviceId };
    res.json({ ok: true });
  })
);

const commandSchema = z.object({
  command: z.enum(['capture', 'reboot', 'sync', 'set-interval']),
  params: z.record(z.any()).optional()
});

/** Downlink to the device over MQTT (e.g. ask the DualCam for a fresh frame). */
router.post(
  '/:id/command',
  authorize('admin', 'operator'),
  validate(commandSchema),
  audit('device.command', 'device'),
  asyncHandler(async (req, res) => {
    const device = await Device.findById(req.params.id).populate('company', 'code name');
    if (!device) throw HttpError.notFound('Device not found');

    const payload = {
      command: req.body.command,
      params: req.body.params || {},
      issuedBy: req.user.email,
      issuedAt: new Date().toISOString()
    };

    let topic;
    try {
      topic = publishCommand(device.company.code, device.deviceId, payload);
    } catch (err) {
      throw new HttpError(503, err.message);
    }

    res.locals.auditMeta = { deviceId: device.deviceId, command: req.body.command, topic };
    res.json({ ok: true, topic, payload });
  })
);

export default router;
