import mongoose from 'mongoose';

const uploadedAssetSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  publicId: { type: String, required: true, unique: true },
  secureUrl: { type: String, required: true },
  folder: { type: String, required: true },
  referenceCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

export const UploadedAsset = mongoose.model('UploadedAsset', uploadedAssetSchema);
