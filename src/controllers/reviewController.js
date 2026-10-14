import mongoose from 'mongoose';
import { z } from 'zod';
import { Game } from '../models/Game.js';
import { Review } from '../models/Review.js';
import { ReviewVote } from '../models/ReviewVote.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { escapeRegex } from '../utils/security.js';
import { paginated, success } from '../utils/response.js';
import { cloudinaryImageUrl, parse } from '../validators/common.js';
import { claimUploadedAssets, discardUnclaimedAssets, releaseUploadedAssets } from '../utils/assets.js';
import { storeImages } from './uploadController.js';

const reviewInput = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(10000),
  rating: z.number().int().min(1).max(10),
  pros: z.array(z.string().trim().max(300)).max(20).optional(),
  cons: z.array(z.string().trim().max(300)).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  images: z.array(z.object({ url: cloudinaryImageUrl, publicId: z.string().min(1).max(255) })).max(8).optional(),
  containsSpoilers: z.boolean().optional()
});

function parseReviewQuery(query) {
  return parse(z.object({
    search: z.string().trim().max(100).optional(),
    sort: z.enum(['mostHelpful', 'mostRecent', 'newest', 'oldest', 'highestRating', 'lowestRating']).default('mostRecent'),
    minRating: z.coerce.number().int().min(1).max(10).optional(),
    maxRating: z.coerce.number().int().min(1).max(10).optional(),
    gameId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    genre: z.string().trim().max(40).optional(),
    platform: z.string().trim().max(60).optional(),
    tag: z.string().trim().max(40).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12)
  }).refine((value) => value.minRating === undefined || value.maxRating === undefined || value.minRating <= value.maxRating, {
    path: ['minRating'], message: 'minRating must not exceed maxRating'
  }), query);
}

const reviewSort = {
  mostHelpful: { helpfulCount: -1, createdAt: -1, _id: -1 },
  mostRecent: { createdAt: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  highestRating: { rating: -1, createdAt: -1, _id: -1 },
  lowestRating: { rating: 1, createdAt: -1, _id: -1 }
};

function normalizeMultipartReview(body) {
  const normalized = { ...body };
  if (normalized.rating !== undefined) normalized.rating = Number(normalized.rating);
  for (const field of ['pros', 'cons', 'tags']) {
    if (normalized[field] !== undefined && !Array.isArray(normalized[field])) {
      normalized[field] = [normalized[field]];
    }
  }
  if (normalized.containsSpoilers === 'true') normalized.containsSpoilers = true;
  if (normalized.containsSpoilers === 'false') normalized.containsSpoilers = false;
  return normalized;
}

async function listReviews(req, res, initialFilter = {}) {
  const input = parseReviewQuery(req.query);
  const filter = { ...initialFilter };
  if (input.gameId) filter.gameId = input.gameId;
  if (input.minRating !== undefined || input.maxRating !== undefined) {
    filter.rating = { ...(input.minRating === undefined ? {} : { $gte: input.minRating }), ...(input.maxRating === undefined ? {} : { $lte: input.maxRating }) };
  }
  if (input.tag) filter.tags = { $regex: `^${escapeRegex(input.tag)}$`, $options: 'i' };
  if (input.genre || input.platform) {
    const gameFilter = { approvalStatus: { $ne: 'rejected' } };
    if (input.genre) gameFilter.genres = { $regex: `^${escapeRegex(input.genre)}$`, $options: 'i' };
    if (input.platform) gameFilter.platforms = { $regex: `^${escapeRegex(input.platform)}$`, $options: 'i' };
    const games = await Game.find(gameFilter).select('_id').lean();
    filter.gameId = { $in: games.map((game) => game._id) };
  }
  if (input.search) {
    const pattern = new RegExp(escapeRegex(input.search), 'i');
    const [games, users] = await Promise.all([
      Game.find({ approvalStatus: { $ne: 'rejected' }, $or: [{ title: pattern }, { genres: pattern }, { platforms: pattern }] }).select('_id').lean(),
      User.find({ $or: [{ username: pattern }, { displayName: pattern }] }).select('_id').lean()
    ]);
    filter.$or = [
      { title: pattern }, { content: pattern }, { tags: pattern },
      { gameId: { $in: games.map((game) => game._id) } },
      { userId: { $in: users.map((user) => user._id) } }
    ];
  }
  const [data, total] = await Promise.all([
    Review.find(filter).sort(reviewSort[input.sort]).skip((input.page - 1) * input.limit).limit(input.limit)
      .populate('userId', 'username displayName avatarUrl')
      .populate('gameId', 'title slug coverImageUrl genres platforms releaseYear')
      .lean(),
    Review.countDocuments(filter)
  ]);
  return success(res, data, 'Reviews retrieved successfully', 200, paginated(input.page, input.limit, total));
}

export const getReviews = asyncHandler((req, res) => listReviews(req, res));
export const getRecentReviews = asyncHandler((req, res) => {
  req.query.sort = 'mostRecent';
  return listReviews(req, res);
});
export const getGameReviews = asyncHandler((req, res) => {
  if (!mongoose.isValidObjectId(req.params.gameId)) throw new AppError('Invalid gameId', 400);
  return listReviews(req, res, { gameId: req.params.gameId });
});
export const getUserReviews = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('_id');
  if (!user) throw new AppError('User not found', 404);
  return listReviews(req, res, { userId: user._id });
});

