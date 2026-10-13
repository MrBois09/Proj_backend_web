import { z } from 'zod';
import { AppError } from '../utils/errors.js';

export const cloudinaryImageUrl = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}, 'Image must be stored on Cloudinary');

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new AppError('Validation failed', 422);
    error.errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message
    }));
    throw error;
  }
  return result.data;
}

export const idParamSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID') });
export const gameIdParamSchema = z.object({ gameId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid game ID') });
