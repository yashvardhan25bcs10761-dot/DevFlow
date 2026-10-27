import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { githubService, GitHubError } from '../services/githubService.js';
import { githubCache } from '../services/cacheService.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

describe('GitHub Service & Repository Search (SPEC Sections 8, 10, 12)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    githubCache.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createMockResponse(body, { status = 200, headers = {} } = {}) {
    const headerMap = new Headers(headers);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: headerMap,
      json: async () => body,
    };
  }

  describe('githubService.fetchRepositoryMetadata', () => {
    it('successfully fetches and normalizes repository metadata with caching', async () => {
      const mockRaw = {
        id: 1296269,
        owner: { login: 'octocat' },
        name: 'Hello-World',
        full_name: 'octocat/Hello-World',
        description: 'My first repo on GitHub!',
        html_url: 'https://github.com/octocat/Hello-World',
        default_branch: 'master',
        visibility: 'public',
        stargazers_count: 3500,
        forks_count: 2800,
        open_issues_count: 120,
        created_at: '2011-01-26T19:01:12Z',
        updated_at: '2026-10-20T10:00:00Z',
        pushed_at: '2026-10-25T12:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(mockRaw));

      // 1. Live call
      const liveRes = await githubService.fetchRepositoryMetadata('octocat', 'Hello-World');
      expect(liveRes.source).toBe('live');
      expect(liveRes.data.fullName).toBe('octocat/hello-world');
      expect(liveRes.data.stars).toBe(3500);
      expect(liveRes.data.githubId).toBe(1296269);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // 2. Cached call
      const cachedRes = await githubService.fetchRepositoryMetadata('octocat', 'Hello-World');
      expect(cachedRes.source).toBe('cached');
      expect(cachedRes.data.fullName).toBe('octocat/hello-world');
      expect(global.fetch).toHaveBeenCalledTimes(1); // No new network call
    });

    it('maps 404 to REPO_NOT_FOUND', async () => {
      global.fetch = vi.fn().mockResolvedValue(createMockResponse({ message: 'Not Found' }, { status: 404 }));

      await expect(
        githubService.fetchRepositoryMetadata('nonexistent-owner', 'nonexistent-repo')
      ).rejects.toMatchObject({
        code: 'REPO_NOT_FOUND',
        status: 404,
      });
    });

    it('distinguishes rate-limit 403 (with remaining: 0) from permission 403', async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(
          { message: 'API rate limit exceeded' },
          {
            status: 403,
            headers: {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(resetEpoch),
            },
          }
        )
      );

      await expect(
        githubService.fetchRepositoryMetadata('octocat', 'Hello-World')
      ).rejects.toMatchObject({
        code: 'GITHUB_RATE_LIMITED',
        status: 429,
        details: { resetAt: expect.any(String) },
      });
    });

    it('distinguishes permission 403 (when rate limit remains)', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(
          { message: 'Must have push access' },
          {
            status: 403,
            headers: {
              'x-ratelimit-remaining': '4990',
            },
          }
        )
      );

      await expect(
        githubService.fetchRepositoryMetadata('octocat', 'Private-Repo')
      ).rejects.toMatchObject({
        code: 'GITHUB_FORBIDDEN',
        status: 403,
      });
    });

    it('maps timeout to GITHUB_UNAVAILABLE', async () => {
      global.fetch = vi.fn().mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(
        githubService.fetchRepositoryMetadata('octocat', 'Hello-World')
      ).rejects.toMatchObject({
        code: 'GITHUB_UNAVAILABLE',
        status: 503,
      });
    });
  });

  describe('PR Filtering & Pagination Caps in Issues', () => {
    it('filters out items with a pull_request field from issues endpoint (SPEC Section 8 rule)', async () => {
      const mockRawIssues = [
        { id: 1, number: 101, title: 'Real issue', state: 'open', created_at: '2026-10-01T00:00:00Z' },
        {
          id: 2,
          number: 102,
          title: 'PR masked as issue',
          state: 'open',
          pull_request: { url: 'https://api.github.com/repos/o/r/pulls/102' },
        },
        { id: 3, number: 103, title: 'Another issue', state: 'closed', created_at: '2026-10-02T00:00:00Z' },
      ];

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(mockRawIssues));

      const result = await githubService.fetchIssues('octocat', 'Hello-World');
      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((i) => i.title)).toEqual(['Real issue', 'Another issue']);
      expect(result.issues.some((i) => i.number === 102)).toBe(false);
    });

    it('enforces pagination caps (max 3 pages / 300 items) and marks capped when hit', async () => {
      // Simulate 3 full pages of 100 items each
      const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i, number: i, title: `Issue ${i}` }));
      const page2 = Array.from({ length: 100 }, (_, i) => ({ id: i + 100, number: i + 100, title: `Issue ${i + 100}` }));
      const page3 = Array.from({ length: 100 }, (_, i) => ({ id: i + 200, number: i + 200, title: `Issue ${i + 200}` }));

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse(page1))
        .mockResolvedValueOnce(createMockResponse(page2))
        .mockResolvedValueOnce(createMockResponse(page3));

      const result = await githubService.fetchIssues('octocat', 'Hello-World');
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.capped).toBe(true);
      expect(result.warnings).toContain('Issues observation capped at 300 items limit');
      expect(result.issues).toHaveLength(300);
    });
  });

  describe('Empty Repository Handling (409 on Commits)', () => {
    it('handles empty repository 409 conflict by returning zero commits with warning', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ message: 'Git Repository is empty' }, { status: 409 })
      );

      const result = await githubService.fetchCommits('octocat', 'Empty-Repo');
      expect(result.commits).toEqual([]);
      expect(result.capped).toBe(false);
      expect(result.warnings).toContain('Repository is empty (Git 409: no commits)');
    });
  });

  describe('fetchAllRepositoryData & Observation Scope', () => {
    it('compiles observationScope and flags incomplete when any cap is reached', async () => {
      // Metadata mock
      const meta = { id: 1, full_name: 'octocat/Hello-World', stargazers_count: 10 };
      // Commits mock (capped at 100)
      const commits = Array.from({ length: 100 }, (_, i) => ({ sha: `sha-${i}`, commit: { message: `c-${i}` } }));
      // Issues mock (normal)
      const issues = [{ id: 1, number: 1, title: 'Bug' }];
      // Pulls mock (normal)
      const pulls = [{ id: 1, number: 2, title: 'Feature PR' }];

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse(meta))
        .mockResolvedValueOnce(createMockResponse(commits))
        .mockResolvedValueOnce(createMockResponse(issues))
        .mockResolvedValueOnce(createMockResponse(pulls));

      const allData = await githubService.fetchAllRepositoryData('octocat', 'Hello-World');
      expect(allData.scope.complete).toBe(false);
      expect(allData.scope.commits.capped).toBe(true);
      expect(allData.scope.dataWarnings).toContain(
        'Commit activity hit the 100 items cap (100+ commits observed in last 30 days)'
      );
    });
  });

  describe('GET /api/v1/repositories/search', () => {
    const token = jwt.sign({ userId: '507f1f77bcf86cd799439011', email: 'test@devflow.io' }, env.JWT_SECRET);
    const authCookie = `devflow_token=${token}`;

    it('rejects query syntax outside a single name or owner/repo with 400 INVALID_REPO_FORMAT', async () => {
      const res = await request(app)
        .get('/api/v1/repositories/search?q=invalid%20query!')
        .set('Cookie', authCookie);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_REPO_FORMAT');
    });

    it('rejects missing q parameter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/repositories/search')
        .set('Cookie', authCookie);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects result pages outside the supported GitHub search range', async () => {
      const res = await request(app)
        .get('/api/v1/repositories/search?q=react&page=11')
        .set('Cookie', authCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PAGE');
    });

    it('returns normalized repository data for valid owner/repo query', async () => {
      const mockRaw = {
        id: 1296269,
        owner: { login: 'octocat' },
        name: 'Hello-World',
        full_name: 'octocat/Hello-World',
        description: 'My first repo',
        stargazers_count: 500,
      };

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(mockRaw));

      const res = await request(app)
        .get('/api/v1/repositories/search?q=octocat/Hello-World')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.repository.fullName).toBe('octocat/hello-world');
      expect(res.body.data.source).toBe('live');
    });

    it('searches repositories by a bare owner or repository name and returns public results', async () => {
      const ownerRepo = {
        id: 11, owner: { login: 'react' }, name: 'react-native', full_name: 'react/react-native',
        html_url: 'https://github.com/react/react-native', private: false,
      };
      const nameMatch = {
        id: 12, owner: { login: 'facebook' }, name: 'react', full_name: 'facebook/react',
        html_url: 'https://github.com/facebook/react', private: false,
      };
      const privateRepo = {
        id: 13, owner: { login: 'react' }, name: 'internal', full_name: 'react/internal', private: true,
      };
      global.fetch = vi.fn((url) => {
        if (url.includes('/users/react/repos')) return Promise.resolve(createMockResponse([ownerRepo, privateRepo]));
        if (url.includes('/orgs/react/repos')) return Promise.resolve(createMockResponse({ message: 'Not Found' }, { status: 404 }));
        if (url.includes('/search/repositories')) return Promise.resolve(createMockResponse({ items: [nameMatch] }));
        throw new Error(`Unexpected GitHub URL: ${url}`);
      });

      const res = await request(app)
        .get('/api/v1/repositories/search?q=react')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.repositories.map((repository) => repository.fullName)).toEqual([
        'react/react-native',
        'facebook/react',
      ]);
      expect(res.body.data.source).toBe('live');
      expect(res.body.data.fetchedAt).toEqual(expect.any(String));
      expect(res.body.data.repositories.some((repository) => repository.fullName === 'react/internal')).toBe(false);
    });

    it('keeps up to GitHub’s full 100-result search page', async () => {
      const matches = Array.from({ length: 105 }, (_, index) => ({
        id: index + 1,
        owner: { login: 'example' },
        name: `rea-${index}`,
        full_name: `example/rea-${index}`,
        private: false,
      }));
      global.fetch = vi.fn((url) => {
        if (url.includes('/users/rea/repos')) return Promise.resolve(createMockResponse([]));
        if (url.includes('/orgs/rea/repos')) return Promise.resolve(createMockResponse({ message: 'Not Found' }, { status: 404 }));
        if (url.includes('/search/repositories')) {
          const page = Number(new URL(url).searchParams.get('page')) || 1;
          return Promise.resolve(createMockResponse({ items: matches.slice((page - 1) * 100, page * 100), total_count: matches.length }));
        }
        throw new Error(`Unexpected GitHub URL: ${url}`);
      });

      const result = await githubService.searchRepositories('rea');
      const requestUrls = global.fetch.mock.calls.map(([url]) => url);

      expect(result.repositories).toHaveLength(100);
      expect(result.totalCount).toBe(105);
      expect(result.hasMore).toBe(true);
      expect(requestUrls).toHaveLength(3);
      expect(requestUrls.every((url) => url.includes('per_page=100'))).toBe(true);

      const nextPage = await githubService.searchRepositories('rea', { page: 2 });
      expect(nextPage.repositories).toHaveLength(5);
      expect(nextPage.page).toBe(2);
      expect(nextPage.hasMore).toBe(false);
      expect(global.fetch.mock.calls).toHaveLength(4);
      expect(global.fetch.mock.calls[3][0]).toContain('page=2');
    });
  });
});
