import { Router } from 'express';
import authRoutes from './authRoutes.js';
import gameRoutes from './gameRoutes.js';
import reviewRoutes from './reviewRoutes.js';
import userRoutes from './userRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import { createReview, getGameReviews } from '../controllers/reviewController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';

const router = Router();
router.use('/auth', authRoutes);
router.use('/games', gameRoutes);
router.get('/games/:gameId/reviews', getGameReviews);
router.post('/games/:gameId/reviews', requireAuth, validateId('gameId'), createReview);
router.use('/reviews', reviewRoutes);
router.use('/users', userRoutes);
router.use('/uploads', uploadRoutes);

export default router;
