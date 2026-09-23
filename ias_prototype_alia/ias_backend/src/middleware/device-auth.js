import config from '../config/index.js';
import HttpError from '../utils/http-error.js';

/**
 * Guards device-facing ingest routes (the ESP32, not a browser operator).
 * A shared secret in a custom header - simple enough for an Arduino
 * HTTPClient to send, and deliberately separate from the operator JWT
 * scheme so a leaked device key can never be used to sign in as a user.
 */
export function requireDeviceKey(req, _res, next) {
  const key = req.headers['x-device-key'];
  if (!key || key !== config.device.apiKey) {
    return next(HttpError.unauthorized('Invalid or missing device key'));
  }
  return next();
}
