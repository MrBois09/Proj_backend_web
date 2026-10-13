import { AppError } from '../utils/errors.js';
import { parse } from '../validators/common.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    try {
      req.validatedBody = parse(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateId(paramName = 'id') {
  return (req, _res, next) => {
    if (!/^[a-f\d]{24}$/i.test(req.params[paramName] || '')) {
      return next(new AppError(`Invalid ${paramName}`, 400));
    }
    return next();
  };
}
