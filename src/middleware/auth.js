import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { durationMilliseconds } from '../utils/security.js';

export function cookieNames() {
  return {
    access: process.env.COOKIE_NAME || 'gr_access',
    refresh: process.env.REFRESH_COOKIE_NAME || 'gr_refresh',
    csrf: 'gr_csrf'
  };
}

export function cookieOptions() {
  const sameSite = process.env.COOKIE_SAME_SITE || 'lax';
  const secure = process.env.NODE_ENV === 'production' || sameSite.toLowerCase() === 'none';
  return {
    httpOnly: true,
    secure,
    sameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/'
  };
}

export function setAuthCookies(res, accessToken, refreshToken) {
  const names = cookieNames();
  const options = cookieOptions();
  res.cookie(names.access, accessToken, {
    ...options,
    maxAge: durationMilliseconds(process.env.ACCESS_TOKEN_EXPIRES_IN, '15m')
  });
  res.cookie(names.refresh, refreshToken, {
    ...options,
    maxAge: durationMilliseconds(process.env.REFRESH_TOKEN_EXPIRES_IN, '7d')
  });
}

export function clearAuthCookies(res) {
  const names = cookieNames();
  const options = cookieOptions();
  res.clearCookie(names.access, options);
  res.clearCookie(names.refresh, options);
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[cookieNames().access];
  if (!token) throw new AppError('Authentication required', 401);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    throw new AppError('Authentication required', 401);
  }
  const user = await User.findById(payload.sub)
    .select('displayName username email avatarUrl bio favoriteTags emailVerified createdAt +sessionVersion');
  if (!user) throw new AppError('Authentication required', 401);
  if (payload.sv !== user.sessionVersion) throw new AppError('Authentication required', 401);
  req.user = user;
  next();
});

export function requireAdmin(req, _res, next) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!req.user || !admins.includes(req.user.email)) return next(new AppError('Administrator access required', 403));
  return next();
}
