import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  username: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  avatarUrl: { type: String, default: '' },
  avatarPublicId: { type: String, default: '', select: false },
  bio: { type: String, default: '', maxlength: 500 },
  favoriteTags: { type: [String], default: [] },
  sessionVersion: { type: Number, default: 0, min: 0, select: false },
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
  passwordResetSentAt: { type: Date, select: false }
}, { timestamps: true });

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
