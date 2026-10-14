import mongoose from 'mongoose';

const gamePlatformSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 60 },
  sortOrder: { type: Number, required: true, min: 0 }
}, { timestamps: true });

export const GamePlatform = mongoose.model('GamePlatform', gamePlatformSchema);
