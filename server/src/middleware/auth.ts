import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User, UserRole } from '../models/User.js';
import { sendError } from '../utils/api-response.js';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', 'Authentication token required', 401);
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    sendError(res, 'UNAUTHORIZED', 'Authentication token required', 401);
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    if (!decoded.userId || decoded.tokenVersion === undefined) {
      sendError(res, 'UNAUTHORIZED', 'Invalid token payload', 401);
      return;
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      sendError(res, 'UNAUTHORIZED', 'User not found or session invalid', 401);
      return;
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      sendError(res, 'TOKEN_INVALIDATED', 'Session invalidated. Please log in again.', 401);
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      sendError(res, 'TOKEN_EXPIRED', 'Token has expired', 401);
      return;
    }
    sendError(res, 'UNAUTHORIZED', 'Invalid or corrupted token', 401);
    return;
  }
}

export function checkNotBlocked(req: Request, res: Response, next: NextFunction): void {
  if (req.user && req.user.isBlocked) {
    sendError(res, 'USER_BLOCKED', 'Your account has been suspended.', 403);
    return;
  }
  next();
}

export function checkRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    if (req.user.role !== role) {
      sendError(res, 'FORBIDDEN', 'Access denied. Insufficient permissions.', 403);
      return;
    }

    next();
  };
}
