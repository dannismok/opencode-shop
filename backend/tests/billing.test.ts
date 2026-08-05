import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  createFood,
  registerAndVerify,
  adminAuth,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx?.close();
});

async function fulfilOrderFor(customer: { accessToken: string }, orderId: string, adminToken: string) {
  const res = await ctx!.request
    .patch(`/api/v1/admin/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'FULFILLED' });
  expect(res.status).toBe(200);
}

describe('Billing', () => {
  it('billing run creates one invoice per user with the correct total, and is idempotent', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'Billable',
      slug: 'billable-item',
      priceCents: 1000,
      stockQty: 20,
    });
    const ali = await registerAndVerify(ctx, {
      phone: '+60190000001',
      accountNumber: '555511112222',
    });
    const { token } = await adminAuth(ctx);

    const orderA = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ali.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 2 }] });
    await fulfilOrderFor(ali, orderA.body.order.id, token);

    // Put the fulfilled order in the requested period
    const year = 2026;
    const month = 7;
    await ctx.prisma.order.update({
      where: { id: orderA.body.order.id },
      data: { fulfilledAt: new Date(year, month - 1, 5) },
    });

    const run = await ctx.request
      .post('/api/v1/admin/billing/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ year, month });
    expect(run.status).toBe(200);
    expect(run.body.result.created).toBeGreaterThanOrEqual(1);

    const invoices = await ctx.prisma.invoice.findMany({
      where: { periodYear: year, periodMonth: month },
    });
    const aliInvoice = invoices.find((i) => i.userId === ali.user.id);
    expect(aliInvoice).toBeTruthy();
    expect(aliInvoice?.totalCents).toBe(2000);
    expect(aliInvoice?.status).toBe('CHARGED');
    expect(aliInvoice?.bankRef).toMatch(/^BANK-/);
    expect(aliInvoice?.accountNumberSnapshot).toBe('555511112222');

    // Second run must not create duplicate invoices (unique constraint / upsert)
    const before = await ctx.prisma.invoice.count({
      where: { periodYear: year, periodMonth: month },
    });
    await ctx.request
      .post('/api/v1/admin/billing/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ year, month });
    const after = await ctx.prisma.invoice.count({
      where: { periodYear: year, periodMonth: month },
    });
    expect(after).toBe(before);
  });

  it('marks the invoice FAILED for the mock-failing account (ends in 0000)', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'FailBill',
      slug: 'fail-bill-item',
      priceCents: 500,
      stockQty: 10,
    });
    const raj = await registerAndVerify(ctx, {
      phone: '+60190000002',
      accountNumber: '444433330000',
    });
    const { token } = await adminAuth(ctx);

    const order = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${raj.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 1 }] });
    await fulfilOrderFor(raj, order.body.order.id, token);

    const year = 2026;
    const month = 6;
    await ctx.prisma.order.update({
      where: { id: order.body.order.id },
      data: { fulfilledAt: new Date(year, month - 1, 10) },
    });

    await ctx.request
      .post('/api/v1/admin/billing/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ year, month });

    const invoice = await ctx.prisma.invoice.findUnique({
      where: {
        userId_periodYear_periodMonth: {
          userId: raj.user.id,
          periodYear: year,
          periodMonth: month,
        },
      },
    });
    expect(invoice?.status).toBe('FAILED');
    expect(invoice?.failureReason).toMatch(/Insufficient funds/i);

    // Retry after the customer fixes their bank details (snapshot updated) succeeds
    await ctx.prisma.invoice.update({
      where: { id: invoice!.id },
      data: { accountNumberSnapshot: '444433335555' },
    });
    const retry = await ctx.request
      .post(`/api/v1/admin/invoices/${invoice!.id}/charge`)
      .set('Authorization', `Bearer ${token}`);
    expect(retry.status).toBe(200);
    expect(retry.body.invoice.status).toBe('CHARGED');
  });

  it('only counts fulfilled orders for billing and customers see only their invoices', async () => {
    const food = await createFood(ctx.prisma, {
      name: 'Selective',
      slug: 'selective-bill',
      priceCents: 700,
      stockQty: 10,
    });
    const siti = await registerAndVerify(ctx, {
      phone: '+60190000003',
      accountNumber: '999988887777',
    });
    const { token } = await adminAuth(ctx);

    const pendingOrder = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${siti.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 1 }] });
    const fulfilledOrder = await ctx.request
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${siti.accessToken}`)
      .send({ items: [{ foodId: food.id, quantity: 2 }] });
    await fulfilOrderFor(siti, fulfilledOrder.body.order.id, token);

    const year = 2026;
    const month = 5;
    await ctx.prisma.order.update({
      where: { id: fulfilledOrder.body.order.id },
      data: { fulfilledAt: new Date(year, month - 1, 12) },
    });

    await ctx.request
      .post('/api/v1/admin/billing/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ year, month });

    const invoice = await ctx.prisma.invoice.findUnique({
      where: {
        userId_periodYear_periodMonth: {
          userId: siti.user.id,
          periodYear: year,
          periodMonth: month,
        },
      },
    });
    expect(invoice?.totalCents).toBe(1400);
    expect(invoice?.status).toBe('CHARGED');

    const myInvoices = await ctx.request
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${siti.accessToken}`);
    expect(myInvoices.status).toBe(200);
    expect(myInvoices.body.invoices.length).toBeGreaterThanOrEqual(1);
    expect(
      myInvoices.body.invoices.every((i: { id: string }) => i.id !== pendingOrder.body.order.id),
    ).toBe(true);

    const adminInvoices = await ctx.request
      .get(`/api/v1/admin/invoices?year=${year}&month=${month}`)
      .set('Authorization', `Bearer ${token}`);
    expect(adminInvoices.status).toBe(200);
    expect(adminInvoices.body.invoices.length).toBeGreaterThanOrEqual(1);
  });
});
