import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { User } from '../models/User.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { sendEmail } from '../config/mailer.js';
import { cookieNames, clearAuthCookies, setAuthCookies } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { createToken, durationMilliseconds, expirationDate, hashToken } from '../utils/security.js';
import { success } from '../utils/response.js';
import { parse } from '../validators/common.js';

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const usernameSchema = z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(128);

const registerSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && !value.displayName && typeof value.name === 'string') {
    return { ...value, displayName: value.name };
  }
  return value;
}, z.object({
  displayName: z.string().trim().min(1).max(80),
  username: usernameSchema.optional(),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().optional()
})).refine((value) => !value.confirmPassword || value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match'
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  username: z.string().trim().min(1).max(30).optional(),
  password: z.string().min(1).max(128)
}).refine((value) => value.identifier || value.email || value.username, {
  path: ['identifier'],
  message: 'Email or username is required'
});

function frontendUrl(pathVariable, fallbackPath, token) {
  const base = process.env.CLIENT_URL;
  if (!base) throw new Error('CLIENT_URL is not configured');
  const url = new URL(process.env[pathVariable] || fallbackPath, base);
  url.searchParams.set('token', token);
  return url.toString();
}

async function renderTemplate(filename, url) {
  const templatePath = fileURLToPath(new URL(`../templates/${filename}`, import.meta.url));
  const template = await readFile(templatePath, 'utf8');
  return template.replaceAll('{{url}}', url.replaceAll('&', '&amp;').replaceAll('"', '&quot;'));
}

async function sendTokenEmail({ email, token, template, pathVariable, fallbackPath, subject, text }) {
  const url = frontendUrl(pathVariable, fallbackPath, token);
  const html = await renderTemplate(template, url);
  await sendEmail({ to: email, subject, html, text: `${text}\n${url}` });
}

function createAccessToken(userId, sessionVersion = 0) {
  return jwt.sign(
    { sub: userId.toString(), sv: sessionVersion },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m' }
  );
}

async function createRefreshToken(userId) {
  const expiresAt = new Date(Date.now() + durationMilliseconds(process.env.REFRESH_TOKEN_EXPIRES_IN, '7d'));
  const session = await RefreshSession.create({ userId, tokenHash: 'pending', expiresAt });
  const token = jwt.sign(
    { sub: userId.toString(), sid: session.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
  session.tokenHash = hashToken(token);
  await session.save();
  return token;
}

async function issueSession(user, res) {
  const accessToken = createAccessToken(user.id, user.sessionVersion);
  const refreshToken = await createRefreshToken(user.id);
  setAuthCookies(res, accessToken, refreshToken);
}

function publicUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    favoriteTags: user.favoriteTags,
    createdAt: user.createdAt
  };
}

export const register = asyncHandler(async (req, res) => {
  const input = parse(registerSchema, req.body);
  let username = input.username;
  if (!username) {
    const localPart = input.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    const base = (localPart.length >= 3 ? localPart : `${localPart}player`).slice(0, 30);
    username = base;
    let suffix = 1;
    while (await User.exists({ username })) {
      const suffixText = `_${suffix++}`;
      username = `${base.slice(0, 30 - suffixText.length)}${suffixText}`;
    }
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    displayName: input.displayName,
    username,
    email: input.email,
    passwordHash
  });
  return success(res, { user: publicUser(user) }, 'Account created successfully', 201);
});

export const login = asyncHandler(async (req, res) => {
  const input = parse(loginSchema, req.body);
  const identity = input.identifier || input.email || input.username;
  const lookup = identity.includes('@')
    ? { email: identity.toLowerCase() }
    : { username: identity.toLowerCase() };
  const user = await User.findOne(lookup).select('+passwordHash +sessionVersion');
  const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !passwordMatches) throw new AppError('Invalid email/username or password', 401);
  await issueSession(user, res);
  return success(res, { user: publicUser(user) }, 'Signed in successfully');
});

export const me = asyncHandler(async (req, res) => success(res, { user: publicUser(req.user) }, 'Current user retrieved'));

