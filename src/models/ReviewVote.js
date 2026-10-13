import mongoose from 'mongoose';

const reviewVoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true },
  type: { type: String, enum: ['like', 'helpful', 'notHelpful'], required: true }
}, { timestamps: true });

reviewVoteSchema.index({ userId: 1, reviewId: 1, type: 1 }, { unique: true });
reviewVoteSchema.index({ reviewId: 1, type: 1 });

export const ReviewVote = mongoose.model('ReviewVote', reviewVoteSchema);
