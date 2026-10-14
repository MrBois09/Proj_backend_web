import { Router } from 'express';
import { uploadImages } from '../controllers/uploadController.js';
import { updateAvatar } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { parseMultipleUpload, parseSingleUpload } from '../middleware/imageUpload.js';
import { uploadRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post('/avatar', requireAuth, uploadRateLimit, parseSingleUpload('image'), uploadImages('avatars'));
router.post('/avatar/profile', requireAuth, uploadRateLimit, parseSingleUpload('image'), uploadImages('avatars', false, false), updateAvatar);
router.post('/game-cover', requireAuth, uploadRateLimit, parseSingleUpload('image'), uploadImages('game-covers'));
router.post('/game-banner', requireAuth, uploadRateLimit, parseSingleUpload('image'), uploadImages('game-banners'));
router.post('/screenshots', requireAuth, uploadRateLimit, parseMultipleUpload('images'), uploadImages('screenshots', true));
router.post('/review-images', requireAuth, uploadRateLimit, parseMultipleUpload('images'), uploadImages('review-images', true));

export default router;
