import { Router } from 'express';
import {
  addToFavorites, addToWishlist, getMyFavorites, getMyWishlist,
  getPublicFavorites, removeFromFavorites, removeFromWishlist
} from '../controllers/savedGameController.js';
import { getPublicProfile, updateMyProfile } from '../controllers/userController.js';
import { getUserReviews } from '../controllers/reviewController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';

const router = Router();

router.get('/me/wishlist', requireAuth, getMyWishlist);
router.post('/me/wishlist/:gameId', requireAuth, validateId('gameId'), addToWishlist);
router.delete('/me/wishlist/:gameId', requireAuth, validateId('gameId'), removeFromWishlist);
router.get('/me/favorites', requireAuth, getMyFavorites);
router.post('/me/favorites/:gameId', requireAuth, validateId('gameId'), addToFavorites);
router.delete('/me/favorites/:gameId', requireAuth, validateId('gameId'), removeFromFavorites);
router.patch('/me', requireAuth, updateMyProfile);
router.get('/:username/favorites', getPublicFavorites);
router.get('/:username/reviews', getUserReviews);
router.get('/:username', getPublicProfile);

export default router;
