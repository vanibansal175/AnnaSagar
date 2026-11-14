import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../utils/api-response.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, 'NOT_FOUND', 'Requested resource was not found', 404);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({ err }, 'Unhandled application error');

  if (err instanceof ZodError) {
    const message = err.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    sendError(res, 'VALIDATION_ERROR', message, 400);
    return;
  }

  // Handle Mongoose duplicate key error (code 11000)
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
    sendError(res, 'DUPLICATE_KEY', 'A record with that unique key already exists', 409);
    return;
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'CastError') {
    sendError(res, 'BAD_REQUEST', 'Invalid ID format', 400);
    return;
  }

  // Default internal server error (never leak stack trace)
  sendError(res, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred. Please try again later.', 500);
}
