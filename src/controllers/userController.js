import { z } from 'zod';
import { Favorite } from '../models/Favorite.js';
import { Review } from '../models/Review.js';
import { ReviewVote } from '../models/ReviewVote.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../validators/common.js';
import { claimUploadedAssets, releaseUploadedAssets } from '../utils/assets.js';

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).transform((value) => value.toLowerCase()).optional(),
  bio: z.string().trim().max(500).optional(),
  favoriteTags: z.array(z.string().trim().min(1).max(40)).max(30).optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one profile field is required');

export const getPublicProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username.toLowerCase() })
    .select('displayName username avatarUrl bio favoriteTags createdAt');
  if (!user) throw new AppError('User not found', 404);
  const [reviewStats, favoriteGamesCount, helpfulVotesReceived] = await Promise.all([
    Review.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, totalReviews: { $sum: 1 }, averageRatingGiven: { $avg: '$rating' } } }
    ]),
    Favorite.countDocuments({ userId: user.id }),
    Review.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, reviewIds: { $push: '$_id' } } },
      { $unwind: '$reviewIds' },
      { $lookup: { from: ReviewVote.collection.name, localField: 'reviewIds', foreignField: 'reviewId', as: 'votes' } },
      { $unwind: '$votes' },
      { $match: { 'votes.type': 'helpful' } },
      { $count: 'count' }
    ])
  ]);
  return success(res, {
    ...user.toObject(),
    stats: {
      totalReviews: reviewStats[0]?.totalReviews || 0,
      averageRatingGiven: reviewStats[0]?.averageRatingGiven ? Math.round(reviewStats[0].averageRatingGiven * 100) / 100 : 0,
      helpfulVotesReceived: helpfulVotesReceived[0]?.count || 0,
      favoriteGamesCount
    }
  }, 'Profile retrieved successfully');
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const input = parse(profileSchema, req.body);
  const user = await User.findByIdAndUpdate(req.user.id, { $set: input }, { new: true, runValidators: true })
    .select('displayName username email avatarUrl bio favoriteTags emailVerified createdAt');
  if (!user) throw new AppError('User not found', 404);
  return success(res, { user }, 'Profile updated successfully');
});

export const updateAvatar = asyncHandler(async (req, res) => {
  const { url, publicId } = parse(z.object({
    url: z.string().url().max(2048),
    publicId: z.string().min(1).max(255)
  }), req.uploadedImage);
  if (!url.startsWith('https://res.cloudinary.com/')) throw new AppError('Avatar must be uploaded to Cloudinary', 422);
  const oldUser = await User.findById(req.user.id).select('+avatarPublicId');
  if (!oldUser) throw new AppError('User not found', 404);
  const oldPublicId = oldUser.avatarPublicId;
  const oldImage = oldPublicId ? [{ url: oldUser.avatarUrl, publicId: oldPublicId }] : [];
  const unchanged = oldImage.filter((image) => image.publicId === publicId && image.url === url);
  const claimed = await claimUploadedAssets(req.user.id, [{ url, publicId }], unchanged);
  oldUser.avatarUrl = url;
  oldUser.avatarPublicId = publicId;
  try {
    await oldUser.save();
  } catch (error) {
    await releaseUploadedAssets(claimed);
    throw error;
  }
  if (oldImage.length && oldPublicId !== publicId) await releaseUploadedAssets(oldImage);
  return success(res, { avatarUrl: url }, 'Avatar updated successfully');
});
