import mongoose from 'mongoose';

const refreshSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = mongoose.model('RefreshSession', refreshSessionSchema);
