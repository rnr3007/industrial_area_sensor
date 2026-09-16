import { Router } from 'express';
import { asyncHandler } from '../utils/http-error.js';
import HttpError from '../utils/http-error.js';
import { publishCommand } from '../services/mqtt.service.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Guest operators get a read-only dashboard (they only ever get /api/state
// and /api/logs, and the socket stream) - every write here needs at least
// operator.
router.use(authenticate, authorize('admin', 'operator'));

/** Auto / manual mode switch. */
router.post(
  '/mode',
  asyncHandler(async (req, res) => {
    const { mode } = req.body;
    if (!['auto', 'manual'].includes(mode)) {
      throw HttpError.badRequest('mode must be "auto" or "manual"');
    }
    publishCommand({ type: 'mode', mode });
    res.json({ ok: true });
  })
);

/** Manual compressor on/off. Ignored by the device outside manual mode. */
router.post(
  '/compressor',
  asyncHandler(async (req, res) => {
    const { on } = req.body;
    if (typeof on !== 'boolean') throw HttpError.badRequest('on must be a boolean');
    publishCommand({ type: 'compressor', on });
    res.json({ ok: true });
  })
);

/** Rubber deflate toggle. Manual mode only. */
router.post(
  '/deflate',
  asyncHandler(async (req, res) => {
    const { active } = req.body;
    if (typeof active !== 'boolean') throw HttpError.badRequest('active must be a boolean');
    publishCommand({ type: 'deflate', active });
    res.json({ ok: true });
  })
);

/** Auto-mode pressure thresholds. */
router.post(
  '/threshold',
  asyncHandler(async (req, res) => {
    const min = Number(req.body.min);
    const max = Number(req.body.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw HttpError.badRequest('min/max must be numbers with min < max');
    }
    publishCommand({ type: 'threshold', min, max });
    res.json({ ok: true });
  })
);

export default router;
