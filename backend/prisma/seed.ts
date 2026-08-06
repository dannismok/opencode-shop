import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPrisma } from '../src/lib/prisma';
import { loadEnv } from '../src/config/env';
import { ROLE, ORDER_STATUS, INVOICE_STATUS } from '../src/domain/constants';
import { generatePickupCode } from '../src/lib/ids';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);

const FOODS = [
  {
    name: 'Classic Cheeseburger',
    slug: 'classic-cheeseburger',
    description: 'Beef patty, melted cheddar, pickles, onions and house sauce on a toasted bun.',
    category: 'Burgers',
    priceCents: 890,
    stockQty: 25,
    baseStock: 25,
    imageUrl: '/uploads/foods/classic-cheeseburger.svg',
    colors: ['#f6a33c', '#8b4513'],
    emoji: '🍔',
  },
  {
    name: 'Crispy Fried Chicken (2 pcs)',
    slug: 'crispy-fried-chicken',
    description: 'Two pieces of golden, crispy fried chicken with a juicy, seasoned interior.',
    category: 'Chicken',
    priceCents: 1250,
    stockQty: 20,
    baseStock: 20,
    imageUrl: '/uploads/foods/crispy-fried-chicken.svg',
    colors: ['#e8a33d', '#7a3b0e'],
    emoji: '🍗',
  },
  {
    name: 'Pepperoni Pizza Slice',
    slug: 'pepperoni-pizza-slice',
    description: 'A hearty slice loaded with pepperoni and bubbling mozzarella on a crisp crust.',
    category: 'Pizza',
    priceCents: 675,
    stockQty: 30,
    baseStock: 30,
    imageUrl: '/uploads/foods/pepperoni-pizza-slice.svg',
    colors: ['#d9534f', '#a02818'],
    emoji: '🍕',
  },
  {
    name: 'Loaded Hot Dog',
    slug: 'loaded-hot-dog',
    description: 'Grilled sausage in a soft bun topped with onions, relish and mustard drizzle.',
    category: 'Hot Dogs',
    priceCents: 550,
    stockQty: 15,
    baseStock: 15,
    imageUrl: '/uploads/foods/loaded-hot-dog.svg',
    colors: ['#c0392b', '#7b241c'],
    emoji: '🌭',
  },
  {
    name: 'Golden French Fries (L)',
    slug: 'golden-french-fries',
    description: 'Large serving of crispy golden fries sprinkled with sea salt.',
    category: 'Sides',
    priceCents: 425,
    stockQty: 40,
    baseStock: 40,
    imageUrl: '/uploads/foods/golden-french-fries.svg',
    colors: ['#f4d03f', '#b7950b'],
    emoji: '🍟',
  },
];

const USERS = [
  {
    name: 'System Admin',
    email: 'admin@example.com',
    phone: '+60100000000',
    accountNumber: '000000000000',
    role: ROLE.ADMIN,
  },
  {
    name: 'Ali Bin Ahmad',
    email: 'ali@example.com',
    phone: '+60123456789',
    accountNumber: '555511112222',
    role: ROLE.CUSTOMER,
  },
  {
    name: 'Siti Nurhaliza',
    email: 'siti@example.com',
    phone: '+60129876543',
    accountNumber: '999988887777',
    role: ROLE.CUSTOMER,
  },
  {
    name: 'Raj Kumar',
    email: 'raj@example.com',
    phone: '+60137654321',
    accountNumber: '444433330000',
    role: ROLE.CUSTOMER,
  },
];

function svgForFood(food: (typeof FOODS)[number]): string {
  const [c1, c2] = food.colors;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" role="img" aria-label="${food.name}">`,
    `  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>`,
    `  <rect width="800" height="500" fill="url(#bg)"/>`,
    `  <circle cx="120" cy="90" r="180" fill="rgba(255,255,255,0.08)"/>`,
    `  <circle cx="700" cy="430" r="220" fill="rgba(255,255,255,0.08)"/>`,
    `  <foreignObject x="80" y="20" width="640" height="340">`,
    `    <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:220px;line-height:1.2">${food.emoji}</div>`,
    `  </foreignObject>`,
    `  <rect x="140" y="380" width="520" height="64" rx="32" fill="rgba(255,255,255,0.22)"/>`,
    `  <text x="400" y="422" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${food.name}</text>`,
    `</svg>`,
  ];
  return lines.join('\n');
}

