import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';
import type { BankChargeProvider } from './billing/BankChargeProvider';
import { INVOICE_STATUS } from '../domain/constants';
import { conflict, notFound } from '../lib/errors';

export class BillingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bankProvider: BankChargeProvider,
    private readonly logger: Logger,
  ) {}

  private periodRange(year: number, month: number): { gte: Date; lt: Date } {
    return {
      gte: new Date(year, month - 1, 1),
      lt: new Date(year, month, 1),
    };
  }

  async closeMonth(year: number, month: number): Promise<{ created: number; charged: number; failed: number; skipped: number }> {
    const range = this.periodRange(year, month);
    const users = await this.prisma.user.findMany({ where: { isActive: true } });

    let created = 0;
    let charged = 0;
    let failed = 0;
    let skipped = 0;

    for (const user of users) {
      const orders = await this.prisma.order.findMany({
        where: {
          userId: user.id,
          status: 'FULFILLED',
          fulfilledAt: { gte: range.gte, lt: range.lt },
        },
      });
      const totalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
      if (totalCents === 0) continue;

      const existing = await this.prisma.invoice.findUnique({
        where: { userId_periodYear_periodMonth: { userId: user.id, periodYear: year, periodMonth: month } },
      });

      if (existing) {
        await this.prisma.invoice.update({
          where: { id: existing.id },
          data: { totalCents, accountNumberSnapshot: user.accountNumber },
        });
        if (existing.status === INVOICE_STATUS.CHARGED) {
          skipped++;
          continue;
        }
        const status = await this.attemptCharge(existing.id);
        if (status === INVOICE_STATUS.FAILED) failed++;
        else charged++;
        continue;
      }

      created++;
      const invoice = await this.prisma.invoice.create({
        data: {
          userId: user.id,
          periodYear: year,
          periodMonth: month,
          totalCents,
          status: INVOICE_STATUS.DRAFT,
          accountNumberSnapshot: user.accountNumber,
        },
      });
      const status = await this.attemptCharge(invoice.id);
      if (status === INVOICE_STATUS.FAILED) failed++;
      else charged++;
    }

    return { created, charged, failed, skipped };
  }

  async attemptCharge(invoiceId: string, accountNumber?: string, amountCents?: number): Promise<string> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw notFound('Invoice not found');
    if (invoice.status === INVOICE_STATUS.CHARGED) {
      throw conflict('Invoice is already charged', 'ALREADY_CHARGED');
    }

    const account = accountNumber ?? invoice.accountNumberSnapshot;
    const amount = amountCents ?? invoice.totalCents;
    const reference = `INV-${invoice.periodYear}-${invoice.periodMonth}-${invoice.id.slice(0, 6)}`;

    const result = await this.bankProvider.charge({ accountNumber: account, amountCents: amount, reference });

    if (result.success) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: INVOICE_STATUS.CHARGED,
          chargedAt: new Date(),
          bankRef: result.bankRef ?? null,
          failureReason: null,
        },
      });
      this.logger.info({ invoiceId, amount, bankRef: result.bankRef }, 'Invoice charged');
      return INVOICE_STATUS.CHARGED;
    }

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: INVOICE_STATUS.FAILED,
        chargedAt: null,
        bankRef: null,
        failureReason: result.failureReason ?? 'Bank charge failed',
      },
    });
    this.logger.warn({ invoiceId, reason: result.failureReason }, 'Invoice charge failed');
    return INVOICE_STATUS.FAILED;
  }
}
