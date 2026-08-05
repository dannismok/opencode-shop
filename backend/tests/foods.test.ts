import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createFood, adminAuth, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx?.close();
});

describe('Public foods', () => {
  it('lists only active foods with stock info', async () => {
    await createFood(ctx.prisma, { name: 'Burger', slug: 'burger', stockQty: 5 });
    await createFood(ctx.prisma, {
      name: 'Hidden Item',
      slug: 'hidden-item',
      stockQty: 3,
      isActive: false,
    });

    const res = await ctx.request.get('/api/v1/foods');
    expect(res.status).toBe(200);
    const slugs = res.body.foods.map((f: { slug: string }) => f.slug);
    expect(slugs).toContain('burger');
    expect(slugs).not.toContain('hidden-item');

    const burger = res.body.foods.find((f: { slug: string }) => f.slug === 'burger');
    expect(burger.inStock).toBe(true);
    expect(burger.stockQty).toBe(5);
    expect(typeof burger.priceCents).toBe('number');
  });

  it('returns a food by slug and 404 for an inactive food', async () => {
    const res = await ctx.request.get('/api/v1/foods/burger');
    expect(res.status).toBe(200);
    expect(res.body.food.name).toBe('Burger');

    const hidden = await ctx.request.get('/api/v1/foods/hidden-item');
    expect(hidden.status).toBe(404);
  });
});

describe('Admin foods CRUD', () => {
  let adminToken = '';

  beforeAll(async () => {
    const { token } = await adminAuth(ctx);
    adminToken = token;
  });

  it('requires admin role', async () => {
    const res = await ctx.request.get('/api/v1/admin/foods');
    expect(res.status).toBe(401);
  });

  it('creates a food with a generated slug and initial stock movement', async () => {
    const res = await ctx.request
      .post('/api/v1/admin/foods')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Spicy Burger!',
        description: 'Very spicy',
        category: 'Burgers',
        priceCents: 1150,
        stockQty: 12,
      });
    expect(res.status).toBe(201);
    expect(res.body.food.slug).toBe('spicy-burger');
    expect(res.body.food.stockQty).toBe(12);

    const movements = await ctx.prisma.stockMovement.count({
      where: { foodId: res.body.food.id, reason: 'INITIAL_STOCK' },
    });
    expect(movements).toBe(1);
  });

  it('updates a food and changes the slug when the name changes', async () => {
    const created = await ctx.request
      .post('/api/v1/admin/foods')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Old Name', description: 'd', category: 'c', priceCents: 500, stockQty: 1 });
    const id = created.body.food.id;

    const res = await ctx.request
      .patch(`/api/v1/admin/foods/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Name', priceCents: 999 });
    expect(res.status).toBe(200);
    expect(res.body.food.slug).toBe('new-name');
    expect(res.body.food.priceCents).toBe(999);
  });

  it('soft deletes a food', async () => {
    const food = await createFood(ctx.prisma, { name: 'ToDelete', slug: 'to-delete' });
    const res = await ctx.request
      .delete(`/api/v1/admin/foods/${food.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.food.isActive).toBe(false);

    const publicRes = await ctx.request.get('/api/v1/foods');
    const slugs = publicRes.body.foods.map((f: { slug: string }) => f.slug);
    expect(slugs).not.toContain('to-delete');
  });

  it('uploads an image and stores a static URL', async () => {
    const food = await createFood(ctx.prisma, { name: 'WithImage', slug: 'with-image' });
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const res = await ctx.request
      .post(`/api/v1/admin/foods/${food.id}/image`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', buffer, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.food.imageUrl).toMatch(/^\/uploads\/foods\/with-image-[a-f0-9]+\.png$/);
  });

  it('rejects a non-image upload', async () => {
    const food = await createFood(ctx.prisma, { name: 'NoGif', slug: 'no-gif' });
    const res = await ctx.request
      .post(`/api/v1/admin/foods/${food.id}/image`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', Buffer.from('GIF89a'), {
        filename: 'anim.gif',
        contentType: 'image/gif',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('Admin stock endpoints', () => {
  let adminToken = '';

  beforeAll(async () => {
    const { token } = await adminAuth(ctx);
    adminToken = token;
  });

  it('sets stock to an absolute value', async () => {
    const food = await createFood(ctx.prisma, { name: 'StockSet', slug: 'stock-set', stockQty: 10 });
    const res = await ctx.request
      .patch(`/api/v1/admin/foods/${food.id}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'set', qty: 42 });
    expect(res.status).toBe(200);
    expect(res.body.food.stockQty).toBe(42);
  });

  it('adjusts stock and logs the reason', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'StockAdjust',
      slug: 'stock-adjust',
      stockQty: 10,
    });
    const res = await ctx.request
      .patch(`/api/v1/admin/foods/${food.id}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'adjust', delta: -4, reason: 'damaged goods' });
    expect(res.status).toBe(200);
    expect(res.body.food.stockQty).toBe(6);

    const movement = await ctx.prisma.stockMovement.findFirst({
      where: { foodId: food.id, reason: 'damaged goods' },
    });
    expect(movement?.delta).toBe(-4);
  });

  it('never allows negative stock', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'NoNegative',
      slug: 'no-negative',
      stockQty: 2,
    });
    const res = await ctx.request
      .patch(`/api/v1/admin/foods/${food.id}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'adjust', delta: -5, reason: 'count' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STOCK');
    expect(res.body.error.details.current).toBe(2);
  });
});
