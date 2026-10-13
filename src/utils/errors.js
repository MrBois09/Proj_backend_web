export class AppError extends Error {
  constructor(message, statusCode = 500, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
