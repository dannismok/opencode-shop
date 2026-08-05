import multer from 'multer';
import type { Env } from '../config/env';
import { badRequest } from '../lib/errors';

const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function createUploadMiddleware(env: Env) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: env.MAX_IMAGE_SIZE_MB * 1024 * 1024,
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      if (!MIME_TYPES.includes(file.mimetype)) {
        cb(badRequest('Only jpg, png or webp images are allowed'));
        return;
      }
      cb(null, true);
    },
  });
}
