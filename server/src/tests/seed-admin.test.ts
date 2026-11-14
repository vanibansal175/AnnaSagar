import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { seedAdmin } from '../scripts/seed-admin.js';

describe('Admin Seed Script', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDatabase(uri);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('creates an admin account with role "admin" and hashed password', async () => {
    await seedAdmin(mongoServer.getUri());

    const admin = await User.findOne({ email: env.ADMIN_EMAIL.toLowerCase() }).select('+passwordHash');
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('admin');
    expect(admin!.isBlocked).toBe(false);
    expect(admin!.passwordHash).toBeDefined();
    expect(admin!.passwordHash).not.toBe(env.ADMIN_PASSWORD);
  });

  it('is idempotent when run multiple times', async () => {
    await seedAdmin(mongoServer.getUri());
    const countFirst = await User.countDocuments({ email: env.ADMIN_EMAIL.toLowerCase() });
    expect(countFirst).toBe(1);

    // Run again
    await seedAdmin(mongoServer.getUri());
    const countSecond = await User.countDocuments({ email: env.ADMIN_EMAIL.toLowerCase() });
    expect(countSecond).toBe(1);
  });
});
