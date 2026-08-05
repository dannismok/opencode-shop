import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../container';
import { assertSchema, notFound } from '../lib/errors';
import { createAuthMiddleware } from '../middleware/auth';
import { TokenService } from '../services/tokenService';
import { BillingService } from '../services/billingService';
import { MockBankChargeProvider } from '../services/billing/BankChargeProvider';
import { INVOICE_STATUS, LOW_STOCK_THRESHOLD } from '../domain/constants';

const billingRunSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const adminListSchema = z.object({
  status: z.enum([INVOICE_STATUS.DRAFT, INVOICE_STATUS.CHARGED, INVOICE_STATUS.FAILED]).optional(),
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export function invoicesRouter(deps: Deps) {
  const router = Router();
  const tokenService = new TokenService(deps.prisma, deps.env);
  const { requireAuth, requireAdmin } = createAuthMiddleware({ prisma: deps.prisma, tokenService });
  const billingService = new BillingService(
    deps.prisma,
    new MockBankChargeProvider(),
    deps.logger,
  );

  router.get('/invoices', requireAuth, async (req, res, next) => {
    try {
      const invoices = await deps.prisma.invoice.findMany({
        where: { userId: req.user!.id },
        include: { _count: { select: { orders: true } } },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      });
      res.json({
        invoices: invoices.map((inv) => ({
          id: inv.id,
          periodYear: inv.periodYear,
          periodMonth: inv.periodMonth,
          totalCents: inv.totalCents,
          status: inv.status,
          accountNumberSnapshot: inv.accountNumberSnapshot,
          chargedAt: inv.chargedAt,
          bankRef: inv.bankRef,
          failureReason: inv.failureReason,
          createdAt: inv.createdAt,
          orderCount: inv._count.orders,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  const admin = Router();

  admin.post('/billing/run', async (req, res, next) => {
    try {
      const { year, month } = assertSchema(billingRunSchema, req.body);
      const result = await billingService.closeMonth(year, month);
      res.json({ result });
    } catch (err) {
      next(err);
    }
  });

  admin.get('/invoices', async (req, res, next) => {
    try {
      const { status, year, month } = assertSchema(adminListSchema, req.query);
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (year) where.periodYear = year;
      if (month) where.periodMonth = month;

      const invoices = await deps.prisma.invoice.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true, accountNumber: true } },
          _count: { select: { orders: true } },
        },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      });
      res.json({
        invoices: invoices.map((inv) => ({
          id: inv.id,
          periodYear: inv.periodYear,
          periodMonth: inv.periodMonth,
          totalCents: inv.totalCents,
          status: inv.status,
          accountNumberSnapshot: inv.accountNumberSnapshot,
          chargedAt: inv.chargedAt,
          bankRef: inv.bankRef,
          failureReason: inv.failureReason,
          createdAt: inv.createdAt,
          orderCount: inv._count.orders,
          user: inv.user,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  admin.post('/invoices/:id/charge', async (req, res, next) => {
    try {
      const invoice = await deps.prisma.invoice.findUnique({ where: { id: req.params.id } });
      if (!invoice) throw notFound('Invoice not found');
      const status = await billingService.attemptCharge(invoice.id);
      res.json({ invoice: { id: invoice.id, status } });
    } catch (err) {
      next(err);
    }
  });

  admin.get('/stats', async (_req, res, next) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [ordersToday, pendingOrders, revenueMtd, lowStock, totalFoods] = await Promise.all([
        deps.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
        deps.prisma.order.count({ where: { status: 'PENDING' } }),
        deps.prisma.order.aggregate({
          where: { status: 'FULFILLED', fulfilledAt: { gte: monthStart } },
          _sum: { totalCents: true },
        }),
        deps.prisma.food.findMany({
          where: { isActive: true, stockQty: { lte: LOW_STOCK_THRESHOLD } },
          select: { id: true, name: true, slug: true, stockQty: true, imageUrl: true },
          orderBy: { stockQty: 'asc' },
        }),
        deps.prisma.food.count({ where: { isActive: true } }),
      ]);

      res.json({
        stats: {
          ordersToday,
          pendingOrders,
          revenueMtdCents: revenueMtd._sum.totalCents ?? 0,
          lowStock,
          lowStockCount: lowStock.length,
          activeFoods: totalFoods,
          lowStockThreshold: LOW_STOCK_THRESHOLD,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.use('/admin', requireAuth, requireAdmin, admin);
  return router;
}
