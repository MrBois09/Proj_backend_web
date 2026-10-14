import { z } from 'zod';
import { Game } from '../models/Game.js';
import { Review } from '../models/Review.js';
import { Favorite } from '../models/Favorite.js';
import { Wishlist } from '../models/Wishlist.js';
import { ReviewVote } from '../models/ReviewVote.js';
import { GamePlatform } from '../models/GamePlatform.js';
import { GameTag } from '../models/GameTag.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { escapeRegex } from '../utils/security.js';
import { paginated, success } from '../utils/response.js';
import { cloudinaryImageUrl, parse } from '../validators/common.js';
import { claimUploadedAssets, releaseUploadedAssets } from '../utils/assets.js';

const gameInputBaseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  coverImageUrl: cloudinaryImageUrl.optional().or(z.literal('')),
  coverPublicId: z.string().max(255).optional(),
  bannerImageUrl: cloudinaryImageUrl.optional().or(z.literal('')),
  bannerPublicId: z.string().max(255).optional(),
  screenshots: z.array(z.object({
    url: cloudinaryImageUrl,
    publicId: z.string().min(1).max(255)
  })).max(12).optional(),
  description: z.string().trim().min(1).max(10000),
  genres: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  platforms: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  releaseDate: z.coerce.date().optional(),
  releaseYear: z.coerce.number().int().min(1950).max(2100).optional(),
  developer: z.string().trim().max(120).optional(),
  publisher: z.string().trim().max(120).optional(),
  officialWebsite: z.string().url().max(2048).refine((value) => /^https?:\/\//i.test(value)).optional().or(z.literal(''))
});

function gameInputSchema(schema) {
  return schema.superRefine((value, context) => {
    if (!Object.keys(value).length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one game field is required' });
    }
    for (const key of ['cover', 'banner']) {
      const url = value[`${key}ImageUrl`];
      const publicId = value[`${key}PublicId`];
      if (Boolean(url) !== Boolean(publicId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [`${key}ImageUrl`], message: 'Image URL and Cloudinary public ID must be provided together' });
      }
    }
  });
}

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110);
}

function gameImages(game) {
  return [
    game.coverImageUrl && { url: game.coverImageUrl, publicId: game.coverPublicId },
    game.bannerImageUrl && { url: game.bannerImageUrl, publicId: game.bannerPublicId },
    ...(game.screenshots || [])
  ].filter(Boolean);
}

function parseListQuery(query) {
  return parse(z.object({
    search: z.string().trim().max(100).optional(),
    genre: z.string().trim().min(1).max(40).optional(),
    platform: z.string().trim().min(1).max(60).optional(),
    minRating: z.coerce.number().min(0).max(10).optional(),
    releaseYear: z.coerce.number().int().min(1950).max(2100).optional(),
    communityAdded: z.enum(['true', 'false']).optional(),
    sort: z.enum(['popular', 'highestRated', 'mostReviewed', 'newestReleases', 'recentlyAdded', 'alphabetical']).default('popular'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12)
  }), query);
}

const sortOptions = {
  popular: { reviewCount: -1, averageRating: -1, _id: -1 },
  highestRated: { averageRating: -1, reviewCount: -1, _id: -1 },
  mostReviewed: { reviewCount: -1, _id: -1 },
  newestReleases: { releaseDate: -1, _id: -1 },
  recentlyAdded: { createdAt: -1, _id: -1 },
  alphabetical: { title: 1, _id: 1 }
};