export const refresh = asyncHandler(async (req, res) => {
  const oldToken = req.cookies?.[cookieNames().refresh];
  if (!oldToken) throw new AppError('Refresh session is invalid or expired', 401);
  let payload;
  try {
    payload = jwt.verify(oldToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Refresh session is invalid or expired', 401);
  }
  const session = await RefreshSession.findOne({ _id: payload.sid, userId: payload.sub }).select('+tokenHash');
  if (!session || session.expiresAt <= new Date() || session.tokenHash !== hashToken(oldToken)) {
    throw new AppError('Refresh session is invalid or expired', 401);
  }
  const user = await User.findById(payload.sub)
    .select('displayName username email avatarUrl bio favoriteTags createdAt +sessionVersion');
  if (!user) throw new AppError('Refresh session is invalid or expired', 401);
  const expiresAt = new Date(Date.now() + durationMilliseconds(process.env.REFRESH_TOKEN_EXPIRES_IN, '7d'));
  const rotatedToken = jwt.sign(
    { sub: user.id, sid: session.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
  const updated = await RefreshSession.findOneAndUpdate(
    { _id: session.id, tokenHash: hashToken(oldToken) },
    { $set: { tokenHash: hashToken(rotatedToken), expiresAt } },
    { new: true }
  );
  if (!updated) throw new AppError('Refresh session is invalid or expired', 401);
  setAuthCookies(res, createAccessToken(user.id, user.sessionVersion), rotatedToken);
  return success(res, { user: publicUser(user) }, 'Session refreshed');
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[cookieNames().refresh];
  let payload;
  if (token) {
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      payload = undefined;
    }
  }
  if (payload) {
    await RefreshSession.deleteOne({ _id: payload.sid, userId: payload.sub, tokenHash: hashToken(token) });
  }
  clearAuthCookies(res);
  return success(res, null, 'Signed out successfully');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.body);
  const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpiresAt +passwordResetSentAt');
  if (user) {
    if (user.passwordResetSentAt && Date.now() - user.passwordResetSentAt.getTime() < 60_000) {
      return success(res, null, 'If an account exists for this address, password reset instructions will be sent');
    }
    const token = createToken();
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpiresAt = expirationDate(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES || 15);
    await user.save();
    try {
      await sendTokenEmail({
        email: user.email,
        token,
        template: 'reset-password.html',
        pathVariable: 'FRONTEND_RESET_PASSWORD_PATH',
        fallbackPath: '/reset-password',
        subject: 'Reset your Gamer Review password',
        text: 'Reset your password using this link:'
      });
      user.passwordResetSentAt = new Date();
      try {
        await user.save();
      } catch {
        console.error('Password reset email timestamp could not be stored');
      }
    } catch {
      console.error('Password reset email delivery failed');
    }
  }
  return success(res, null, 'If an account exists for this address, password reset instructions will be sent');
});

export const resetPassword = asyncHandler(async (req, res) => {
  const input = parse(z.object({
    token: z.string().min(32).max(256),
    newPassword: passwordSchema,
    confirmPassword: z.string().optional()
  }).refine((value) => !value.confirmPassword || value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match'
  }), req.body);
  const user = await User.findOne({
    passwordResetTokenHash: hashToken(input.token),
    passwordResetExpiresAt: { $gt: new Date() }
  }).select('+passwordResetTokenHash +passwordResetExpiresAt +sessionVersion');
  if (!user) throw new AppError('Reset link is invalid, expired, or already used', 400);
  user.passwordHash = await bcrypt.hash(input.newPassword, 12);
  user.sessionVersion += 1;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();
  await RefreshSession.deleteMany({ userId: user.id });
  clearAuthCookies(res);
  return success(res, null, 'Password reset successfully');
});

export const changePassword = asyncHandler(async (req, res) => {
  const input = parse(z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().optional()
  }).refine((value) => !value.confirmPassword || value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match'
  }), req.body);
  const user = await User.findById(req.user.id).select('+passwordHash +sessionVersion');
  if (!await bcrypt.compare(input.currentPassword, user.passwordHash)) {
    throw new AppError('Current password is incorrect', 400);
  }
  user.passwordHash = await bcrypt.hash(input.newPassword, 12);
  user.sessionVersion += 1;
  await user.save();
  await RefreshSession.deleteMany({ userId: user.id });
  clearAuthCookies(res);
  return success(res, null, 'Password changed successfully. Please sign in again.');
});
