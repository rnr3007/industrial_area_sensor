import logger from '../utils/logger.js';
import HttpError from '../utils/http-error.js';

export function notFound(_req, _res, next) {
  next(HttpError.notFound('Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.name === 'ZodError') {
    status = 400;
    message = 'Validation failed';
    details = Object.fromEntries(err.issues.map((issue) => [issue.path.join('.') || '_', issue.message]));
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed';
    details = Object.fromEntries(Object.entries(err.errors).map(([field, e]) => [field, e.message]));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err.code === 11000) {
    status = 409;
    message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ')}`;
  }

  if (status >= 500) logger.error(err.stack || err.message);

  res.status(status).json({ error: message, ...(details ? { details } : {}) });
}
