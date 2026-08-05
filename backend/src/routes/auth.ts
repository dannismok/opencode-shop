import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Deps } from '../container';
import { assertSchema } from '../lib/errors';
import { normalizePhone } from '../lib/phone';
import { createSmsProvider } from '../services/sms/SmsProvider';
import { OtpService } from '../services/otpService';
import { TokenService } from '../services/tokenService';
import { createAuthMiddleware } from '../middleware/auth';

const requestOtpSchema = z.object({
  phone: z.string().min(1),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
});

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(1),
  accountNumber: z.string().regex(/^\d{8,20}$/, 'Bank account number must be 8-20 digits'),
});

const tokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export function authRouter(deps: Deps) {
  const router = Router();
  const otpService = new OtpService(deps.prisma, deps.env);
  const tokenService = new TokenService(deps.prisma, deps.env);
  const sms = createSmsProvider(deps.env, deps.logger);
  const { requireAuth } = createAuthMiddleware({ prisma: deps.prisma, tokenService });

  const otpRateLimit = rateLimit({
    windowMs: deps.env.OTP_RATE_LIMIT_WINDOW_MS,
    limit: deps.env.OTP_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const body = (req.body ?? {}) as { phone?: string };
      return `${req.ip}:${body.phone ?? 'unknown'}`;
    },
    message: { error: { code: 'RATE_LIMITED', message: 'Too many OTP requests. Try again later.' } },
  });

  async function issueOtp(phone: string) {
    const normalized = normalizePhone(phone);
    const result = await otpService.issue(normalized);
    await sms.send({ to: normalized, body: `Your OpenCode Shop OTP is ${result.devCode ?? '(see console)'}` });
    return { normalized, result };
  }

  router.post('/request-otp', otpRateLimit, async (req, res, next) => {
    try {
      const { phone } = assertSchema(requestOtpSchema, req.body);
      const { result } = await issueOtp(phone);
      res.json({
        message: 'OTP sent',
        expiresAt: result.expiresAt,
        attemptsRemaining: result.attemptsRemaining,
        ...(result.devCode !== undefined ? { devCode: result.devCode } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/register', otpRateLimit, async (req, res, next) => {
    try {
      const data = assertSchema(registerSchema, req.body);
      const phone = normalizePhone(data.phone);
      const existing = await deps.prisma.user.findFirst({
        where: { OR: [{ phone }, { email: data.email }] },
      });
      if (existing) {
        res.status(409).json({
          error: {
            code: 'USER_EXISTS',
            message: 'A user with this phone or email already exists. Please login instead.',
            details: { field: existing.phone === phone ? 'phone' : 'email' },
          },
        });
        return;
      }
      await deps.prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone,
          accountNumber: data.accountNumber,
          role: 'CUSTOMER',
        },
      });
      const { result } = await issueOtp(phone);
      res.status(201).json({
        message: 'Account created. OTP sent to verify your phone.',
        expiresAt: result.expiresAt,
        attemptsRemaining: result.attemptsRemaining,
        ...(result.devCode !== undefined ? { devCode: result.devCode } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/verify-otp', async (req, res, next) => {
    try {
      const { phone, code } = assertSchema(verifyOtpSchema, req.body);
      const normalized = normalizePhone(phone);
      await otpService.verify(normalized, code);
      const user = await deps.prisma.user.findUnique({ where: { phone: normalized } });
      if (!user || !user.isActive) {
        res.status(404).json({
          error: { code: 'NOT_REGISTERED', message: 'No account found for this phone. Please register first.' },
        });
        return;
      }
      const tokens = await tokenService.issueTokenPair(user.id, user.role);
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        ...tokens,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const { refreshToken } = assertSchema(tokenSchema, req.body);
      const tokens = await tokenService.rotateRefreshToken(refreshToken);
      res.json(tokens);
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const { refreshToken } = assertSchema(tokenSchema, req.body);
      await tokenService.revokeRefreshToken(refreshToken);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  const updateMeSchema = z
    .object({
      name: z.string().min(2).max(120).optional(),
      email: z.string().email().optional(),
      accountNumber: z.string().regex(/^\d{8,20}$/).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

  router.patch('/me', requireAuth, async (req, res, next) => {
    try {
      const data = assertSchema(updateMeSchema, req.body);
      const emailTaken = data.email
        ? await deps.prisma.user.findFirst({
            where: { email: data.email, id: { not: req.user!.id } },
          })
        : null;
      if (emailTaken) {
        res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email is already in use.' } });
        return;
      }
      const updated = await deps.prisma.user.update({
        where: { id: req.user!.id },
        data,
        select: { id: true, name: true, email: true, phone: true, role: true, accountNumber: true },
      });
      res.json({ user: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
