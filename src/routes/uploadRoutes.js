import { Router } from 'express';
import multer from 'multer';
import { uploadImages } from '../controllers/uploadController.js';
import { updateAvatar } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadRateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../utils/errors.js';

const router = Router();
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8, fields: 10 },
  fileFilter: (_req, file, callback) => callback(
    acceptedTypes.has(file.mimetype) ? null : new AppError('Only JPG, PNG, or WebP images are accepted', 422),
    acceptedTypes.has(file.mimetype)
  )
});
const parseSingle = (field) => (req, res, next) => upload.single(field)(req, res, (error) => next(error));
const parseMultiple = (field) => (req, res, next) => upload.array(field, 8)(req, res, (error) => next(error));

router.post('/avatar', requireAuth, uploadRateLimit, parseSingle('image'), uploadImages('avatars'));
router.post('/avatar/profile', requireAuth, uploadRateLimit, parseSingle('image'), uploadImages('avatars', false, false), updateAvatar);
router.post('/game-cover', requireAuth, uploadRateLimit, parseSingle('image'), uploadImages('game-covers'));
router.post('/game-banner', requireAuth, uploadRateLimit, parseSingle('image'), uploadImages('game-banners'));
router.post('/screenshots', requireAuth, uploadRateLimit, parseMultiple('images'), uploadImages('screenshots', true));
router.post('/review-images', requireAuth, uploadRateLimit, parseMultiple('images'), uploadImages('review-images', true));

export default router;
