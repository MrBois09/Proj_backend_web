import { deleteImage, uploadImage } from '../config/cloudinary.js';
import { UploadedAsset } from '../models/UploadedAsset.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { isImageBuffer } from '../utils/security.js';
import { success } from '../utils/response.js';

export async function storeImages(ownerId, folder, files) {
  if (!files?.length || files.some((file) => !file)) throw new AppError('At least one image file is required', 400);
  if (files.some((file) => !isImageBuffer(file.buffer))) {
    throw new AppError('Only valid JPG, PNG, or WebP image files are accepted', 422);
  }
  const results = await Promise.allSettled(files.map((file) => uploadImage(file.buffer, `${folder}/${ownerId}`)));
  const uploaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  if (uploaded.length !== files.length) {
    await Promise.all(uploaded.map((image) => deleteImage(image.public_id).catch(() => {})));
    throw new AppError('One or more images could not be uploaded', 503);
  }
  const images = uploaded.map((image) => ({ url: image.secure_url, publicId: image.public_id }));
  const folderPath = `gamer-review/${folder}/${ownerId}`;
  try {
    await UploadedAsset.insertMany(uploaded.map((image) => ({
      ownerId,
      publicId: image.public_id,
      secureUrl: image.secure_url,
      folder: folderPath
    })));
  } catch (error) {
    console.error('Uploaded image registration failed', {
      name: error.name,
      code: error.code,
      fields: error.name === 'ValidationError'
        ? Object.keys(error.errors || {})
        : error.code === 11000 ? Object.keys(error.keyPattern || {}) : undefined
    });
    await Promise.all(uploaded.map((image) => deleteImage(image.public_id).catch(() => {})));
    throw new AppError('Image upload could not be registered. Please retry.', 503);
  }
  return images;
}

export const uploadImages = (folder, multiple = false, respond = true) => asyncHandler(async (req, res, next) => {
  const files = multiple ? req.files : [req.file];
  const images = await storeImages(req.user.id, folder, files);
  if (multiple) {
    if (!respond) {
      req.uploadedImages = images;
      return next();
    }
    return success(res, { images }, 'Images uploaded successfully', 201);
  }
  req.uploadedImage = images[0];
  if (!respond) return next();
  return success(res, { image: images[0] }, 'Image uploaded successfully', 201);
});
