import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;

export async function seedAdmin(customUri?: string): Promise<void> {
  const email = env.ADMIN_EMAIL.toLowerCase().trim();
  const password = env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.error('ADMIN_EMAIL and ADMIN_PASSWORD must be configured in environment');
    process.exit(1);
  }

  // Refuse weak passwords
  if (password.length < 12) {
    logger.error('ADMIN_PASSWORD must be at least 12 characters long for security');
    process.exit(1);
  }

  const wasAlreadyConnected = mongoose.connection.readyState === 1;

  try {
    if (!wasAlreadyConnected) {
      await connectDatabase(customUri);
    }

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      logger.info({ email }, 'Admin account already exists. Skipping seed.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await User.create({
      name: 'System Administrator',
      email,
      passwordHash,
      role: 'admin',
      tokenVersion: 0,
      isBlocked: false
    });

    logger.info({ email }, 'Admin account created successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed admin user');
    throw error;
  } finally {
    if (!wasAlreadyConnected) {
      await disconnectDatabase();
    }
  }
}

// Run directly if invoked via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
