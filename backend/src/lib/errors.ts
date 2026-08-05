import { ZodError } from 'zod';
import type { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Unauthorized') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message = 'Conflict', code = 'CONFLICT', details?: unknown) =>
  new AppError(409, code, message, details);

export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', message);

export function assertSchema<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw badRequest('Validation failed', details);
    }
    throw err;
  }
}

export function assertQuery<T>(schema: z.ZodType<T>, data: unknown): T {
  return assertSchema(schema, data);
}

export type AppNext = NextFunction;
export type AppRequest = Request;
export type AppResponse = Response;