export const getReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id)
    .populate('userId', 'username displayName avatarUrl')
    .populate('gameId', 'title slug coverImageUrl genres platforms releaseYear');
  if (!review) throw new AppError('Review not found', 404);
  return success(res, review, 'Review retrieved successfully');
});

async function recalculateGame(gameId) {
  const [stats] = await Review.aggregate([
    { $match: { gameId: new mongoose.Types.ObjectId(gameId) } },
    { $group: { _id: '$gameId', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
  ]);
  await Game.updateOne(
    { _id: gameId },
    { $set: { averageRating: stats ? Math.round(stats.averageRating * 100) / 100 : 0, reviewCount: stats?.reviewCount || 0 } }
  );
}

export const createReview = asyncHandler(async (req, res) => {
  const isMultipart = req.is('multipart/form-data');
  const input = parse(reviewInput, isMultipart ? normalizeMultipartReview(req.body) : req.body);
  const game = await Game.findOne({ _id: req.params.gameId, approvalStatus: { $ne: 'rejected' } }).select('_id');
  if (!game) throw new AppError('Game not found', 404);
  if ((input.images?.length || 0) + (req.files?.length || 0) > 8) {
    throw new AppError('A review can include at most 8 images', 422);
  }
  const uploadedImages = req.files?.length
    ? await storeImages(req.user.id, 'review-images', req.files)
    : [];
  const completeInput = parse(reviewInput, {
    ...input,
    images: [...(input.images || []), ...uploadedImages]
  });
  let claimed = [];
  let review;
  try {
    claimed = await claimUploadedAssets(req.user.id, completeInput.images || []);
    review = await Review.create({ ...completeInput, userId: req.user.id, gameId: game.id });
  } catch (error) {
    await releaseUploadedAssets(claimed);
    await discardUnclaimedAssets(req.user.id, uploadedImages);
    throw error;
  }
  await recalculateGame(game.id);
  await review.populate([
    { path: 'userId', select: 'username displayName avatarUrl' },
    { path: 'gameId', select: 'title slug coverImageUrl genres platforms releaseYear' }
  ]);
  return success(res, review, 'Review published successfully', 201);
});

export const updateReview = asyncHandler(async (req, res) => {
  const input = parse(reviewInput.partial().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one review field is required'
  }), req.body);
  const review = await Review.findById(req.params.id);
  if (!review) throw new AppError('Review not found', 404);
  if (review.userId.toString() !== req.user.id) throw new AppError('You cannot edit this review', 403);
  const oldImages = review.images.map((image) => image.toObject());
  const nextImages = input.images || oldImages;
  const unchanged = nextImages.filter((image) => oldImages.some((old) => old.publicId === image.publicId && old.url === image.url));
  const newlyClaimed = await claimUploadedAssets(req.user.id, nextImages, unchanged);
  try {
    Object.assign(review, input);
    await review.save();
  } catch (error) {
    await releaseUploadedAssets(newlyClaimed);
    throw error;
  }
  await releaseUploadedAssets(oldImages.filter((image) => !nextImages.some((next) => next.publicId === image.publicId)));
  await recalculateGame(review.gameId);
  await review.populate([
    { path: 'userId', select: 'username displayName avatarUrl' },
    { path: 'gameId', select: 'title slug coverImageUrl genres platforms releaseYear' }
  ]);
  return success(res, review, 'Review updated successfully');
});

