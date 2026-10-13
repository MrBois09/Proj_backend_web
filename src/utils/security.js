import crypto from 'node:crypto';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isImageBuffer(buffer) {
  if (buffer.length < 12) return false;
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return png || jpeg || webp;
}

export function expirationDate(minutes) {
  return new Date(Date.now() + Number(minutes) * 60_000);
}

export function durationMilliseconds(value, fallback) {
  const match = String(value || fallback).match(/^(\d+)(s|m|h|d)$/);
  if (!match || Number(match[1]) < 1) throw new Error('Token expiration must use a positive duration in seconds, minutes, hours, or days');
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Number(match[1]) * unit;
}
