import type { Prisma, PrismaClient } from '@prisma/client';
import { ORDER_STATUS } from '../domain/constants';
import { conflict, forbidden, notFound } from '../lib/errors';
import { generateOrderNumber, generatePickupCode } from '../lib/ids';

type Tx = Prisma.TransactionClient;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  if (code === 'P2034' || code === 'P2028' || code === 'P2010') return true;
  const msg = (err as { message?: string }).message ?? '';
  return msg.includes('SQLITE_BUSY') || msg.includes('database is locked');
}

export interface PlaceOrderItem {
  foodId: string;
  quantity: number;
}

export class OrderService {
  constructor(private readonly prisma: PrismaClient) {}

  private async withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(fn);
      } catch (err) {
        if (isRetryable(err) && attempt < maxAttempts - 1) {
          await sleep(60 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw new Error('unreachable');
  }

  async placeOrder(
    userId: string,
    items: PlaceOrderItem[],
    notes?: string,
  ): Promise<{ orderId: string; orderNumber: string; pickupCode: string }> {
    if (items.length === 0) {
      throw conflict('Order must contain at least one item', 'EMPTY_ORDER');
    }
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw conflict('Item quantity must be a positive integer', 'BAD_QUANTITY');
      }
    }
    const uniqueItems = Array.from(
      new Map(items.map((i) => [i.foodId, i])).values(),
    );

    return this.withTx(async (tx) => {
      const foodIds = uniqueItems.map((i) => i.foodId);
      const foods = await tx.food.findMany({ where: { id: { in: foodIds } } });
      const byId = new Map(foods.map((f) => [f.id, f]));

      const outOfStock: { foodId: string; name: string; requested: number; available: number }[] = [];
      for (const item of uniqueItems) {
        const food = byId.get(item.foodId);
        if (!food || !food.isActive || food.stockQty < item.quantity) {
          outOfStock.push({
            foodId: item.foodId,
            name: food?.name ?? 'Unknown item',
            requested: item.quantity,
            available: food?.stockQty ?? 0,
          });
        }
      }
      if (outOfStock.length > 0) {
        throw conflict('One or more items are out of stock', 'OUT_OF_STOCK', outOfStock);
      }

      let subtotal = 0;
      const orderItems = uniqueItems.map((item) => {
        const food = byId.get(item.foodId)!;
        const lineTotal = food.priceCents * item.quantity;
        subtotal += lineTotal;
        return {
          foodId: food.id,
          nameSnapshot: food.name,
          unitPriceCents: food.priceCents,
          quantity: item.quantity,
          lineTotalCents: lineTotal,
        };
      });

      const now = new Date();
      const order = await tx.order.create({
        data: {
          orderNumber: await this.uniqueOrderNumber(tx),
          pickupCode: await this.uniquePickupCode(tx),
          userId,
          status: ORDER_STATUS.PENDING,
          subtotalCents: subtotal,
          totalCents: subtotal,
          notes: notes?.trim() || null,
          createdAt: now,
          items: { create: orderItems },
        },
      });

      for (const item of uniqueItems) {
        const food = byId.get(item.foodId)!;
        await tx.food.update({
          where: { id: food.id },
          data: { stockQty: { decrement: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            foodId: food.id,
            delta: -item.quantity,
            reason: 'ORDER_PLACED',
            orderId: order.id,
            actorUserId: userId,
          },
        });
      }

      return { orderId: order.id, orderNumber: order.orderNumber, pickupCode: order.pickupCode };
    });
  }

  private async uniqueOrderNumber(tx: Tx): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const candidate = generateOrderNumber();
      const exists = await tx.order.findUnique({ where: { orderNumber: candidate } });
      if (!exists) return candidate;
    }
    return `OS-${Date.now()}`;
  }

  private async uniquePickupCode(tx: Tx): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const candidate = generatePickupCode();
      const exists = await tx.order.findUnique({ where: { pickupCode: candidate } });
      if (!exists) return candidate;
    }
    return generatePickupCode();
  }

  async cancelOrder(userId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw notFound('Order not found');
    if (order.userId !== userId) throw forbidden('You can only cancel your own orders');
    if (order.status !== ORDER_STATUS.PENDING) {
      throw conflict('Only pending orders can be cancelled', 'INVALID_STATUS');
    }

    await this.withTx(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!fresh || fresh.status !== ORDER_STATUS.PENDING) {
        throw conflict('Order has already been processed', 'INVALID_STATUS');
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: ORDER_STATUS.CANCELLED, cancelledAt: new Date() },
      });
      for (const item of fresh.items) {
        await tx.food.update({
          where: { id: item.foodId },
          data: { stockQty: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            foodId: item.foodId,
            delta: item.quantity,
            reason: 'ORDER_CANCELLED',
            orderId: orderId,
            actorUserId: userId,
          },
        });
      }
    });
  }

  async setStatus(_adminUserId: string, orderId: string, status: 'FULFILLED' | 'PENDING') {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Order not found');

    if (status === ORDER_STATUS.FULFILLED) {
      if (order.status !== ORDER_STATUS.PENDING) {
        throw conflict('Only pending orders can be fulfilled', 'INVALID_STATUS');
      }
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: ORDER_STATUS.FULFILLED, fulfilledAt: new Date() },
      });
      return;
    }

    // Undo: FULFILLED -> PENDING
    if (order.status !== ORDER_STATUS.FULFILLED) {
      throw conflict('Only fulfilled orders can be reverted to pending', 'INVALID_STATUS');
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: ORDER_STATUS.PENDING, fulfilledAt: null },
    });
  }
}
