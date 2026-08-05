import { pino } from 'pino';
import { getEnv } from '../config/env';

const env = getEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        }
      : undefined,
  base: { app: 'opencode-shop-api' },
});
