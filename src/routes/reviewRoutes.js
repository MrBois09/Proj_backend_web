import { Router } from 'express';
import {
  deleteReview, getRecentReviews, getReview, getReviews, getUserReviews,
  likeReview, setReviewVote, unlikeReview, updateReview
} from '../controllers/reviewController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';

const router = Router();

router.get('/', getReviews);
router.get('/recent', getRecentReviews);
router.get('/users/:username', getUserReviews);
router.get('/:id', validateId(), getReview);
router.patch('/:id', requireAuth, validateId(), updateReview);
router.delete('/:id', requireAuth, validateId(), deleteReview);
router.post('/:id/like', requireAuth, validateId(), likeReview);
router.delete('/:id/like', requireAuth, validateId(), unlikeReview);
router.post('/:id/vote', requireAuth, validateId(), setReviewVote);

export default router;
