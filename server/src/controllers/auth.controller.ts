import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JwtPayload } from '../middleware/auth.js';
import { User, IUserDocument } from '../models/User.js';
import { ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput } from '../schemas/auth.js';
import { sendError, sendSuccess } from '../utils/api-response.js';

const BCRYPT_ROUNDS = 12;

function generateToken(user: IUserDocument): string {
  const payload: JwtPayload = {
    userId: user._id.toString(),
    role: user.role,
    tokenVersion: user.tokenVersion
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '24h'
  });
}

function formatSafeUser(user: IUserDocument) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    donorType: user.donorType,
    isBlocked: user.isBlocked,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body as RegisterInput;
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    sendError(res, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.', 409);
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Force role to 'user' - public register can never set 'admin'
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'user',
    tokenVersion: 0,
    isBlocked: false
  });

  const token = generateToken(user);

  sendSuccess(
    res,
    {
      user: formatSafeUser(user),
      token
    },
    201
  );
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  // Exact same error message for unknown email and wrong password to prevent user enumeration
  if (!user) {
    sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    return;
  }

  if (user.isBlocked) {
    sendError(res, 'USER_BLOCKED', 'Your account has been suspended.', 403);
    return;
  }

  const token = generateToken(user);

  sendSuccess(res, {
    user: formatSafeUser(user),
    token
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  sendSuccess(res, {
    user: formatSafeUser(req.user)
  });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  const { name, donorType } = req.body as UpdateProfileInput;

  if (name !== undefined) {
    req.user.name = name.trim();
  }

  if (donorType !== undefined) {
    req.user.donorType = donorType === null ? undefined : donorType;
  }

  await req.user.save();

  sendSuccess(res, {
    user: formatSafeUser(req.user)
  });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  // Retrieve user with passwordHash
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) {
    sendError(res, 'UNAUTHORIZED', 'User not found', 401);
    return;
  }

  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentPasswordValid) {
    sendError(res, 'INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
    return;
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  // Increment tokenVersion to invalidate all existing tokens
  user.tokenVersion += 1;
  await user.save();

  const newToken = generateToken(user);

  sendSuccess(res, {
    message: 'Password changed successfully',
    token: newToken
  });
}
