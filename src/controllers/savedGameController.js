import mongoose from 'mongoose';
import { z } from 'zod';
import { Favorite } from '../models/Favorite.js';
import { Game } from '../models/Game.js';
import { User } from '../models/User.js';
import { Wishlist } from '../models/Wishlist.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { escapeRegex } from '../utils/security.js';
import { paginated, success } from '../utils/response.js';
import { parse } from '../validators/common.js';

const models = { wishlist: Wishlist, favorites: Favorite };

const savedQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'title', 'highestRated', 'releaseDate']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(24)
});

const savedSorts = {
  newest: { createdAt: -1, _id: -1 },
  title: { 'game.title': 1, _id: 1 },
  highestRated: { 'game.averageRating': -1, _id: -1 },
  releaseDate: { 'game.releaseDate': -1, _id: -1 }
};

async function querySavedGames(Model, userId, input) {
  const pipeline = [
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $lookup: { from: 'games', localField: 'gameId', foreignField: '_id', as: 'game' } },
    { $unwind: '$game' },
    { $match: { 'game.approvalStatus': { $ne: 'rejected' } } }
  ];
  if (input.search) {
    const pattern = new RegExp(escapeRegex(input.search), 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'game.title': pattern },
          { 'game.genres': pattern },
          { 'game.platforms': pattern }
        ]
      }
    });
  }
  pipeline.push(
    { $sort: savedSorts[input.sort] },
    {
      $facet: {
        data: [
          { $skip: (input.page - 1) * input.limit },
          { $limit: input.limit },
          { $replaceRoot: { newRoot: { $mergeObjects: ['$game', { savedAt: '$createdAt' }] } } }
        ],
        total: [{ $count: 'count' }]
      }
    }
  );
  const [result] = await Model.aggregate(pipeline);
  const total = result?.total[0]?.count || 0;
  return { data: result?.data || [], total };
}

export function listSavedGames(kind) {
  return asyncHandler(async (req, res) => {
    const input = parse(savedQuerySchema, req.query);
    const Model = models[kind];
    const { data, total } = await querySavedGames(Model, req.user.id, input);
    return success(res, data, `${kind} retrieved successfully`, 200, paginated(input.page, input.limit, total));
  });
}

export function addSavedGame(kind) {
  return asyncHandler(async (req, res) => {
    const Model = models[kind];
    if (!/^[a-f\d]{24}$/i.test(req.params.gameId)) throw new AppError('Invalid gameId', 400);
    const game = await Game.findOne({ _id: req.params.gameId, approvalStatus: { $ne: 'rejected' } }).select('_id');
    if (!game) throw new AppError('Game not found', 404);
    try {
      await Model.updateOne(
        { userId: req.user.id, gameId: game.id },
        { $setOnInsert: { userId: req.user.id, gameId: game.id } },
        { upsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    return success(res, { gameId: game.id, saved: true }, `Added to ${kind}`);
  });
}

export function removeSavedGame(kind) {
  return asyncHandler(async (req, res) => {
    const Model = models[kind];
    if (!/^[a-f\d]{24}$/i.test(req.params.gameId)) throw new AppError('Invalid gameId', 400);
    await Model.deleteOne({ userId: req.user.id, gameId: req.params.gameId });
    return success(res, { gameId: req.params.gameId, saved: false }, `Removed from ${kind}`);
  });
}

export const getMyWishlist = listSavedGames('wishlist');
export const addToWishlist = addSavedGame('wishlist');
export const removeFromWishlist = removeSavedGame('wishlist');
export const getMyFavorites = listSavedGames('favorites');
export const addToFavorites = addSavedGame('favorites');
export const removeFromFavorites = removeSavedGame('favorites');

export const getPublicFavorites = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('_id');
  if (!user) throw new AppError('User not found', 404);
  const input = parse(savedQuerySchema, req.query);
  const { data, total } = await querySavedGames(Favorite, user.id, input);
  return success(res, data, 'Public favorites retrieved successfully', 200, paginated(input.page, input.limit, total));
});
