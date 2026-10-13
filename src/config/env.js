const requiredInProduction = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CLIENT_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM_EMAIL'
];

export function validateEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
  if (process.env.JWT_ACCESS_SECRET.length < 32 || process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT secrets must contain at least 32 characters');
  }
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('Access and refresh JWT secrets must be different');
  }
  const sameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new Error('COOKIE_SAME_SITE must be Strict, Lax, or None');
  }
  const origins = getAllowedOrigins();
  if (!origins.length || origins.some((origin) => {
    try {
      const url = new URL(origin);
      return url.origin !== origin || url.protocol !== 'https:';
    } catch {
      return true;
    }
  })) {
    throw new Error('CLIENT_URL must contain exact HTTPS origins in production');
  }
}

export function getAllowedOrigins() {
  return (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
