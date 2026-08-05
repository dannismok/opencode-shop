import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient, User } from '@prisma/client';
import type { TokenService } from '../services/tokenService';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthenticatedUser {
  id: string;
  role: string;
  name: string;
  email: string;
  phone: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
    accessToken?: string;
  }
}

export interface AuthDeps {
  prisma: PrismaClient;
  tokenService: TokenService;
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
}

export function createAuthMiddleware(deps: AuthDeps) {
  function requireAuth(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      next(unauthorized('Missing bearer token'));
      return;
    }
    const token = header.slice('Bearer '.length);
    const payload = deps.tokenService.verifyAccessToken(token);
    deps.prisma.user
      .findUnique({ where: { id: payload.sub } })
      .then((user) => {
        if (!user || !user.isActive) {
          next(forbidden('Account is not active'));
          return;
        }
        req.user = toAuthenticatedUser(user);
        req.accessToken = token;
        next();
      })
      .catch(next);
  }

  function requireAdmin(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (req.user.role !== 'ADMIN') {
      next(forbidden('Admin access required'));
      return;
    }
    next();
  }

  return { requireAuth, requireAdmin };
}