async function validateCatalogValues(input) {
  const [tags, platforms] = await Promise.all([
    input.genres?.length ? GameTag.find({ name: { $in: input.genres } }).select('name').lean() : [],
    input.platforms?.length ? GamePlatform.find({ name: { $in: input.platforms } }).select('name').lean() : []
  ]);
  const validTags = new Set(tags.map((tag) => tag.name));
  const validPlatforms = new Set(platforms.map((platform) => platform.name));
  const invalidTags = (input.genres || []).filter((tag) => !validTags.has(tag));
  const invalidPlatforms = (input.platforms || []).filter((platform) => !validPlatforms.has(platform));
  if (invalidTags.length || invalidPlatforms.length) {
    const error = new AppError('Validation failed', 422);
    error.errors = [
      ...invalidTags.map((tag) => ({ field: 'genres', message: `Unsupported game tag: ${tag}` })),
      ...invalidPlatforms.map((platform) => ({ field: 'platforms', message: `Unsupported platform: ${platform}` }))
    ];
    throw error;
  }
}

async function validateCatalogFilters(input) {
  const [tag, platform] = await Promise.all([
    input.genre ? GameTag.exists({ name: input.genre }) : true,
    input.platform ? GamePlatform.exists({ name: input.platform }) : true
  ]);
  if (!tag || !platform) throw new AppError('Unknown game tag or platform', 422);
}

export const listGames = asyncHandler(async (req, res) => {
  const input = parseListQuery(req.query);
  await validateCatalogFilters(input);
  const filter = { approvalStatus: { $ne: 'rejected' } };
  if (input.search) {
    const pattern = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ title: pattern }, { genres: pattern }, { platforms: pattern }, { developer: pattern }, { publisher: pattern }];
  }
  if (input.genre) filter.genres = { $regex: `^${escapeRegex(input.genre)}$`, $options: 'i' };
  if (input.platform) filter.platforms = { $regex: `^${escapeRegex(input.platform)}$`, $options: 'i' };
  if (input.minRating !== undefined) filter.averageRating = { $gte: input.minRating };
  if (input.releaseYear !== undefined) filter.releaseYear = input.releaseYear;
  if (input.communityAdded === 'true') filter.submittedBy = { $exists: true };
  if (input.communityAdded === 'false') filter.submittedBy = { $exists: false };
  const [data, total] = await Promise.all([
    Game.find(filter).sort(sortOptions[input.sort]).skip((input.page - 1) * input.limit).limit(input.limit)
      .populate('submittedBy', 'username displayName').lean(),
    Game.countDocuments(filter)
  ]);
  return success(res, data, 'Games retrieved successfully', 200, paginated(input.page, input.limit, total));
});

async function curatedList(req, res, filter, sort, message) {
  const { page, limit } = parse(z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12)
  }), req.query);
  const where = { approvalStatus: { $ne: 'rejected' }, ...filter };
  const [data, total] = await Promise.all([
    Game.find(where).sort(sort).skip((page - 1) * limit).limit(limit).populate('submittedBy', 'username displayName').lean(),
    Game.countDocuments(where)
  ]);
  return success(res, data, message, 200, paginated(page, limit, total));
}

export const featuredGames = asyncHandler((req, res) =>
  curatedList(req, res, {}, { reviewCount: -1, averageRating: -1, _id: -1 }, 'Featured games retrieved'));
export const trendingGames = asyncHandler((req, res) =>
  curatedList(req, res, {}, { reviewCount: -1, updatedAt: -1, _id: -1 }, 'Trending games retrieved'));
export const topRatedGames = asyncHandler((req, res) =>
  curatedList(req, res, { reviewCount: { $gt: 0 } }, { averageRating: -1, reviewCount: -1, _id: -1 }, 'Top-rated games retrieved'));
export const newReleases = asyncHandler((req, res) =>
  curatedList(req, res, { releaseDate: { $lte: new Date() } }, { releaseDate: -1, _id: -1 }, 'New releases retrieved'));

export const getGame = asyncHandler(async (req, res) => {
  const value = req.params.idOrSlug;
  const query = /^[a-f\d]{24}$/i.test(value) ? { _id: value } : { slug: value.toLowerCase() };
  const game = await Game.findOne({ ...query, approvalStatus: { $ne: 'rejected' } }).populate('submittedBy', 'username displayName');
  if (!game) throw new AppError('Game not found', 404);
  const distribution = await Review.aggregate([
    { $match: { gameId: game._id } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const ratingCounts = distribution.reduce((counts, row) => {
    counts[row._id] = row.count;
    return counts;
  }, Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, 0])));
  return success(res, {
    game,
    ratingDistribution: ratingCounts
  }, 'Game retrieved successfully');
});

