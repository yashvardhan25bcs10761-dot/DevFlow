import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { User } from '../models/User.js';
import { Repository } from '../models/Repository.js';
import { githubService } from '../services/githubService.js';

async function createUserAndRepository() {
  const agent = request.agent(app);
  const credentials = { name: 'Work Items Tester', email: 'work-items@test.com', password: 'TestPass123!' };
  await agent.post('/api/v1/auth/register').send(credentials);
  const login = await agent.post('/api/v1/auth/login').send({ email: credentials.email, password: credentials.password });
  expect(login.status).toBe(200);

  vi.spyOn(githubService, 'fetchRepositoryMetadata').mockResolvedValueOnce({
    data: {
      githubId: 123,
      fullName: 'octocat/hello-world',
      ownerLogin: 'octocat',
      name: 'Hello-World',
      htmlUrl: 'https://github.com/octocat/Hello-World',
      stars: 1,
      forks: 0,
      openIssuesCount: 1,
    },
    source: 'live',
    fetchedAt: '2026-10-27T10:00:00.000Z',
  });
  const saved = await agent.post('/api/v1/repositories').send({ fullName: 'octocat/Hello-World' });
  expect(saved.status).toBe(201);
  return { agent, repositoryId: saved.body.data._id };
}

describe('repository work item endpoints', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Repository.deleteMany({});
  });

  afterEach(() => vi.restoreAllMocks());

  it('filters stale issues before pagination and returns source and observation metadata', async () => {
    const { agent, repositoryId } = await createUserAndRepository();
    vi.spyOn(githubService, 'fetchIssues').mockResolvedValueOnce({
      issues: [
        {
          id: 1,
          number: 1,
          title: 'Old bug',
          state: 'open',
          author: 'octocat',
          updatedAt: '2020-01-01T00:00:00.000Z',
          labels: ['bug'],
          htmlUrl: 'https://github.com/octocat/Hello-World/issues/1',
        },
        {
          id: 2,
          number: 2,
          title: 'Recent request',
          state: 'open',
          author: 'hubot',
          updatedAt: '2026-10-26T00:00:00.000Z',
          labels: ['feature'],
          htmlUrl: 'https://github.com/octocat/Hello-World/issues/2',
        },
      ],
      capped: false,
      warnings: [],
      rawCount: 2,
      source: 'cached',
      fetchedAt: '2026-10-27T10:00:00.000Z',
    });

    const result = await agent
      .get(`/api/v1/repositories/${repositoryId}/issues?state=open&stale=true&threshold=14&page=1&limit=1`);

    expect(result.status).toBe(200);
    expect(result.body.data.issues).toHaveLength(1);
    expect(result.body.data.issues[0]).toMatchObject({ title: 'Old bug', isStale: true, inactivityDays: expect.any(Number) });
    expect(result.body.data.pagination).toMatchObject({ page: 1, limit: 1, total: 1, pages: 1 });
    expect(result.body.data).toMatchObject({ source: 'cached', fetchedAt: '2026-10-27T10:00:00.000Z' });
    expect(result.body.data.availableLabels).toEqual(['bug', 'feature']);
    expect(result.body.data.observationScope).toMatchObject({ complete: true, fetched: 2, stateScope: 'all-states' });
  });
});
