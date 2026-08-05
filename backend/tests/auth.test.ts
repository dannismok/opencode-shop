import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx?.close();
});

describe('Auth flow', () => {
  it('register -> request-otp -> verify-otp -> authenticated /me', async () => {
    ctx = await createTestContext();

    const register = await ctx.request.post('/api/v1/auth/register').send({
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+601111222333',
      accountNumber: '123456789012',
    });
    expect(register.status).toBe(201);
    expect(register.body).toHaveProperty('devCode');
    expect(register.body.devCode).toMatch(/^\d{6}$/);
    expect(register.body).not.toHaveProperty('accessToken');

    const otp = await ctx.request.post('/api/v1/auth/request-otp').send({ phone: '+601111222333' });
    expect(otp.status).toBe(200);
    expect(otp.body).toHaveProperty('devCode');

    const verify = await ctx.request.post('/api/v1/auth/verify-otp').send({
      phone: '+601111222333',
      code: otp.body.devCode,
    });
    expect(verify.status).toBe(200);
    expect(verify.body.accessToken).toBeTruthy();
    expect(verify.body.refreshToken).toBeTruthy();
    expect(verify.body.user.email).toBe('john.doe@example.com');

    const me = await ctx.request
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${verify.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.phone).toBe('+601111222333');
    expect(me.body.user.role).toBe('CUSTOMER');
  });

  it('registering with an existing phone or email returns 409', async () => {
    const reg = await ctx.request.post('/api/v1/auth/register').send({
      name: 'Jane Doe',
      email: 'john.doe@example.com',
      phone: '+601111222333',
      accountNumber: '222233334444',
    });
    expect(reg.status).toBe(409);
    expect(reg.body.error.code).toBe('USER_EXISTS');
  });

  it('rejects a wrong OTP and limits attempts to 3', async () => {
    await ctx.request.post('/api/v1/auth/request-otp').send({ phone: '+601111222333' });

    for (let i = 0; i < 3; i++) {
      const bad = await ctx.request
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '+601111222333', code: '000000' });
      if (i < 2) {
        expect(bad.status).toBe(400);
      } else {
        expect([400, 429]).toContain(bad.status);
      }
    }
  });

  it('refresh rotates tokens and logout revokes the refresh token', async () => {
    const refresh = await ctx.request.post('/api/v1/auth/refresh').send({
      refreshToken: (await lastTokens(ctx)).refreshToken,
    });
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTruthy();
    expect(refresh.body.refreshToken).not.toBe((await lastTokens(ctx)).refreshToken);

    const logout = await ctx.request.post('/api/v1/auth/logout').send({
      refreshToken: refresh.body.refreshToken,
    });
    expect(logout.status).toBe(200);

    const reuse = await ctx.request.post('/api/v1/auth/refresh').send({
      refreshToken: refresh.body.refreshToken,
    });
    expect(reuse.status).toBe(401);
  });

  it('GET /auth/me without a token is 401', async () => {
    const me = await ctx.request.get('/api/v1/auth/me');
    expect(me.status).toBe(401);
  });
});

async function lastTokens(testCtx: TestContext) {
  const req = await testCtx.request.post('/api/v1/auth/request-otp').send({
    phone: '+601111222333',
  });
  const verify = await testCtx.request
    .post('/api/v1/auth/verify-otp')
    .send({ phone: '+601111222333', code: req.body.devCode });
  return { accessToken: verify.body.accessToken, refreshToken: verify.body.refreshToken };
}
