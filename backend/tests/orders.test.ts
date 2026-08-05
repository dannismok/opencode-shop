import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  createFood,
  createUser,
  adminAuth,
  registerAndVerify,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx?.close();
});

describe('Orders', () => {
  it('places an order and decrements stock correctly', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'Burger',
      slug: 'order-burger',
      priceCents: 890,
      stockQty: 5,
    });
    const fries = await createFood(ctx.prisma, {
      name: 'Fries',
      slug: 'order-fries',
      priceCents: 425,
      stockQty: 10,
    });
    const customer = await registerAndVerify(ctx);

    const res = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          { foodId: food.id, quantity: 2 },
          { foodId: fries.id, quantity: 1 },
        ],
        notes: 'No onions',
      });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PENDING');
    expect(res.body.order.subtotalCents).toBe(890 * 2 + 425);
    expect(res.body.order.totalCents).toBe(890 * 2 + 425);
    expect(res.body.order.pickupCode).toMatch(/^[A-Z2-7]{6}$/);
    expect(res.body.order.items).toHaveLength(2);

    const updated = await ctx.prisma.food.findUnique({ where: { id: food.id } });
    expect(updated?.stockQty).toBe(3);

    const movement = await ctx.prisma.stockMovement.findFirst({
      where: { foodId: food.id, reason: 'ORDER_PLACED' },
    });
    expect(movement?.delta).toBe(-2);
  });

  it('rejects quantity above stock with 409 OUT_OF_STOCK and does not change stock', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'Limited',
      slug: 'limited-item',
      priceCents: 500,
      stockQty: 3,
    });
    const customer = await registerAndVerify(ctx);

    const res = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 4 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
    expect(res.body.error.details).toHaveLength(1);
    expect(res.body.error.details[0]).toMatchObject({
      foodId: food.id,
      name: 'Limited',
      requested: 4,
      available: 3,
    });

    const unchanged = await ctx.prisma.food.findUnique({ where: { id: food.id } });
    expect(unchanged?.stockQty).toBe(3);
    expect(await ctx.prisma.order.count({ where: { userId: customer.user.id } })).toBe(0);
  });

  it('rejects ordering an item with stockQty 0', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'SoldOut',
      slug: 'sold-out-item',
      stockQty: 0,
    });
    const customer = await registerAndVerify(ctx);

    const res = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('rejects ordering an inactive item', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'Hidden',
      slug: 'hidden-order-item',
      stockQty: 5,
      isActive: false,
    });
    const customer = await registerAndVerify(ctx);

    const res = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('concurrent orders for the last unit: exactly one succeeds', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'LastUnit',
      slug: 'last-unit-item',
      stockQty: 1,
    });
    const customer = await registerAndVerify(ctx);

    const [a, b] = await Promise.all([
      ctx.request
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ items: [{ foodId: food.id, quantity: 1 }] }),
      ctx.request
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ items: [{ foodId: food.id, quantity: 1 }] }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failBody = a.status === 409 ? a.body : b.body;
    expect(failBody.error.code).toBe('OUT_OF_STOCK');

    const after = await ctx.prisma.food.findUnique({ where: { id: food.id } });
    expect(after?.stockQty).toBe(0);
    expect(await ctx.prisma.order.count({ where: { userId: customer.user.id } })).toBe(1);
  });

  it('cancel restores stock and logs a movement', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'Cancellable',
      slug: 'cancellable-item',
      stockQty: 5,
    });
    const customer = await registerAndVerify(ctx);

    const placed = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 2 }] });
    const orderId = placed.body.order.id;

    const res = await ctx.request
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');
    expect(res.body.order.cancelledAt).toBeTruthy();

    const restored = await ctx.prisma.food.findUnique({ where: { id: food.id } });
    expect(restored?.stockQty).toBe(5);

    const movement = await ctx.prisma.stockMovement.findFirst({
      where: { foodId: food.id, reason: 'ORDER_CANCELLED' },
    });
    expect(movement?.delta).toBe(2);
  });

  it('cannot cancel a fulfilled order', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'AlreadyPicked',
      slug: 'already-picked',
      stockQty: 3,
    });
    const customer = await registerAndVerify(ctx);
    const { token } = await adminAuth(ctx);

    const placed = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 1 }] });
    const orderId = placed.body.order.id;

    await ctx.request
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'FULFILLED' });

    const cancel = await ctx.request
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(cancel.status).toBe(409);
  });

  it('customer cannot read another user order (404) or fulfil (403)', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'PrivateOrder',
      slug: 'private-order',
      stockQty: 3,
    });
    const customerA = await registerAndVerify(ctx);
    const customerB = await registerAndVerify(ctx);

    const placed = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerA.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 1 }] });
    const orderId = placed.body.order.id;

    const read = await ctx.request
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerB.accessToken}`);
    expect(read.status).toBe(403);

    const fulfil = await ctx.request
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${customerB.accessToken}`)
      .send({ status: 'FULFILLED' });
    expect(fulfil.status).toBe(403);
  });

  it('admin fulfils an order and sets fulfilledAt; undo reverts to pending', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'ToFulfil',
      slug: 'to-fulfil',
      stockQty: 3,
    });
    const customer = await registerAndVerify(ctx);
    const { token } = await adminAuth(ctx);

    const placed = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 1 }] });
    const orderId = placed.body.order.id;

    const fulfil = await ctx.request
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'FULFILLED' });
    expect(fulfil.status).toBe(200);
    expect(fulfil.body.order.status).toBe('FULFILLED');
    expect(fulfil.body.order.fulfilledAt).toBeTruthy();

    const undo = await ctx.request
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PENDING' });
    expect(undo.status).toBe(200);
    expect(undo.body.order.status).toBe('PENDING');
    expect(undo.body.order.fulfilledAt).toBeNull();
  });

  it('lists own orders with pagination', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'Paginated',
      slug: 'paginated-item',
      stockQty: 20,
    });
    const customer = await registerAndVerify(ctx);
    for (let i = 0; i < 3; i++) {
      await ctx.request
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ items: [{ foodId: food.id, quantity: 1 }] });
    }

    const res = await ctx.request
      .get('/api/v1/orders?page=1&pageSize=2')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
  });
});
