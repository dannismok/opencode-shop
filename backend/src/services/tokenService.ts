import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { unauthorized } from '../lib/errors';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class TokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  private signAccessToken(userId: string, role: string): string {
    return jwt.sign(
      { sub: userId, role, type: 'access' } satisfies AccessTokenPayload,
      this.env.JWT_SECRET,
      { expiresIn: this.env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] },
    );
  }

  private signRefreshToken(userId: string): { token: string; jti: string } {
    const jti = randomBytes(16).toString('hex');
    const token = jwt.sign(
      { sub: userId, jti, type: 'refresh' } satisfies RefreshTokenPayload,
      this.env.JWT_SECRET,
      { expiresIn: this.env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'] },
    );
    return { token, jti };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, this.env.JWT_SECRET) as AccessTokenPayload;
      if (payload.type !== 'access') throw new Error('wrong token type');
      return payload;
    } catch {
      throw unauthorized('Invalid or expired access token');
    }
  }

  private async persistRefreshToken(userId: string, token: string, jti: string): Promise<void> {
    const tokenHash = await bcrypt.hash(hashToken(token), 10);
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + msFromJwt(this.env.JWT_REFRESH_TTL)),
      },
    });
  }

  async issueTokenPair(userId: string, role: string): Promise<TokenPair> {
    const accessToken = this.signAccessToken(userId, role);
    const { token: refreshToken, jti } = this.signRefreshToken(userId);
    await this.persistRefreshToken(userId, refreshToken, jti);
    return {
      accessToken,
      refreshToken,
      expiresIn: secondsFromJwt(this.env.JWT_ACCESS_TTL),
    };
  }

  async rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = jwt.verify(refreshToken, this.env.JWT_SECRET) as RefreshTokenPayload;
      if (payload.type !== 'refresh') throw new Error('wrong token type');
    } catch {
      throw unauthorized('Invalid or expired refresh token');
    }

    const record = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!record || record.revokedAt) {
      throw unauthorized('Invalid or expired refresh token');
    }
    if (record.expiresAt < new Date()) {
      throw unauthorized('Invalid or expired refresh token');
    }

    const presentedHash = hashToken(refreshToken);
    const matches = await bcrypt.compare(presentedHash, record.tokenHash);
    if (!matches) {
      throw unauthorized('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || !user.isActive) {
      throw unauthorized('Account is not active');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(user.id, user.role);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const payload = jwt.verify(refreshToken, this.env.JWT_SECRET) as RefreshTokenPayload;
      const record = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
      if (record && !record.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: record.id },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      throw unauthorized('Invalid or expired refresh token');
    }
  }
}

function msFromJwt(expression: string): number {
  return secondsFromJwt(expression) * 1000;
}

function secondsFromJwt(expression: string): number {
  const m = /^(\d+)([smhdw])?$/.exec(expression);
  if (!m) return 900;
  const value = Number(m[1]);
  const unit = m[2] ?? 's';
  const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return value * (multiplier[unit] ?? 1);
}
