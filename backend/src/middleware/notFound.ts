import type { Request, Response } from 'express';
import { notFound } from '../lib/errors';

export function notFoundHandler(req: Request, _res: Response) {
  throw notFound(`Route ${req.method} ${req.originalUrl} not found`);
}
