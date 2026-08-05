import express from 'express';
import { resolve } from 'node:path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Deps } from './container';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';
import { tooManyRequests } from './lib/errors';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';

export const API_PREFIX = '/api/v1';

export function createApp(deps: Deps) {
  const app = express();
  const { env } = deps;

  app.disable('x-powered-by');
  app.use(helmet());

  const corsOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/uploads',
    express.static(resolve(process.cwd(), env.UPLOAD_DIR), {
      maxAge: env.NODE_ENV === 'production' ? '1d' : 0,
    }),
  );

  if (env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(tooManyRequests()),
    }),
  );

  const router = express.Router();
  router.use('/health', healthRouter());
  router.use('/auth', authRouter(deps));
  app.use(API_PREFIX, router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
