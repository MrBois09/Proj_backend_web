import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true }
}, { timestamps: true });

favoriteSchema.index({ userId: 1, gameId: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, createdAt: -1 });

export const Favorite = mongoose.model('Favorite', favoriteSchema);
