import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket?.remoteAddress ||
  '';

/**
 * Persist an audit entry. Never throws - auditing must not break a request.
 */
export async function recordAudit(req, { action, resource = '', resourceId = '', meta = {}, statusCode = 200, success = true }) {
  try {
    await AuditLog.create({
      user: req.user?._id ?? null,
      userName: req.user?.name ?? meta.attemptedEmail ?? 'anonymous',
      userEmail: req.user?.email ?? meta.attemptedEmail ?? '',
      role: req.user?.role ?? '',
      action,
      resource,
      resourceId: String(resourceId || ''),
      method: req.method,
      path: req.originalUrl,
      statusCode,
      success,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
      meta
    });
  } catch (err) {
    logger.warn(`audit write failed: ${err.message}`);
  }
}

/**
 * Route-level auditor: logs once the response is flushed so the real status
 * code and the resolved resource id (set by the controller) are available.
 */
export const audit =
  (action, resource = '') =>
  (req, res, next) => {
    res.on('finish', () => {
      const success = res.statusCode < 400;
      recordAudit(req, {
        action,
        resource,
        resourceId: res.locals.auditResourceId || req.params.id || '',
        meta: res.locals.auditMeta || {},
        statusCode: res.statusCode,
        success
      });
    });
    next();
  };
