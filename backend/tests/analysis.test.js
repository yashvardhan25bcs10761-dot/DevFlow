/**
 * Phase 6 — Analysis persistence tests.
 *
 * Rules:
 * - GitHub service is always mocked (vi.spyOn) — no real network calls.
 * - MongoMemoryServer is managed by tests/setup.js.
 * - Tests verify stored snapshot values, ownership, and pagination.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { User } from '../models/User.js';
import { Repository } from '../models/Repository.js';
import { Analysis } from '../models/Analysis.js';
import { githubService } from '../services/githubService.js';

// ---------------------------------------------------------------------------
// Shared fixture: a realistic fetchAllRepositoryData return value
// ---------------------------------------------------------------------------
const NOW = new Date('2024-06-01T12:00:00.000Z');

const MOCK_GITHUB_DATA = {
  repo: {
    githubId: 1296269,
    fullName: 'octocat/hello-world',
    ownerLogin: 'octocat',
    name: 'Hello-World',
    description: 'My first repository on GitHub!',
    htmlUrl: 'https://github.com/octocat/Hello-World',
    defaultBranch: 'master',
    visibility: 'public',
    stars: 2200,
    forks: 1900,
    openIssuesCount: 5,
    githubCreatedAt: '2011-01-26T19:01:12Z',
    githubUpdatedAt: '2024-05-30T10:00:00Z',
    githubPushedAt: '2024-05-29T08:00:00Z',
  },
  commits: [
    { sha: 'abc1', author: 'alice', message: 'feat: init', date: '2024-05-28T10:00:00Z' },
    { sha: 'abc2', author: 'bob', message: 'fix: typo', date: '2024-05-25T10:00:00Z' },
  ],
  issues: [
    {
      id: 101,
      number: 1,
      title: 'Bug #1',
      state: 'open',
      author: 'alice',
      createdAt: '2024-05-20T10:00:00Z',
      updatedAt: '2024-05-20T10:00:00Z',  // stale if threshold < 12 days from NOW
      closedAt: null,
      htmlUrl: 'https://github.com/octocat/Hello-World/issues/1',
    },
    {
      id: 102,
      number: 2,
      title: 'Feature request',
      state: 'closed',
      author: 'bob',
      createdAt: '2024-04-01T10:00:00Z',
      updatedAt: '2024-05-15T10:00:00Z',
      closedAt: '2024-05-15T10:00:00Z',
      htmlUrl: 'https://github.com/octocat/Hello-World/issues/2',
    },
  ],
  pulls: [
    {
      id: 201,
      number: 10,
      title: 'PR #10',
      state: 'open',
      isDraft: false,
      author: 'alice',
      createdAt: '2024-05-15T10:00:00Z',
      updatedAt: '2024-05-15T10:00:00Z',  // stale with default 7-day threshold
      htmlUrl: 'https://github.com/octocat/Hello-World/pull/10',
    },
  ],
  scope: {
    complete: true,
    dataWarnings: [],
    commits: { fetched: 2, cap: 100, capped: false },
    issues: { fetched: 2, cap: 300, capped: false },
    pullRequests: { fetched: 1, cap: 200, capped: false },
  },
  source: 'live',
  fetchedAt: NOW.toISOString(),
};

// Metadata mock used for repo save
const MOCK_META = {
  data: MOCK_GITHUB_DATA.repo,
  source: 'live',
  fetchedAt: NOW.toISOString(),
};

// ---------------------------------------------------------------------------
// Helper: register + login a user, return { agent, userId, cookie }
// ---------------------------------------------------------------------------
async function registerAndLogin(suffix = '') {
  const agent = request.agent(app);
  const email = `analysis${suffix}@test.com`;
  const password = 'TestPass123!';

  await agent
    .post('/api/v1/auth/register')
    .send({ name: `Analysis ${suffix || 'User'}`, email, password });
  const loginRes = await agent.post('/api/v1/auth/login').send({ email, password });
  expect(loginRes.status).toBe(200);

  // extract userId from response
  const userId = loginRes.body.data.user._id;
  return { agent, userId };
}

// ---------------------------------------------------------------------------
// Helper: save a repository for a user (mocks metadata fetch)
// ---------------------------------------------------------------------------
async function saveRepo(agent) {
  vi.spyOn(githubService, 'fetchRepositoryMetadata').mockResolvedValueOnce(MOCK_META);
  const res = await agent.post('/api/v1/repositories').send({ fullName: 'octocat/Hello-World' });
  expect(res.status).toBe(201);
  return res.body.data._id;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('Phase 6 — Analysis Endpoints', () => {
  let agentA;
  let agentB;
  let userARepoId;

  // Set up two users before each test; save a repo for user A
  beforeEach(async () => {
    // Clean state
    await User.deleteMany({});
    await Repository.deleteMany({});
    await Analysis.deleteMany({});

    const a = await registerAndLogin('A');
    const b = await registerAndLogin('B');
    agentA = a.agent;
    agentB = b.agent;

    userARepoId = await saveRepo(agentA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- 1. Run analysis -------------------------------------------------------

  it('POST /repositories/:id/analyze — persists analysis with correct stored values', async () => {
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValueOnce(MOCK_GITHUB_DATA);

    const res = await agentA
      .post(`/api/v1/repositories/${userARepoId}/analyze`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const analysis = res.body.data;

    // healthScore is a number 0-100
    expect(typeof analysis.healthScore).toBe('number');
    expect(analysis.healthScore).toBeGreaterThanOrEqual(0);
    expect(analysis.healthScore).toBeLessThanOrEqual(100);

    // scoreStatus is one of the three valid values
    expect(['complete', 'partial', 'insufficient_data']).toContain(analysis.scoreStatus);

    // thresholdsUsed stored (defaults: 14 issue days, 7 PR days)
    expect(analysis.thresholdsUsed.issueDays).toBe(14);
    expect(analysis.thresholdsUsed.prDays).toBe(7);

    // activitySummary populated
    expect(analysis.activitySummary.commits30d).toBe(2);

    // observationScope stored
    expect(analysis.observationScope).toBeDefined();
    expect(analysis.observationScope.complete).toBe(true);

    // Repository latestHealthScore updated
    const repoRes = await agentA.get(`/api/v1/repositories/${userARepoId}`);
    expect(repoRes.status).toBe(200);
    expect(repoRes.body.data.latestHealthScore).toBe(analysis.healthScore);
    expect(repoRes.body.data.lastAnalyzedAt).toBeDefined();
  });

  // ---- 2. Latest analysis -----------------------------------------------------

  it('GET /repositories/:id/latest-analysis — returns stored snapshot', async () => {
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValueOnce(MOCK_GITHUB_DATA);
    await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();

    const res = await agentA.get(`/api/v1/repositories/${userARepoId}/latest-analysis`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.repositoryId).toBe(userARepoId.toString());
  });

  it('GET /repositories/:id/latest-analysis — 404 when no analysis exists', async () => {
    const res = await agentA.get(`/api/v1/repositories/${userARepoId}/latest-analysis`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ANALYSIS_NOT_FOUND');
  });

  // ---- 3. History returns stored values unchanged after thresholds change -----

  it('history returns stored thresholds even if user changes preferences later', async () => {
    // Run analysis with default thresholds (issueDays=14, prDays=7)
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValueOnce(MOCK_GITHUB_DATA);
    const runRes = await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();
    expect(runRes.status).toBe(201);
    const originalThresholds = runRes.body.data.thresholdsUsed;

    // Change user preferences after the analysis
    await agentA.patch('/api/v1/preferences').send({ staleIssueDays: 30, stalePullRequestDays: 30 });

    // History still shows original stored thresholds (never recomputed)
    const historyRes = await agentA.get(`/api/v1/repositories/${userARepoId}/analysis-history`);
    expect(historyRes.status).toBe(200);
    const storedThresholds = historyRes.body.data.history[0].thresholdsUsed;
    expect(storedThresholds.issueDays).toBe(originalThresholds.issueDays);
    expect(storedThresholds.prDays).toBe(originalThresholds.prDays);
  });

  // ---- 4. Paginated history ---------------------------------------------------

  it('GET /repositories/:id/analysis-history — pagination works', async () => {
    // Create 3 analysis snapshots
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValue(MOCK_GITHUB_DATA);
    await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();
    await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();
    await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();

    const res = await agentA.get(
      `/api/v1/repositories/${userARepoId}/analysis-history?page=1&limit=2`
    );
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(3);
    expect(res.body.data.pagination.pages).toBe(2);
  });

  it('rejects malformed analysis history pagination values', async () => {
    const response = await agentA.get(
      `/api/v1/repositories/${userARepoId}/analysis-history?page=2abc&limit=10`,
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---- 5. GET /analyses/:id ---------------------------------------------------

  it('GET /analyses/:id — returns analysis by id (owned)', async () => {
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValueOnce(MOCK_GITHUB_DATA);
    const runRes = await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();
    const analysisId = runRes.body.data._id;

    const res = await agentA.get(`/api/v1/analyses/${analysisId}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(analysisId);
  });

  // ---- 6. Ownership enforcement -----------------------------------------------

  it('user B cannot run analysis on user A\'s repo — 404', async () => {
    const res = await agentB
      .post(`/api/v1/repositories/${userARepoId}/analyze`)
      .send();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REPOSITORY_NOT_FOUND');
  });

  it('user B cannot get latest-analysis for user A\'s repo — 404', async () => {
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValueOnce(MOCK_GITHUB_DATA);
    await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();

    const res = await agentB.get(`/api/v1/repositories/${userARepoId}/latest-analysis`);
    expect(res.status).toBe(404);
  });

  it('user B cannot get user A\'s analysis by id — 404', async () => {
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValueOnce(MOCK_GITHUB_DATA);
    const runRes = await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();
    const analysisId = runRes.body.data._id;

    const res = await agentB.get(`/api/v1/analyses/${analysisId}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ANALYSIS_NOT_FOUND');
  });

  // ---- 7. Invalid ObjectIds rejected (400) ------------------------------------

  it('POST /repositories/bad-id/analyze — 400 for invalid ObjectId', async () => {
    const res = await agentA.post('/api/v1/repositories/not-valid-id/analyze').send();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('GET /analyses/bad-id — 400 for invalid ObjectId', async () => {
    const res = await agentA.get('/api/v1/analyses/not-valid-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('GET /repositories/bad-id/latest-analysis — 400 for invalid ObjectId', async () => {
    const res = await agentA.get('/api/v1/repositories/not-valid-id/latest-analysis');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  // ---- 8. Delete repo cascades analyses ---------------------------------------

  it('deleting a repo removes its analyses', async () => {
    vi.spyOn(githubService, 'fetchAllRepositoryData').mockResolvedValueOnce(MOCK_GITHUB_DATA);
    await agentA.post(`/api/v1/repositories/${userARepoId}/analyze`).send();

    // Verify analysis exists
    const beforeRes = await agentA.get(`/api/v1/repositories/${userARepoId}/latest-analysis`);
    expect(beforeRes.status).toBe(200);

    // Delete repo
    const deleteRes = await agentA.delete(`/api/v1/repositories/${userARepoId}`);
    expect(deleteRes.status).toBe(200);

    // Analysis should be gone (repo is gone, so 404 from ownership check)
    const count = await Analysis.countDocuments({ repositoryId: userARepoId });
    expect(count).toBe(0);
  });

  // ---- 9. Unauthenticated access rejected -------------------------------------

  it('POST /repositories/:id/analyze — 401 if not authenticated', async () => {
    const res = await request(app)
      .post(`/api/v1/repositories/${userARepoId}/analyze`)
      .send();
    expect(res.status).toBe(401);
  });
});
