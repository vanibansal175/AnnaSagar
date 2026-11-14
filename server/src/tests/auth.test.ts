import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';

describe('Auth & User Endpoints', () => {
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

  const validUserData = {
    name: 'Aarav Sharma',
    email: 'aarav@example.com',
    password: 'Password123'
  };

  describe('POST /api/auth/register', () => {
    it('successfully registers a user with role "user" and returns token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.name).toBe('Aarav Sharma');
      expect(res.body.data.user.email).toBe('aarav@example.com');
      expect(res.body.data.user.role).toBe('user');
      expect(res.body.data.user.isBlocked).toBe(false);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.token).toBeTypeOf('string');

      // Verify in DB
      const userInDb = await User.findOne({ email: 'aarav@example.com' }).select('+passwordHash');
      expect(userInDb).not.toBeNull();
      expect(userInDb!.passwordHash).toBeDefined();
      expect(userInDb!.passwordHash).not.toBe('Password123');
    });

    it('forces role to "user" even if request body attempts to pass role="admin"', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          role: 'admin'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('user');

      const userInDb = await User.findOne({ email: 'aarav@example.com' });
      expect(userInDb!.role).toBe('user');
    });

    it('returns 409 when registering with duplicate email (case-insensitive)', async () => {
      await request(app).post('/api/auth/register').send(validUserData);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          email: 'AARAV@example.com'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(res.body.error.message).toBe('An account with this email already exists.');
    });

    it('rejects weak password with 400 validation error', async () => {
      // Too short (< 8 chars)
      const resShort = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          password: 'pass1'
        });
      expect(resShort.status).toBe(400);
      expect(resShort.body.error.code).toBe('VALIDATION_ERROR');

      // Only letters (no number)
      const resNoNumber = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          password: 'passwordonly'
        });
      expect(resNoNumber.status).toBe(400);
      expect(resNoNumber.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(validUserData);
    });

    it('successfully logs in with valid credentials and returns JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserData.email,
          password: validUserData.password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validUserData.email);
      expect(res.body.data.token).toBeTypeOf('string');
    });

    it('gives the exact same error message for unknown email and wrong password', async () => {
      // Unknown email
      const resUnknown = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123'
        });

      expect(resUnknown.status).toBe(401);
      expect(resUnknown.body.success).toBe(false);
      expect(resUnknown.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(resUnknown.body.error.message).toBe('Invalid email or password.');

      // Wrong password
      const resWrongPass = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserData.email,
          password: 'WrongPassword999'
        });

      expect(resWrongPass.status).toBe(401);
      expect(resWrongPass.body.success).toBe(false);
      expect(resWrongPass.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(resWrongPass.body.error.message).toBe('Invalid email or password.');

      // Exact string equality
      expect(resUnknown.body.error.message).toBe(resWrongPass.body.error.message);
    });

    it('returns 403 when a blocked user attempts to log in', async () => {
      await User.updateOne({ email: validUserData.email }, { isBlocked: true });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserData.email,
          password: validUserData.password
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('USER_BLOCKED');
      expect(res.body.error.message).toBe('Your account has been suspended.');
    });
  });

  describe('JWT Verification, Session Invalidation & Token Tampering', () => {
    let token: string;

    beforeEach(async () => {
      const reg = await request(app).post('/api/auth/register').send(validUserData);
      token = reg.body.data.token;
    });

    it('allows access to GET /api/auth/me with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validUserData.email);
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('rejects tampered or corrupted token with 401 UNAUTHORIZED', async () => {
      const tamperedToken = token.slice(0, -6) + 'abc123';

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with missing or malformed Authorization header', async () => {
      const resNoHeader = await request(app).get('/api/auth/me');
      expect(resNoHeader.status).toBe(401);

      const resMalformed = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Basic 123456');
      expect(resMalformed.status).toBe(401);
    });

    it('invalidates old tokens when password is changed (tokenVersion incremented)', async () => {
      // Change password
      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: validUserData.password,
          newPassword: 'NewPassword456'
        });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.success).toBe(true);
      const newToken = changeRes.body.data.token;
      expect(newToken).toBeDefined();

      // Old token must now be rejected with TOKEN_INVALIDATED (401)
      const oldTokenRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(oldTokenRes.status).toBe(401);
      expect(oldTokenRes.body.error.code).toBe('TOKEN_INVALIDATED');
      expect(oldTokenRes.body.error.message).toContain('Session invalidated');

      // New token must work
      const newTokenRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${newToken}`);

      expect(newTokenRes.status).toBe(200);
      expect(newTokenRes.body.data.user.email).toBe(validUserData.email);

      // Logging in with new password works
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserData.email,
          password: 'NewPassword456'
        });
      expect(loginRes.status).toBe(200);
    });

    it('rejects blocked user on protected routes with 403 USER_BLOCKED', async () => {
      // Block the user
      await User.updateOne({ email: validUserData.email }, { isBlocked: true });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('USER_BLOCKED');
      expect(res.body.error.message).toContain('suspended');
    });
  });

  describe('Role-Based Access Control on Admin Routes', () => {
    it('returns 403 when a normal user attempts to access an admin route', async () => {
      const reg = await request(app).post('/api/auth/register').send(validUserData);
      const userToken = reg.body.data.token;

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Insufficient permissions');
    });

    it('allows an admin to access admin routes', async () => {
      // Create admin user directly in DB
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@annasagar.org',
        passwordHash: 'hash',
        role: 'admin',
        tokenVersion: 0,
        isBlocked: false
      });

      // Login or generate token for admin
      const jwt = (await import('jsonwebtoken')).default;
      const { env } = await import('../config/env.js');
      const adminToken = jwt.sign(
        { userId: admin._id.toString(), role: 'admin', tokenVersion: 0 },
        env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PATCH /api/users/me (Profile update)', () => {
    it('allows user to update their name and donorType', async () => {
      const reg = await request(app).post('/api/auth/register').send(validUserData);
      const token = reg.body.data.token;

      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Aarav S.',
          donorType: 'hostel_pg'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Aarav S.');
      expect(res.body.data.user.donorType).toBe('hostel_pg');
    });
  });
});