export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new AppError('Review not found', 404);
  if (review.userId.toString() !== req.user.id) throw new AppError('You cannot delete this review', 403);
  await Promise.all([
    ReviewVote.deleteMany({ reviewId: review.id }),
    review.deleteOne()
  ]);
  await releaseUploadedAssets(review.images.map((image) => image.toObject()));
  await recalculateGame(review.gameId);
  return success(res, null, 'Review deleted successfully');
});

async function refreshVoteCounts(reviewId) {
  const counts = await ReviewVote.aggregate([
    { $match: { reviewId: new mongoose.Types.ObjectId(reviewId) } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);
  const map = Object.fromEntries(counts.map(({ _id, count }) => [_id, count]));
  await Review.updateOne({ _id: reviewId }, {
    $set: { likesCount: map.like || 0, helpfulCount: map.helpful || 0, notHelpfulCount: map.notHelpful || 0 }
  });
}

async function checkCanVote(reviewId, userId) {
  const review = await Review.findById(reviewId).select('userId');
  if (!review) throw new AppError('Review not found', 404);
  if (review.userId.toString() === userId) throw new AppError('You cannot vote on your own review', 403);
  return review;
}

export const setReviewVote = asyncHandler(async (req, res) => {
  const { type } = parse(z.object({ type: z.enum(['like', 'helpful', 'notHelpful']) }), req.body);
  await checkCanVote(req.params.id, req.user.id);
  const voteTypes = type === 'like' ? ['like'] : ['helpful', 'notHelpful'];
  const existing = await ReviewVote.findOne({
    reviewId: req.params.id,
    userId: req.user.id,
    type: { $in: voteTypes }
  });
  if (existing?.type === type) {
    await existing.deleteOne();
  } else {
    if (type !== 'like') {
      await ReviewVote.deleteMany({
        reviewId: req.params.id,
        userId: req.user.id,
        type: { $in: ['helpful', 'notHelpful'] }
      });
    }
    await ReviewVote.findOneAndUpdate(
      { reviewId: req.params.id, userId: req.user.id, type },
      { $setOnInsert: { reviewId: req.params.id, userId: req.user.id, type } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }
  await refreshVoteCounts(req.params.id);
  const votes = await ReviewVote.find({ reviewId: req.params.id, userId: req.user.id }).select('type').lean();
  const liked = votes.some((vote) => vote.type === 'like');
  const helpfulVote = votes.find((vote) => vote.type === 'helpful' || vote.type === 'notHelpful')?.type || null;
  return success(res, { liked, helpfulVote }, 'Review vote state updated');
});

export const likeReview = asyncHandler(async (req, res) => {
  await checkCanVote(req.params.id, req.user.id);
  await ReviewVote.findOneAndUpdate(
    { reviewId: req.params.id, userId: req.user.id, type: 'like' },
    { $setOnInsert: { reviewId: req.params.id, userId: req.user.id, type: 'like' } },
    { upsert: true, new: true, runValidators: true }
  );
  await refreshVoteCounts(req.params.id);
  return success(res, { liked: true }, 'Review liked');
});

export const unlikeReview = asyncHandler(async (req, res) => {
  await checkCanVote(req.params.id, req.user.id);
  await ReviewVote.deleteOne({ reviewId: req.params.id, userId: req.user.id, type: 'like' });
  await refreshVoteCounts(req.params.id);
  return success(res, { liked: false }, 'Review unliked');
});
