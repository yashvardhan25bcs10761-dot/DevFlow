import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { User } from '../models/User.js';
import { Repository } from '../models/Repository.js';
import { githubService } from '../services/githubService.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

describe('Repository Persistence & Ownership API (SPEC Sections 7, 10, 12)', () => {
  let userA, userB;
  let cookieA, cookieB;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Create User A
    userA = await User.create({
      name: 'User Alpha',
      email: 'alpha@devflow.io',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const tokenA = jwt.sign({ userId: userA._id.toString(), email: userA.email }, env.JWT_SECRET);
    cookieA = `devflow_token=${tokenA}`;

    // Create User B
    userB = await User.create({
      name: 'User Beta',
      email: 'beta@devflow.io',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvwxyzbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    const tokenB = jwt.sign({ userId: userB._id.toString(), email: userB.email }, env.JWT_SECRET);
    cookieB = `devflow_token=${tokenB}`;

    // Default mock for githubService.fetchRepositoryMetadata
    vi.spyOn(githubService, 'fetchRepositoryMetadata').mockImplementation(async (owner, repo) => ({
      data: {
        githubId: 123456,
        ownerLogin: owner,
        name: repo,
        fullName: `${owner}/${repo}`.toLowerCase(),
        description: `Description of ${repo}`,
        htmlUrl: `https://github.com/${owner}/${repo}`,
        defaultBranch: 'main',
        visibility: 'public',
        stars: 150,
        forks: 45,
        openIssuesCount: 12,
        githubCreatedAt: '2020-01-01T00:00:00Z',
        githubUpdatedAt: '2026-10-01T00:00:00Z',
        githubPushedAt: '2026-10-25T00:00:00Z',
      },
      source: 'live',
      fetchedAt: new Date().toISOString(),
    }));
  });

  describe('POST /api/v1/repositories (Save)', () => {
    it('saves a repository with backend-fetched metadata', async () => {
      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Cookie', cookieA)
        .send({ fullName: 'octocat/Hello-World' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe('octocat/hello-world');
      expect(res.body.data.stars).toBe(150);
      expect(res.body.data.userId.toString()).toBe(userA._id.toString());

      // Confirm in DB
      const dbRepo = await Repository.findById(res.body.data._id);
      expect(dbRepo).toBeDefined();
      expect(dbRepo.fullName).toBe('octocat/hello-world');
    });

    it('rejects duplicate repository save for same user with 409', async () => {
      // First save
      await request(app)
        .post('/api/v1/repositories')
        .set('Cookie', cookieA)
        .send({ fullName: 'octocat/Hello-World' });

      // Duplicate save attempt
      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Cookie', cookieA)
        .send({ fullName: 'OCTOCAT/HELLO-WORLD' }); // Case-insensitive duplicate check

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_REPOSITORY');
    });

    it('allows two different users to save the same public repository independently', async () => {
      // User A saves
      const resA = await request(app)
        .post('/api/v1/repositories')
        .set('Cookie', cookieA)
        .send({ fullName: 'octocat/Hello-World' });
      expect(resA.status).toBe(201);

      // User B saves same repo
      const resB = await request(app)
        .post('/api/v1/repositories')
        .set('Cookie', cookieB)
        .send({ fullName: 'octocat/Hello-World' });
      expect(resB.status).toBe(201);
    });

    it('rejects invalid repo format with 400', async () => {
      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Cookie', cookieA)
        .send({ fullName: 'invalid-name' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REPO_FORMAT');
    });

    it('rejects a non-object repository save body with 400 instead of a server error', async () => {
      const response = await request(app)
        .post('/api/v1/repositories')
        .set('Cookie', cookieA)
        .send(null);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/repositories (List)', () => {
    it('returns only the authenticated user repositories', async () => {
      // User A saves 2 repos
      await Repository.create({
        userId: userA._id,
        githubId: 1,
        fullName: 'user-a/repo-1',
        ownerLogin: 'user-a',
        name: 'repo-1',
        htmlUrl: 'https://github.com/user-a/repo-1',
      });
      await Repository.create({
        userId: userA._id,
        githubId: 2,
        fullName: 'user-a/repo-2',
        ownerLogin: 'user-a',
        name: 'repo-2',
        htmlUrl: 'https://github.com/user-a/repo-2',
      });

      // User B saves 1 repo
      await Repository.create({
        userId: userB._id,
        githubId: 3,
        fullName: 'user-b/repo-solo',
        ownerLogin: 'user-b',
        name: 'repo-solo',
        htmlUrl: 'https://github.com/user-b/repo-solo',
      });

      // Request as User A
      const resA = await request(app).get('/api/v1/repositories').set('Cookie', cookieA);
      expect(resA.status).toBe(200);
      expect(resA.body.data).toHaveLength(2);
      expect(resA.body.data.every((r) => r.userId.toString() === userA._id.toString())).toBe(true);

      // Request as User B
      const resB = await request(app).get('/api/v1/repositories').set('Cookie', cookieB);
      expect(resB.status).toBe(200);
      expect(resB.body.data).toHaveLength(1);
      expect(resB.body.data[0].fullName).toBe('user-b/repo-solo');
    });
  });

  describe('Cross-User Ownership & Validation Checks', () => {
    let repoOfUserB;

    beforeEach(async () => {
      repoOfUserB = await Repository.create({
        userId: userB._id,
        githubId: 999,
        fullName: 'beta-org/secret-tool',
        ownerLogin: 'beta-org',
        name: 'secret-tool',
        htmlUrl: 'https://github.com/beta-org/secret-tool',
      });
    });

    it('rejects invalid ObjectId with 400 INVALID_ID', async () => {
      const getRes = await request(app)
        .get('/api/v1/repositories/not-a-valid-object-id')
        .set('Cookie', cookieA);
      expect(getRes.status).toBe(400);
      expect(getRes.body.error.code).toBe('INVALID_ID');

      const delRes = await request(app)
        .delete('/api/v1/repositories/12345')
        .set('Cookie', cookieA);
      expect(delRes.status).toBe(400);
      expect(delRes.body.error.code).toBe('INVALID_ID');

      const refRes = await request(app)
        .post('/api/v1/repositories/12345/refresh')
        .set('Cookie', cookieA);
      expect(refRes.status).toBe(400);
      expect(refRes.body.error.code).toBe('INVALID_ID');
    });

    it('User A cannot get User B repository (returns 404)', async () => {
      const res = await request(app)
        .get(`/api/v1/repositories/${repoOfUserB._id}`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('REPOSITORY_NOT_FOUND');
    });

    it('User A cannot delete User B repository (returns 404)', async () => {
      const res = await request(app)
        .delete(`/api/v1/repositories/${repoOfUserB._id}`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('REPOSITORY_NOT_FOUND');

      // Verify repo still exists in DB
      const stillExists = await Repository.findById(repoOfUserB._id);
      expect(stillExists).toBeDefined();
    });

    it('User A cannot refresh User B repository (returns 404)', async () => {
      const res = await request(app)
        .post(`/api/v1/repositories/${repoOfUserB._id}/refresh`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('REPOSITORY_NOT_FOUND');
    });

    it('owner can delete their own repository', async () => {
      const res = await request(app)
        .delete(`/api/v1/repositories/${repoOfUserB._id}`)
        .set('Cookie', cookieB);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await Repository.findById(repoOfUserB._id);
      expect(deleted).toBeNull();
    });

    it('owner can refresh their own repository', async () => {
      vi.spyOn(githubService, 'fetchRepositoryMetadata').mockResolvedValueOnce({
        data: {
          stars: 9999,
          forks: 888,
          description: 'Updated description',
          openIssuesCount: 5,
          defaultBranch: 'main',
          githubUpdatedAt: '2026-10-27T10:00:00Z',
          githubPushedAt: '2026-10-27T10:00:00Z',
        },
        source: 'live',
        fetchedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/api/v1/repositories/${repoOfUserB._id}/refresh`)
        .set('Cookie', cookieB);

      expect(res.status).toBe(200);
      expect(res.body.data.stars).toBe(9999);
      expect(res.body.data.description).toBe('Updated description');
    });
  });
});
