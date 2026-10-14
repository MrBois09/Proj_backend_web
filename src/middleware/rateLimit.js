import rateLimit from 'express-rate-limit';

export function createRateLimiter(max = 10, windowMs = 15 * 60 * 1000, useGlobalConfig = false) {
  return rateLimit({
    windowMs: useGlobalConfig ? Number(process.env.RATE_LIMIT_WINDOW_MS || windowMs) : windowMs,
    limit: useGlobalConfig ? Number(process.env.RATE_LIMIT_MAX_REQUESTS || max) : max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' }
  });
}

export const authRateLimit = createRateLimiter(8);
export const uploadRateLimit = createRateLimiter(20);
export const globalRateLimit = createRateLimiter(100, 15 * 60 * 1000, true);