async function seedFoods() {
  const uploadsDir = resolve(process.cwd(), env.UPLOAD_DIR, 'foods');
  mkdirSync(uploadsDir, { recursive: true });

  const foodRecords: Record<string, string> = {};
  for (const food of FOODS) {
    const filePath = join(uploadsDir, `${food.slug}.svg`);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, svgForFood(food), 'utf-8');
      console.log(`Generated image ${filePath}`);
    }
    const record = await prisma.food.upsert({
      where: { slug: food.slug },
      update: {
        name: food.name,
        description: food.description,
        category: food.category,
        priceCents: food.priceCents,
        imageUrl: food.imageUrl,
        isActive: true,
      },
      create: {
        name: food.name,
        slug: food.slug,
        description: food.description,
        category: food.category,
        priceCents: food.priceCents,
        imageUrl: food.imageUrl,
        stockQty: food.baseStock,
        isActive: true,
      },
    });
    foodRecords[food.slug] = record.id;
  }
  return foodRecords;
}

async function seedUsers(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const record = await prisma.user.upsert({
      where: { phone: u.phone },
      update: { name: u.name, email: u.email, accountNumber: u.accountNumber, role: u.role },
      create: { ...u },
    });
    ids[u.phone] = record.id;
  }
  return ids;
}

interface DemoOrderSpec {
  userPhone: string;
  items: { slug: string; quantity: number }[];
  status: string;
  createdAt: Date;
  fulfilledAt?: Date | null;
  cancelledAt?: Date | null;
  notes?: string;
  invoicePeriod?: { year: number; month: number };
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(9, 30, 0, 0);
  d.setMonth(d.getMonth() - n);
  return d;
}