export const createGame = asyncHandler(async (req, res) => {
  const input = parse(gameInputSchema(gameInputBaseSchema.extend({
    coverImageUrl: cloudinaryImageUrl,
    coverPublicId: z.string().min(1).max(255)
  })), req.body);
  await validateCatalogValues(input);
  if (await Game.exists({ title: { $regex: `^${escapeRegex(input.title)}$`, $options: 'i' } })) {
    throw new AppError('A game with this title already exists', 409);
  }
  let slug = slugify(input.title);
  if (!slug) throw new AppError('Game title cannot be converted to a valid slug', 422);
  if (await Game.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
  const images = gameImages(input);
  const claimed = await claimUploadedAssets(req.user.id, images);
  let game;
  try {
    game = await Game.create({
      ...input,
      slug,
      releaseYear: input.releaseYear || input.releaseDate?.getFullYear(),
      submittedBy: req.user.id,
      approvalStatus: 'approved'
    });
  } catch (error) {
    await releaseUploadedAssets(claimed);
    throw error;
  }
  return success(res, game, 'Game created and published', 201);
});

export const updateGame = asyncHandler(async (req, res) => {
  const input = parse(gameInputSchema(gameInputBaseSchema.partial()), req.body);
  await validateCatalogValues(input);
  const existing = await Game.findById(req.params.id);
  if (!existing) throw new AppError('Game not found', 404);
  if (input.title && input.title.toLowerCase() !== existing.title.toLowerCase()) {
    if (await Game.exists({ _id: { $ne: existing.id }, title: { $regex: `^${escapeRegex(input.title)}$`, $options: 'i' } })) {
      throw new AppError('A game with this title already exists', 409);
    }
    let slug = slugify(input.title);
    if (await Game.exists({ _id: { $ne: existing.id }, slug })) slug = `${slug}-${Date.now().toString(36)}`;
    input.slug = slug;
  }
  if (input.coverImageUrl === '') input.coverPublicId = '';
  if (input.bannerImageUrl === '') input.bannerPublicId = '';
  if (input.coverPublicId === '') input.coverImageUrl = '';
  if (input.bannerPublicId === '') input.bannerImageUrl = '';
  const oldImages = gameImages(existing.toObject());
  const nextImages = gameImages({ ...existing.toObject(), ...input });
  const unchanged = nextImages.filter((image) => oldImages.some((old) => old.publicId === image.publicId && old.url === image.url));
  const newlyClaimed = await claimUploadedAssets(req.user.id, nextImages, unchanged);
  try {
    Object.assign(existing, input);
    if (input.releaseDate) existing.releaseYear = input.releaseYear || input.releaseDate.getFullYear();
    await existing.save();
  } catch (error) {
    await releaseUploadedAssets(newlyClaimed);
    throw error;
  }
  const removed = oldImages.filter((image) => !nextImages.some((next) => next.publicId === image.publicId));
  await releaseUploadedAssets(removed);
  return success(res, existing, 'Game updated successfully');
});

export const deleteGame = asyncHandler(async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (!game) throw new AppError('Game not found', 404);
  const reviews = await Review.find({ gameId: game.id }).select('_id images').lean();
  await Promise.all([
    ReviewVote.deleteMany({ reviewId: { $in: reviews.map((review) => review._id) } }),
    Review.deleteMany({ gameId: game.id }),
    Wishlist.deleteMany({ gameId: game.id }),
    Favorite.deleteMany({ gameId: game.id }),
    game.deleteOne()
  ]);
  await releaseUploadedAssets([
    ...gameImages(game.toObject()),
    ...reviews.flatMap((review) => review.images || [])
  ]);
  return success(res, null, 'Game deleted successfully');
});
