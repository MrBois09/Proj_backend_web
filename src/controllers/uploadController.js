import { deleteImage, uploadImage } from '../config/cloudinary.js';
import { UploadedAsset } from '../models/UploadedAsset.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { isImageBuffer } from '../utils/security.js';
import { success } from '../utils/response.js';

export const uploadImages = (folder, multiple = false, respond = true) => asyncHandler(async (req, res, next) => {
  const files = multiple ? req.files : [req.file];
  if (!files?.length || files.some((file) => !file)) throw new AppError('At least one image file is required', 400);
  if (files.some((file) => !isImageBuffer(file.buffer))) {
    throw new AppError('Only valid JPG, PNG, or WebP image files are accepted', 422);
  }
  const results = await Promise.allSettled(files.map((file) => uploadImage(file.buffer, `${folder}/${req.user.id}`)));
  const uploaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  if (uploaded.length !== files.length) {
    await Promise.all(uploaded.map((image) => deleteImage(image.public_id).catch(() => {})));
    throw new AppError('One or more images could not be uploaded', 503);
  }
  const images = uploaded.map((image) => ({ url: image.secure_url, publicId: image.public_id }));
  try {
    await UploadedAsset.insertMany(uploaded.map((image) => ({
      ownerId: req.user.id,
      publicId: image.public_id,
      secureUrl: image.secure_url,
      folder: image.folder
    })));
  } catch {
    await Promise.all(uploaded.map((image) => deleteImage(image.public_id).catch(() => {})));
    throw new AppError('Image upload could not be registered. Please retry.', 503);
  }
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
