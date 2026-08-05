import { buildContainer } from './container';
import { createApp } from './app';
import { initDb } from './lib/initDb';
import { logger } from './lib/logger';
import { BillingService } from './services/billingService';
import { MockBankChargeProvider } from './services/billing/BankChargeProvider';
import { startBillingCron } from './jobs/billingCron';

async function main() {
  const container = buildContainer();
  await initDb(container.prisma);
  const app = createApp(container);

  const billingService = new BillingService(
    container.prisma,
    new MockBankChargeProvider(),
    container.logger,
  );
  if (container.env.BILLING_CRON_ENABLED) {
    startBillingCron(billingService, logger);
  }

  app.listen(container.env.PORT, () => {
    logger.info(`API listening on http://localhost:${container.env.PORT}/api/v1`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start API');
  process.exit(1);
});
