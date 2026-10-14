import { deleteImage } from '../config/cloudinary.js';
import { UploadedAsset } from '../models/UploadedAsset.js';
import { AppError } from './errors.js';

export async function claimUploadedAssets(ownerId, images = [], unchanged = []) {
  const unchangedById = new Map(unchanged.filter((image) => image?.publicId).map((image) => [image.publicId, image.url]));
  const pending = [];
  const seen = new Set();
  for (const image of images) {
    if (!image?.publicId || !image.url?.startsWith('https://res.cloudinary.com/')) {
      throw new AppError('Images must come from an authenticated Cloudinary upload', 422);
    }
    if (seen.has(image.publicId)) throw new AppError('An image cannot be attached more than once', 422);
    seen.add(image.publicId);
    if (unchangedById.has(image.publicId)) {
      if (unchangedById.get(image.publicId) !== image.url) throw new AppError('Image metadata does not match the saved asset', 422);
      continue;
    }
    pending.push(image);
  }
  if (!pending.length) return [];
  const assets = await UploadedAsset.find({
    ownerId,
    publicId: { $in: pending.map((image) => image.publicId) }
  }).lean();
  const byId = new Map(assets.map((asset) => [asset.publicId, asset]));
  if (pending.some((image) => byId.get(image.publicId)?.secureUrl !== image.url)) {
    throw new AppError('Image is not owned by this account or is not a valid upload', 403);
  }
  for (const image of pending) {
    const result = await UploadedAsset.updateOne(
      { ownerId, publicId: image.publicId, secureUrl: image.url },
      { $inc: { referenceCount: 1 } }
    );
    if (!result.matchedCount) throw new AppError('Uploaded image is no longer available', 409);
  }
  return pending;
}

export async function releaseUploadedAssets(images = []) {
  for (const image of images) {
    if (!image?.publicId) continue;
    const asset = await UploadedAsset.findOneAndUpdate(
      { publicId: image.publicId, secureUrl: image.url, referenceCount: { $gt: 0 } },
      { $inc: { referenceCount: -1 } },
      { new: true }
    );
    if (!asset || asset.referenceCount !== 0) continue;
    try {
      await deleteImage(asset.publicId);
      await asset.deleteOne();
    } catch {
      console.error('Cloudinary asset cleanup failed');
    }
  }
}

export async function discardUnclaimedAssets(ownerId, images = []) {
  for (const image of images) {
    if (!image?.publicId || !image?.url) continue;
    const asset = await UploadedAsset.findOne({
      ownerId,
      publicId: image.publicId,
      secureUrl: image.url,
      referenceCount: 0
    });
    if (!asset) continue;
    try {
      await deleteImage(asset.publicId);
      await asset.deleteOne();
    } catch {
      console.error('Cloudinary asset cleanup failed');
    }
  }
}
