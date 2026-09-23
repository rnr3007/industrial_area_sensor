import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/http-error.js';
import { validate } from '../middleware/validate.js';
import { requireDeviceKey } from '../middleware/device-auth.js';
import { processReading } from '../services/esp32.service.js';

const router = Router();

const readingSchema = z.object({
  currentMA: z.number().finite(),
  flowRate: z.number().finite(),
  totalLiters: z.number().finite()
});

/**
 * The ESP32 posts here once per sample (matching its own SAMPLE_INTERVAL_MS)
 * instead of hosting its own /data endpoint for us to poll. Mounted at the
 * app root (not under /api) since this is a device-to-server endpoint, not
 * a browser-facing one - see app.js.
 */
router.post(
  '/',
  requireDeviceKey,
  validate(readingSchema),
  asyncHandler(async (req, res) => {
    processReading(req.body);
    res.json({ ok: true });
  })
);

export default router;