async function seedOrders(userIds: Record<string, string>) {
  const today = new Date();
  const prev = monthsAgo(1);
  const prevYear = prev.getFullYear();
  const prevMonth = prev.getMonth() + 1;

  const specs: DemoOrderSpec[] = [
    {
      userPhone: '+60123456789',
      items: [
        { slug: 'classic-cheeseburger', quantity: 2 },
        { slug: 'golden-french-fries', quantity: 1 },
      ],
      status: ORDER_STATUS.FULFILLED,
      createdAt: monthsAgo(1),
      fulfilledAt: monthsAgo(1),
      notes: 'Extra pickles please',
      invoicePeriod: { year: prevYear, month: prevMonth },
    },
    {
      userPhone: '+60123456789',
      items: [
        { slug: 'crispy-fried-chicken', quantity: 1 },
        { slug: 'pepperoni-pizza-slice', quantity: 1 },
      ],
      status: ORDER_STATUS.FULFILLED,
      createdAt: monthsAgo(1),
      fulfilledAt: monthsAgo(1),
      invoicePeriod: { year: prevYear, month: prevMonth },
    },
    {
      userPhone: '+60129876543',
      items: [{ slug: 'loaded-hot-dog', quantity: 3 }],
      status: ORDER_STATUS.FULFILLED,
      createdAt: monthsAgo(1),
      fulfilledAt: monthsAgo(1),
      invoicePeriod: { year: prevYear, month: prevMonth },
    },
    {
      userPhone: '+60137654321',
      items: [
        { slug: 'pepperoni-pizza-slice', quantity: 2 },
        { slug: 'golden-french-fries', quantity: 2 },
      ],
      status: ORDER_STATUS.FULFILLED,
      createdAt: monthsAgo(1),
      fulfilledAt: monthsAgo(1),
      invoicePeriod: { year: prevYear, month: prevMonth },
    },
    {
      userPhone: '+60123456789',
      items: [{ slug: 'classic-cheeseburger', quantity: 1 }],
      status: ORDER_STATUS.FULFILLED,
      createdAt: today,
      fulfilledAt: today,
    },
    {
      userPhone: '+60129876543',
      items: [
        { slug: 'golden-french-fries', quantity: 1 },
        { slug: 'loaded-hot-dog', quantity: 1 },
      ],
      status: ORDER_STATUS.PENDING,
      createdAt: today,
    },
  ];

  let created = 0;
  for (let idx = 0; idx < specs.length; idx++) {
    const spec = specs[idx];
    const orderNumber = `SEED-${spec.userPhone.replace(/\D/g, '')}-${idx}`;
    const existing = await prisma.order.findUnique({ where: { orderNumber } });
    if (existing) continue;

    const foodRows = await prisma.food.findMany({
      where: { slug: { in: spec.items.map((i) => i.slug) } },
    });
    const bySlug = new Map(foodRows.map((f) => [f.slug, f]));

    let subtotal = 0;
    const lineItems = spec.items.map((item) => {
      const food = bySlug.get(item.slug);
      if (!food) throw new Error(`Unknown food slug ${item.slug}`);
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

    const invoice = spec.invoicePeriod
      ? await prisma.invoice.upsert({
          where: {
            userId_periodYear_periodMonth: {
              userId: userIds[spec.userPhone],
              periodYear: spec.invoicePeriod.year,
              periodMonth: spec.invoicePeriod.month,
            },
          },
          update: {},
          create: {
            userId: userIds[spec.userPhone],
            periodYear: spec.invoicePeriod.year,
            periodMonth: spec.invoicePeriod.month,
            totalCents: 0,
            status: INVOICE_STATUS.DRAFT,
            accountNumberSnapshot: 'unset',
          },
        })
      : null;

    const createdOrder = await prisma.order.create({
      data: {
        orderNumber,
        pickupCode: generatePickupCode(),
        userId: userIds[spec.userPhone],
        status: spec.status,
        subtotalCents: subtotal,
        totalCents: subtotal,
        notes: spec.notes,
        createdAt: spec.createdAt,
        fulfilledAt: spec.fulfilledAt,
        cancelledAt: spec.cancelledAt,
        invoiceId: invoice?.id ?? null,
        items: { create: lineItems },
      },
    });

    for (const item of spec.items) {
      const food = bySlug.get(item.slug)!;
      await prisma.food.update({
        where: { id: food.id },
        data: { stockQty: { decrement: item.quantity } },
      });
      await prisma.stockMovement.create({
        data: {
          foodId: food.id,
          delta: -item.quantity,
          reason: 'SEED_ORDER',
          orderId: createdOrder.id,
        },
      });
    }
    created++;
  }
  return created;
}

async function seedInvoices(userIds: Record<string, string>) {
  const prev = monthsAgo(1);
  const year = prev.getFullYear();
  const month = prev.getMonth() + 1;

  for (const [phone, userId] of Object.entries(userIds)) {
    if (phone === '+60100000000') continue;
    const fulfilled = await prisma.order.findMany({
      where: {
        userId,
        status: ORDER_STATUS.FULFILLED,
        createdAt: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      },
    });
    const total = fulfilled.reduce((sum, o) => sum + o.totalCents, 0);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) continue;

    const fails = user.accountNumber.endsWith('0000');
    await prisma.invoice.upsert({
      where: { userId_periodYear_periodMonth: { userId, periodYear: year, periodMonth: month } },
      update: {
        totalCents: total,
        status: fails ? INVOICE_STATUS.FAILED : INVOICE_STATUS.CHARGED,
        accountNumberSnapshot: user.accountNumber,
        chargedAt: fails ? null : prev,
        bankRef: fails ? null : `BANK-${randomBankRef()}`,
        failureReason: fails ? 'Insufficient funds (mock bank: account ends in 0000)' : null,
      },
      create: {
        userId,
        periodYear: year,
        periodMonth: month,
        totalCents: total,
        status: fails ? INVOICE_STATUS.FAILED : INVOICE_STATUS.CHARGED,
        accountNumberSnapshot: user.accountNumber,
        chargedAt: fails ? null : prev,
        bankRef: fails ? null : `BANK-${randomBankRef()}`,
        failureReason: fails ? 'Insufficient funds (mock bank: account ends in 0000)' : null,
      },
    });
  }
}

function randomBankRef(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function main() {
  await seedFoods();
  const userIds = await seedUsers();
  const created = await seedOrders(userIds);
  await seedInvoices(userIds);

  const counts = {
    users: await prisma.user.count(),
    foods: await prisma.food.count(),
    orders: await prisma.order.count(),
    invoices: await prisma.invoice.count(),
    stockMovements: await prisma.stockMovement.count(),
  };
  console.log(`Seed complete. Created ${created} demo orders.`);
  console.log('Counts:', JSON.stringify(counts));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
