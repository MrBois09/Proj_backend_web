import mongoose from 'mongoose';

const wishlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true }
}, { timestamps: true });

wishlistSchema.index({ userId: 1, gameId: 1 }, { unique: true });
wishlistSchema.index({ userId: 1, createdAt: -1 });

export const Wishlist = mongoose.model('Wishlist', wishlistSchema);
