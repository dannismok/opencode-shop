import cron from 'node-cron';
import type { Logger } from 'pino';
import type { BillingService } from '../services/billingService';

export function startBillingCron(billingService: BillingService, logger: Logger): void {
  cron.schedule(
    '0 2 1 * *',
    async () => {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = prevMonth.getFullYear();
      const month = prevMonth.getMonth() + 1;
      logger.info({ year, month }, 'Running monthly billing cron');
      try {
        const result = await billingService.closeMonth(year, month);
        logger.info(result, 'Monthly billing completed');
      } catch (err) {
        logger.error({ err, year, month }, 'Monthly billing failed');
      }
    },
    {
      timezone: 'UTC',
    },
  );
  logger.info('Monthly billing cron scheduled for 02:00 on the 1st of each month (UTC)');
}
