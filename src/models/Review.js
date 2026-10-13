import mongoose from 'mongoose';

const reviewImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, default: '' }
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
  content: { type: String, required: true, minlength: 1, maxlength: 10000 },
  rating: { type: Number, required: true, min: 1, max: 10, validate: Number.isInteger },
  pros: { type: [String], default: [] },
  cons: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  images: { type: [reviewImageSchema], default: [] },
  containsSpoilers: { type: Boolean, default: false },
  likesCount: { type: Number, default: 0, min: 0 },
  helpfulCount: { type: Number, default: 0, min: 0 },
  notHelpfulCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

reviewSchema.index({ userId: 1, gameId: 1 }, { unique: true });
reviewSchema.index({ createdAt: -1, _id: -1 });
reviewSchema.index({ gameId: 1, createdAt: -1, _id: -1 });
reviewSchema.index({ gameId: 1, rating: -1 });
reviewSchema.index({ title: 'text', content: 'text', tags: 'text' });

export const Review = mongoose.model('Review', reviewSchema);
