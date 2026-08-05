import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../lib/logger';
import { AppError } from '../lib/errors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Image is too large. Maximum size is 2MB.'
        : 'File upload failed';
    res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
    return;
  }

  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: number }).status === 400
  ) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' },
    });
    return;
  }

  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Origin not allowed by CORS' } });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}
