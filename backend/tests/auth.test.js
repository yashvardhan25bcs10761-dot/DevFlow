import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { User } from '../models/User.js';
import { Repository } from '../models/Repository.js';
import { env } from '../config/env.js';

describe('Authentication & Preferences API (SPEC Sections 7, 10, 12)', () => {
  const validUser = {
    name: 'Dev Tester',
    email: 'tester@devflow.io',
    password: 'Password123',
  };

  describe('POST /api/v1/auth/register', () => {
    it('registers user, hashes password, sets cookie, and does not return passwordHash', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.name).toBe(validUser.name);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();

      // Check cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('devflow_token=');
      expect(cookies[0]).toContain('HttpOnly');

      // Verify database stored passwordHash and not plain password
      const dbUser = await User.findOne({ email: validUser.email });
      expect(dbUser).toBeDefined();
      expect(dbUser.passwordHash).not.toBe(validUser.password);
      expect(dbUser.passwordHash).toMatch(/^\$2[aby]\$.{56}$/);
    });

    it('rejects duplicate email with 409 Conflict', async () => {
      // First registration
      await request(app).post('/api/v1/auth/register').send(validUser);

      // Attempt duplicate registration
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects invalid email format with 400 Validation Error', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validUser, email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects weak password with 400 (under 8 characters)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validUser, password: 'pass1' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects password lacking numbers with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validUser, password: 'lettersOnlyPassword' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('authenticates valid credentials, sets cookie, and returns user profile without passwordHash', async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: validUser.email,
          password: validUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.passwordHash).toBeUndefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('devflow_token=');
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('rejects incorrect password with 401 Unauthorized', async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: validUser.email,
          password: 'WrongPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects non-existent email with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'unknown@devflow.io',
          password: 'Password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/v1/auth/logout and GET /api/v1/auth/me', () => {
    it('session persists across refresh, logout clears cookie, unauthenticated returns 401', async () => {
      // 1. Register & get cookie
      const regRes = await request(app).post('/api/v1/auth/register').send(validUser);
      const cookie = regRes.headers['set-cookie'];

      // 2. Fetch /me with cookie
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user.email).toBe(validUser.email);

      // 3. Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // 4. Request /me without cookie returns 401
      const unauthRes = await request(app).get('/api/v1/auth/me');
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an expired session with a clear 401 response', async () => {
      const token = jwt.sign(
        { userId: '507f1f77bcf86cd799439011', email: validUser.email },
        env.JWT_SECRET,
        { expiresIn: -1 },
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `devflow_token=${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Session expired. Please log in again.',
      });
    });
  });

  describe('Preferences: GET & PATCH /api/v1/preferences', () => {
    it('lazily initializes default preferences (14, 7) on first GET and updates with validated values', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send(validUser);
      const cookie = regRes.headers['set-cookie'];

      // 1. Initial GET -> lazy creation
      const getRes = await request(app)
        .get('/api/v1/preferences')
        .set('Cookie', cookie);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.staleIssueDays).toBe(14);
      expect(getRes.body.data.stalePullRequestDays).toBe(7);

      // 2. PATCH with valid thresholds
      const patchRes = await request(app)
        .patch('/api/v1/preferences')
        .set('Cookie', cookie)
        .send({
          staleIssueDays: 30,
          stalePullRequestDays: 14,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.staleIssueDays).toBe(30);
      expect(patchRes.body.data.stalePullRequestDays).toBe(14);

      // 3. Verify persistence
      const verifyRes = await request(app)
        .get('/api/v1/preferences')
        .set('Cookie', cookie);
      expect(verifyRes.body.data.staleIssueDays).toBe(30);
      expect(verifyRes.body.data.stalePullRequestDays).toBe(14);

      // 4. Reject out of range (range 1 - 365)
      const invalidRes = await request(app)
        .patch('/api/v1/preferences')
        .set('Cookie', cookie)
        .send({
          staleIssueDays: 0,
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error.code).toBe('VALIDATION_ERROR');

      const invalidHighRes = await request(app)
        .patch('/api/v1/preferences')
        .set('Cookie', cookie)
        .send({
          stalePullRequestDays: 500,
        });

      expect(invalidHighRes.status).toBe(400);
      expect(invalidHighRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('saves only an owned default repository and allows clearing it', async () => {
      const first = await request(app).post('/api/v1/auth/register').send(validUser);
      const firstCookie = first.headers['set-cookie'];
      const firstUser = await User.findOne({ email: validUser.email });
      const repository = await Repository.create({
        userId: firstUser._id,
        githubId: 1296269,
        fullName: 'octocat/hello-world',
        ownerLogin: 'octocat',
        name: 'Hello-World',
        htmlUrl: 'https://github.com/octocat/Hello-World',
      });

      const saveRes = await request(app)
        .patch('/api/v1/preferences')
        .set('Cookie', firstCookie)
        .send({ defaultRepositoryId: repository._id.toString() });
      expect(saveRes.status).toBe(200);
      expect(saveRes.body.data.defaultRepositoryId).toBe(repository._id.toString());

      const other = await request(app).post('/api/v1/auth/register').send({
        ...validUser,
        email: 'other@devflow.io',
      });
      const deniedRes = await request(app)
        .patch('/api/v1/preferences')
        .set('Cookie', other.headers['set-cookie'])
        .send({ defaultRepositoryId: repository._id.toString() });
      expect(deniedRes.status).toBe(404);
      expect(deniedRes.body.error.code).toBe('REPOSITORY_NOT_FOUND');

      const clearRes = await request(app)
        .patch('/api/v1/preferences')
        .set('Cookie', firstCookie)
        .send({ defaultRepositoryId: null });
      expect(clearRes.status).toBe(200);
      expect(clearRes.body.data.defaultRepositoryId).toBeNull();
    });
  });
});
