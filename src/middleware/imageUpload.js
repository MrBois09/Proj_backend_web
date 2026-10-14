import multer from 'multer';
import { AppError } from '../utils/errors.js';

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8, fields: 10 },
  fileFilter: (_req, file, callback) => callback(
    acceptedTypes.has(file.mimetype) ? null : new AppError('Only JPG, PNG, or WebP images are accepted', 422),
    acceptedTypes.has(file.mimetype)
  )
});

const parseUpload = (parser) => (req, res, next) => parser(req, res, (error) => next(error));

export const parseSingleUpload = (field) => parseUpload(upload.single(field));
export const parseMultipleUpload = (field) => parseUpload(upload.array(field, 8));
