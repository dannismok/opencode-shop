import { Router } from 'express';
import { getEnv } from '../config/env';

export function healthRouter() {
  const router = Router();
  const startedAt = new Date();

  router.get('/', (_req, res) => {
    const env = getEnv();
    res.json({
      status: 'ok',
      service: 'opencode-shop-api',
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  return router;
}
