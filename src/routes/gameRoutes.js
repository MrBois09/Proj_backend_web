import { Router } from 'express';
import {
  createGame, deleteGame, featuredGames, getGame, listGames,
  newReleases, topRatedGames, trendingGames, updateGame
} from '../controllers/gameController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { GamePlatform } from '../models/GamePlatform.js';
import { GameTag } from '../models/GameTag.js';
import { PopularTag } from '../models/PopularTag.js';
import { asyncHandler } from '../utils/errors.js';
import { success } from '../utils/response.js';

const router = Router();

router.get('/', listGames);
const getCatalogNames = (Model, message) => asyncHandler(async (_req, res) => {
  const options = await Model.find().sort({ sortOrder: 1, name: 1 }).select('name').lean();
  return success(res, options.map((option) => option.name), message);
});
const getGameTags = getCatalogNames(GameTag, 'Game tags retrieved');
router.get('/tags', getGameTags);
router.get('/genres', getGameTags);
router.get('/platforms', getCatalogNames(GamePlatform, 'Game platforms retrieved'));
router.get('/popular-tags', getCatalogNames(PopularTag, 'Popular tags retrieved'));
router.get('/featured', featuredGames);
router.get('/trending', trendingGames);
router.get('/top-rated', topRatedGames);
router.get('/new-releases', newReleases);
router.post('/', requireAuth, createGame);
router.patch('/:id', requireAuth, requireAdmin, updateGame);
router.delete('/:id', requireAuth, requireAdmin, deleteGame);
router.get('/:idOrSlug', getGame);

export default router;
