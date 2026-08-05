import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../container';
import { assertSchema, forbidden, notFound } from '../lib/errors';
import { createAuthMiddleware } from '../middleware/auth';
import { TokenService } from '../services/tokenService';
import { OrderService } from '../services/orderService';
import { ORDER_STATUS } from '../domain/constants';
import type { Order } from '@prisma/client';

const placeOrderSchema = z.object({
  items: z
    .array(
      z.object({
        foodId: z.string().min(1),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
  notes: z.string().max(500).optional(),
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const listOwnSchema = pageSchema;

const adminListSchema = pageSchema.extend({
  status: z.enum([ORDER_STATUS.PENDING, ORDER_STATUS.FULFILLED, ORDER_STATUS.CANCELLED]).optional(),
  q: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const setStatusSchema = z.object({
  status: z.enum([ORDER_STATUS.FULFILLED, ORDER_STATUS.PENDING]),
});

export function serializeOrder(order: Order & { items?: unknown[] }) {
  const { items, ...rest } = order;
  return {
    ...rest,
    id: order.id,
    orderNumber: order.orderNumber,
    pickupCode: order.pickupCode,
    status: order.status,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    notes: order.notes,
    createdAt: order.createdAt,
    fulfilledAt: order.fulfilledAt,
    cancelledAt: order.cancelledAt,
    items: items ?? [],
  };
}

export function ordersRouter(deps: Deps) {
  const router = Router();
  const tokenService = new TokenService(deps.prisma, deps.env);
  const { requireAuth, requireAdmin } = createAuthMiddleware({ prisma: deps.prisma, tokenService });
  const orderService = new OrderService(deps.prisma);

  router.post('/orders', requireAuth, async (req, res, next) => {
    try {
      const { items, notes } = assertSchema(placeOrderSchema, req.body);
      const result = await orderService.placeOrder(req.user!.id, items, notes);
      const order = await deps.prisma.order.findUnique({
        where: { id: result.orderId },
        include: { items: true },
      });
      res.status(201).json({ order: serializeOrder(order!) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders', requireAuth, async (req, res, next) => {
    try {
      const { page, pageSize } = assertSchema(listOwnSchema, req.query);
      const [orders, total] = await Promise.all([
        deps.prisma.order.findMany({
          where: { userId: req.user!.id },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        deps.prisma.order.count({ where: { userId: req.user!.id } }),
      ]);
      res.json({
        orders: orders.map(serializeOrder),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/:id', requireAuth, async (req, res, next) => {
    try {
      const order = await deps.prisma.order.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      if (!order) throw notFound('Order not found');
      if (order.userId !== req.user!.id) throw forbidden('You can only view your own orders');
      res.json({ order: serializeOrder(order) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/orders/:id/cancel', requireAuth, async (req, res, next) => {
    try {
      await orderService.cancelOrder(req.user!.id, req.params.id);
      const order = await deps.prisma.order.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      res.json({ order: serializeOrder(order!) });
    } catch (err) {
      next(err);
    }
  });

  const admin = Router();

  admin.get('/', async (req, res, next) => {
    try {
      const { page, pageSize, status, q, from, to } = assertSchema(adminListSchema, req.query);

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (q) {
        const users = await deps.prisma.user.findMany({
          where: { phone: { contains: q } },
          select: { id: true },
        });
        const userIds = users.map((u) => u.id);
        where.userId = { in: userIds.length ? userIds : ['__none__'] };
      }
      if (from || to) {
        where.createdAt = {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        };
      }

      const [orders, total] = await Promise.all([
        deps.prisma.order.findMany({
          where,
          include: { items: true, user: { select: { id: true, name: true, phone: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        deps.prisma.order.count({ where }),
      ]);

      res.json({
        orders: orders.map((o) => ({ ...serializeOrder(o), user: o.user })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  });

  admin.patch('/:id/status', async (req, res, next) => {
    try {
      const { status } = assertSchema(setStatusSchema, req.body);
      await orderService.setStatus(req.user!.id, req.params.id, status);
      const order = await deps.prisma.order.findUnique({
        where: { id: req.params.id },
        include: { items: true, user: { select: { id: true, name: true, phone: true } } },
      });
      if (!order) throw notFound('Order not found');
      res.json({ order: { ...serializeOrder(order), user: order.user } });
    } catch (err) {
      next(err);
    }
  });

  router.use('/admin/orders', requireAuth, requireAdmin, admin);
  return router;
}
