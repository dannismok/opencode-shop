import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';
import { loadEnv, type Env } from './config/env';
import { logger as defaultLogger } from './lib/logger';
import { createPrisma } from './lib/prisma';

export interface Deps {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
}

export function buildContainer(overrides: Record<string, unknown> = {}): Deps {
  const env = loadEnv(overrides);
  const prisma = createPrisma(env.DATABASE_URL);
  return {
    env,
    logger: defaultLogger,
    prisma,
  };
}
