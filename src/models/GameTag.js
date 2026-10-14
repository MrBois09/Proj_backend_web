import mongoose from 'mongoose';

const gameTagSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
  sortOrder: { type: Number, required: true, min: 0 }
}, { timestamps: true });

export const GameTag = mongoose.model('GameTag', gameTagSchema);
