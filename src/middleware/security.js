import crypto from 'node:crypto';
import { getAllowedOrigins } from '../config/env.js';
import { cookieOptions, cookieNames } from './auth.js';
import { AppError } from '../utils/errors.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const csrfExemptPaths = new Set(['/auth/register', '/auth/login', '/auth/forgot-password', '/auth/reset-password']);

export function csrfCookie(req, res, next) {
  const token = req.cookies?.[cookieNames().csrf] || crypto.randomBytes(24).toString('hex');
  req.csrfToken = token;
  if (!req.cookies?.[cookieNames().csrf]) {
    const options = cookieOptions();
    res.cookie(cookieNames().csrf, token, { ...options, httpOnly: false, maxAge: 24 * 60 * 60 * 1000 });
  }
  next();
}

export function csrfProtection(req, _res, next) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const allowedOrigins = getAllowedOrigins();
  if (origin && !allowedOrigins.includes(origin.replace(/\/$/, ''))) {
    return next(new AppError('Request origin is not allowed', 403));
  }
  if (!origin && fetchSite === 'cross-site') return next(new AppError('Cross-site request rejected', 403));
  if (csrfExemptPaths.has(req.path.replace(/^\/api/, ''))) return next();
  const cookieToken = req.cookies?.[cookieNames().csrf];
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return next(new AppError('CSRF token is missing or invalid', 403, 'CSRF_INVALID'));
  }
  return next();
}
