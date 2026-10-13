import { Router } from 'express';
import {
  createGame, deleteGame, featuredGames, getGame, listGames, listPendingGames, moderateGame,
  newReleases, topRatedGames, trendingGames, updateGame
} from '../controllers/gameController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';

const router = Router();

router.get('/', listGames);
router.get('/featured', featuredGames);
router.get('/trending', trendingGames);
router.get('/top-rated', topRatedGames);
router.get('/new-releases', newReleases);
router.get('/pending', requireAuth, requireAdmin, listPendingGames);
router.post('/', requireAuth, createGame);
router.patch('/:id/moderate', requireAuth, requireAdmin, validateId(), moderateGame);
router.patch('/:id', requireAuth, requireAdmin, validateId(), updateGame);
router.delete('/:id', requireAuth, requireAdmin, validateId(), deleteGame);
router.get('/:idOrSlug', getGame);

export default router;
