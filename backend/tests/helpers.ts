import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import supertest from 'supertest';
import { buildContainer } from '../src/container';
import { createApp } from '../src/app';
import { initDb } from '../src/lib/initDb';
import { normalizePhone } from '../src/lib/phone';

export interface TestContext {
  app: Express;
  request: ReturnType<typeof supertest>;
  prisma: PrismaClient;
  dbUrl: string;
  dbFile: string;
  jwtSecret: string;
  close: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const suffix = randomBytes(6).toString('hex');
  const dbFile = join(process.cwd(), 'prisma', `test-${suffix}.db`);
  const dbUrl = `file:./test-${suffix}.db`;

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  const container = buildContainer({
    NODE_ENV: 'test',
    DATABASE_URL: dbUrl,
    OTP_MODE: 'console',
    RATE_LIMIT_MAX: 10000,
    OTP_RATE_LIMIT_MAX: 10000,
    LOG_LEVEL: 'silent',
  });

  await container.prisma.$connect();
  await initDb(container.prisma);

  const app = createApp(container);

  return {
    app,
    request: supertest(app),
    prisma: container.prisma,
    dbUrl,
    dbFile,
    jwtSecret: container.env.JWT_SECRET,
    async close() {
      await container.prisma.$disconnect();
      for (const file of [`${dbFile}`, `${dbFile}-wal`, `${dbFile}-shm`]) {
        try {
          rmSync(file, { force: true });
        } catch {
          /* ignore */
        }
      }
    },
  };
}

export async function createUser(
  prisma: PrismaClient,
  overrides: Partial<{
    name: string;
    email: string;
    phone: string;
    accountNumber: string;
    role: string;
    isActive: boolean;
  }> = {},
) {
  const phone = normalizePhone(overrides.phone ?? `+601${Math.floor(100000000 + Math.random() * 899999999)}`);
  const email = overrides.email ?? `user-${randomBytes(4).toString('hex')}@example.com`;
  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Test User',
      email,
      phone,
      accountNumber: overrides.accountNumber ?? '111122223333',
      role: overrides.role ?? 'CUSTOMER',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createFood(
  prisma: PrismaClient,
  overrides: Partial<{
    name: string;
    slug: string;
    description: string;
    category: string;
    priceCents: number;
    imageUrl: string;
    stockQty: number;
    isActive: boolean;
  }> = {},
) {
  const slug = overrides.slug ?? `food-${randomBytes(4).toString('hex')}`;
  return prisma.food.create({
    data: {
      name: overrides.name ?? `Food ${slug}`,
      slug,
      description: overrides.description ?? 'A test food item.',
      category: overrides.category ?? 'Test',
      priceCents: overrides.priceCents ?? 1000,
      imageUrl: overrides.imageUrl ?? '/uploads/foods/test.svg',
      stockQty: overrides.stockQty ?? 10,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function registerAndVerify(
  ctx: TestContext,
  overrides: Partial<{ name: string; email: string; phone: string; accountNumber: string }> = {},
) {
  const phone = normalizePhone(overrides.phone ?? `+601${Math.floor(100000000 + Math.random() * 899999999)}`);
  const email = overrides.email ?? `auth-${randomBytes(4).toString('hex')}@example.com`;
  const accountNumber = overrides.accountNumber ?? '999988887777';

  const reg = await ctx.request.post('/api/v1/auth/register').send({
    name: overrides.name ?? 'Auth Test User',
    email,
    phone,
    accountNumber,
  });
  if (reg.status !== 201) {
    throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  }
  const devCode = reg.body.devCode as string;

  const verify = await ctx.request.post('/api/v1/auth/verify-otp').send({ phone, code: devCode });
  if (verify.status !== 200) {
    throw new Error(`verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  }

  return {
    phone,
    email,
    accountNumber,
    user: verify.body.user as { id: string; name: string; role: string },
    accessToken: verify.body.accessToken as string,
    refreshToken: verify.body.refreshToken as string,
  };
}

export async function adminAuth(ctx: TestContext) {
  const admin = await createUser(ctx.prisma, {
    name: 'Test Admin',
    email: `admin-${randomBytes(4).toString('hex')}@example.com`,
    phone: `+601${Math.floor(100000000 + Math.random() * 899999999)}`,
    accountNumber: '000000000000',
    role: 'ADMIN',
  });
  const payload = { sub: admin.id, role: admin.role, type: 'access' as const };
  const jwt = await import('jsonwebtoken');
  const token = jwt.default.sign(payload, ctx.jwtSecret, { expiresIn: '15m' });
  return { admin, token };
}
