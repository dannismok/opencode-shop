import { buildContainer } from './container';
import { createApp } from './app';
import { logger } from './lib/logger';

const container = buildContainer();
const app = createApp(container);

app.listen(container.env.PORT, () => {
  logger.info(`API listening on http://localhost:${container.env.PORT}/api/v1`);
});
