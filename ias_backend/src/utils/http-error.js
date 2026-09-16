export default class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details) {
    return new HttpError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new HttpError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new HttpError(403, message);
  }

  static notFound(message = 'Not found') {
    return new HttpError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new HttpError(409, message);
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
