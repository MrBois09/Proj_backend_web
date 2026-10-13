import { v2 as cloudinary } from 'cloudinary';

export function getCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured');
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
  return cloudinary;
}

export function uploadImage(buffer, folder) {
  const client = getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      { folder: `gamer-review/${folder}`, resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
      (error, result) => error ? reject(error) : resolve(result)
    );
    stream.end(buffer);
  });
}

export async function deleteImage(publicId) {
  if (!publicId) return;
  await getCloudinary().uploader.destroy(publicId, { resource_type: 'image' });
}
