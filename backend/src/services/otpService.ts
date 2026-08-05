import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { badRequest } from '../lib/errors';

export interface OtpRequestResult {
  expiresAt: Date;
  attemptsRemaining: number;
  devCode?: string;
}

export class OtpService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  private generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async issue(phone: string): Promise<OtpRequestResult> {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.env.OTP_TTL_MINUTES * 60_000);

    await this.prisma.otpCode.deleteMany({
      where: { phone, consumedAt: null },
    });

    await this.prisma.otpCode.create({
      data: { phone, codeHash, expiresAt },
    });

    return {
      expiresAt,
      attemptsRemaining: this.env.OTP_MAX_ATTEMPTS,
      devCode: this.env.NODE_ENV !== 'production' ? code : undefined,
    };
  }

  async verify(phone: string, code: string): Promise<void> {
    const record = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw badRequest('No active OTP for this phone. Please request a new one.');
    }
    if (record.expiresAt < new Date()) {
      throw badRequest('OTP has expired. Please request a new one.');
    }
    if (record.attempts >= this.env.OTP_MAX_ATTEMPTS) {
      throw badRequest('Too many incorrect attempts. Please request a new OTP.');
    }

    const matches = await bcrypt.compare(code, record.codeHash);
    if (!matches) {
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw badRequest('Incorrect OTP code.');
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date(), attempts: { increment: 1 } },
    });
  }
}
