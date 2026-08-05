import { buildContainer } from './container';
import { createApp } from './app';
import { initDb } from './lib/initDb';
import { logger } from './lib/logger';

async function main() {
  const container = buildContainer();
  await initDb(container.prisma);
  const app = createApp(container);

  app.listen(container.env.PORT, () => {
    logger.info(`API listening on http://localhost:${container.env.PORT}/api/v1`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start API');
  process.exit(1);
});
