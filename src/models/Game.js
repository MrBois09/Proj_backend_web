import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, default: '' }
}, { _id: false });

const gameSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  coverImageUrl: { type: String, default: '' },
  coverPublicId: { type: String, default: '' },
  bannerImageUrl: { type: String, default: '' },
  bannerPublicId: { type: String, default: '' },
  screenshots: { type: [imageSchema], default: [] },
  description: { type: String, required: true, maxlength: 10000 },
  genres: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
  platforms: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
  releaseDate: { type: Date },
  releaseYear: { type: Number, min: 1950, max: 2100 },
  developer: { type: String, maxlength: 120 },
  publisher: { type: String, maxlength: 120 },
  officialWebsite: { type: String, maxlength: 2048 },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  averageRating: { type: Number, min: 0, max: 10, default: 0 },
  reviewCount: { type: Number, min: 0, default: 0 }
}, { timestamps: true });

gameSchema.index({ approvalStatus: 1, createdAt: -1 });
gameSchema.index({ approvalStatus: 1, averageRating: -1, reviewCount: -1 });
gameSchema.index({ title: 'text', genres: 'text', platforms: 'text', description: 'text' });

export const Game = mongoose.model('Game', gameSchema);
