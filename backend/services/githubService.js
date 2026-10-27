import { env } from '../config/env.js';
import { GITHUB_CONFIG } from '../config/github.config.js';
import { githubCache } from './cacheService.js';
import {
  normalizeRepository,
  normalizeCommit,
  normalizeIssue,
  normalizePullRequest,
} from './githubNormalizer.js';

export class GitHubError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function handleRateLimitOrForbidden(response) {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const resetEpoch = response.headers.get('x-ratelimit-reset');
  const retryAfter = response.headers.get('retry-after');

  // Rate limit triggers when remaining is '0' or status is 429
  if (remaining === '0' || response.status === 429) {
    let resetDate = null;
    if (resetEpoch) {
      resetDate = new Date(parseInt(resetEpoch, 10) * 1000).toISOString();
    } else if (retryAfter) {
      resetDate = new Date(Date.now() + parseInt(retryAfter, 10) * 1000).toISOString();
    }

    const message = resetDate
      ? `GitHub API rate limit exceeded. Resets at ${resetDate}.`
      : 'GitHub API rate limit exceeded.';

    throw new GitHubError('GITHUB_RATE_LIMITED', message, 429, { resetAt: resetDate });
  }

  // 403 without rate limit headers indicates a permission denial
  throw new GitHubError(
    'GITHUB_FORBIDDEN',
    'Access forbidden by GitHub. Please verify repository visibility and permissions.',
    403
  );
}

async function fetchFromGitHub(endpoint, options = {}, retries = GITHUB_CONFIG.MAX_RETRIES) {
  const url = `${GITHUB_CONFIG.BASE_URL}${endpoint}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DevFlow-App',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
  };

  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_CONFIG.TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Handle specific HTTP status codes
      if (response.status === 403 || response.status === 429) {
        handleRateLimitOrForbidden(response);
      }

      if (response.status === 404) {
        throw new GitHubError('REPO_NOT_FOUND', 'Repository not found on GitHub.', 404);
      }

      if (response.status === 401) {
        throw new GitHubError(
          'GITHUB_AUTH_FAILED',
          'GitHub API token is invalid or expired.',
          502
        );
      }

      if (response.status === 422) {
        throw new GitHubError('GITHUB_VALIDATION_ERROR', 'GitHub validation error.', 422);
      }

      // Empty repo 409 on commits
      if (response.status === 409) {
        return { status: 409, emptyRepo: true };
      }

      // Retry 5xx server errors
      if (response.status >= 500) {
        if (attempt < retries) {
          attempt++;
          await delay(GITHUB_CONFIG.INITIAL_RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new GitHubError('GITHUB_ERROR', `GitHub API error (HTTP ${response.status})`, response.status);
      }

      if (!response.ok) {
        throw new GitHubError('GITHUB_ERROR', `GitHub returned unexpected status ${response.status}`, response.status);
      }

      const data = await response.json();
      return { status: response.status, data, headers: response.headers };
    } catch (err) {
      clearTimeout(timeoutId);

      // Do NOT retry deterministic GitHub errors (404, 401, 403, 429, 422)
      if (err instanceof GitHubError) {
        throw err;
      }

      // Handle timeout
      if (err.name === 'AbortError') {
        if (attempt < retries) {
          attempt++;
          await delay(GITHUB_CONFIG.INITIAL_RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new GitHubError('GITHUB_UNAVAILABLE', 'GitHub API request timed out after 10s.', 503);
      }

      // Network / connection error
      if (attempt < retries) {
        attempt++;
        await delay(GITHUB_CONFIG.INITIAL_RETRY_DELAY_MS * attempt);
        continue;
      }

      throw new GitHubError('GITHUB_UNAVAILABLE', `GitHub API network failure: ${err.message}`, 503);
    }
  }
}

export class GitHubService {
  async fetchRepositoryMetadata(owner, repo, { refresh = false } = {}) {
    const cacheKey = `github:metadata:${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (!refresh) {
      const cached = githubCache.get(cacheKey);
      if (cached) {
        return { data: cached.data, source: 'cached', fetchedAt: cached.fetchedAt };
      }
    }

    const res = await fetchFromGitHub(`/repos/${owner}/${repo}`);
    const normalized = normalizeRepository(res.data);
    const fetchedAt = new Date().toISOString();

    githubCache.set(cacheKey, normalized, fetchedAt);
    return { data: normalized, source: 'live', fetchedAt };
  }

  async searchRepositories(query, { refresh = false, page = 1 } = {}) {
    const cacheKey = `github:search:v2:${query.toLowerCase()}:${page}`;
    if (!refresh) {
      const cached = githubCache.get(cacheKey);
      if (cached) return { ...cached.data, source: 'cached', fetchedAt: cached.fetchedAt };
    }

    const safeOwner = encodeURIComponent(query);
    const lookups = await Promise.allSettled([
      page === 1
        ? fetchFromGitHub(`/users/${safeOwner}/repos?type=owner&sort=updated&per_page=100`)
        : Promise.resolve({ data: [] }),
      page === 1
        ? fetchFromGitHub(`/orgs/${safeOwner}/repos?type=public&sort=updated&per_page=100`)
        : Promise.resolve({ data: [] }),
      fetchFromGitHub(`/search/repositories?q=${encodeURIComponent(`${query} in:name`)}&sort=stars&order=desc&per_page=100&page=${page}`),
    ]);

    const unexpectedFailure = lookups.find((result) => (
      result.status === 'rejected' && result.reason?.status !== 404
    ));
    if (unexpectedFailure) throw unexpectedFailure.reason;

    const userRepos = lookups[0].status === 'fulfilled' && Array.isArray(lookups[0].value.data)
      ? lookups[0].value.data
      : [];
    const organizationRepos = lookups[1].status === 'fulfilled' && Array.isArray(lookups[1].value.data)
      ? lookups[1].value.data
      : [];
    const nameMatches = lookups[2].status === 'fulfilled' && Array.isArray(lookups[2].value.data?.items)
      ? lookups[2].value.data.items
      : [];
    const uniqueRepos = new Map();
    [...userRepos, ...organizationRepos, ...nameMatches]
      .filter((repository) => repository.private !== true)
      .forEach((repository) => {
      const normalized = normalizeRepository(repository);
      if (normalized?.githubId != null) uniqueRepos.set(normalized.githubId, normalized);
    });

    // GitHub allows up to 100 results per page; keeping the whole page avoids dropping matches locally.
    const repositories = [...uniqueRepos.values()].slice(0, 100);
    const reportedTotal = lookups[2].status === 'fulfilled'
      ? Number(lookups[2].value.data?.total_count) || 0
      : 0;
    const totalCount = Math.max(reportedTotal, repositories.length);
    const hasMore = page < Math.min(10, Math.ceil(totalCount / 100));
    const fetchedAt = new Date().toISOString();
    const result = { repositories, source: 'live', fetchedAt, page, totalCount, hasMore };
    githubCache.set(cacheKey, result, fetchedAt);
    return result;
  }

  async fetchCommits(owner, repo, { refresh = false, since = null } = {}) {
    const sinceDate =
      since ||
      new Date(Date.now() - GITHUB_CONFIG.BOUNDS.COMMITS.DAYS_WINDOW * 86400000).toISOString();
    const cacheKey = `github:commits:${owner.toLowerCase()}/${repo.toLowerCase()}:${sinceDate}`;

    if (!refresh) {
      const cached = githubCache.get(cacheKey);
      if (cached) {
        return { ...cached.data, source: 'cached', fetchedAt: cached.fetchedAt };
      }
    }

    const endpoint = `/repos/${owner}/${repo}/commits?since=${encodeURIComponent(
      sinceDate
    )}&per_page=${GITHUB_CONFIG.BOUNDS.COMMITS.PER_PAGE}`;

    const res = await fetchFromGitHub(endpoint);

    // Empty repo 409 handling per SPEC Section 8
    if (res.emptyRepo || res.status === 409) {
      const emptyResult = {
        commits: [],
        capped: false,
        warnings: ['Repository is empty (Git 409: no commits)'],
      };
      const fetchedAt = new Date().toISOString();
      githubCache.set(cacheKey, emptyResult, fetchedAt);
      return { ...emptyResult, source: 'live', fetchedAt };
    }

    const rawCommits = Array.isArray(res.data) ? res.data : [];
    const capped = rawCommits.length >= GITHUB_CONFIG.BOUNDS.COMMITS.PER_PAGE;
    const warnings = [];

    if (capped) {
      warnings.push('Commit activity hit the 100 items cap (100+ commits observed in last 30 days)');
    }

    const normalized = rawCommits.map(normalizeCommit);
    const result = {
      commits: normalized,
      capped,
      warnings,
    };
    const fetchedAt = new Date().toISOString();

    githubCache.set(cacheKey, result, fetchedAt);
    return { ...result, source: 'live', fetchedAt };
  }

  async fetchIssues(owner, repo, { refresh = false } = {}) {
    const cacheKey = `github:issues:${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (!refresh) {
      const cached = githubCache.get(cacheKey);
      if (cached) {
        return { ...cached.data, source: 'cached', fetchedAt: cached.fetchedAt };
      }
    }

    const maxPages = GITHUB_CONFIG.BOUNDS.ISSUES.MAX_PAGES; // max 3 pages
    const perPage = GITHUB_CONFIG.BOUNDS.ISSUES.PER_PAGE; // 100 items
    const rawItems = [];
    let capped = false;

    for (let page = 1; page <= maxPages; page++) {
      const endpoint = `/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&per_page=${perPage}&page=${page}`;
      const res = await fetchFromGitHub(endpoint);
      const items = Array.isArray(res.data) ? res.data : [];

      rawItems.push(...items);

      if (items.length < perPage) {
        break; // Reached end of issues
      }
      if (page === maxPages && items.length === perPage) {
        capped = true;
      }
    }

    // Drop any item with a pull_request field (SPEC Section 8 rule)
    const pureIssues = rawItems.filter((item) => !item.pull_request);
    const normalized = pureIssues.map(normalizeIssue);
    const warnings = [];

    if (capped) {
      warnings.push('Issues observation capped at 300 items limit');
    }

    const result = {
      issues: normalized,
      capped,
      warnings,
      rawCount: rawItems.length,
    };
    const fetchedAt = new Date().toISOString();

    githubCache.set(cacheKey, result, fetchedAt);
    return { ...result, source: 'live', fetchedAt };
  }

  async fetchPullRequests(owner, repo, { refresh = false } = {}) {
    const cacheKey = `github:pulls:${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (!refresh) {
      const cached = githubCache.get(cacheKey);
      if (cached) {
        return { ...cached.data, source: 'cached', fetchedAt: cached.fetchedAt };
      }
    }

    const maxPages = GITHUB_CONFIG.BOUNDS.PULLS.MAX_PAGES; // max 2 pages
    const perPage = GITHUB_CONFIG.BOUNDS.PULLS.PER_PAGE; // 100 items
    const rawItems = [];
    let capped = false;

    for (let page = 1; page <= maxPages; page++) {
      const endpoint = `/repos/${owner}/${repo}/pulls?state=open&per_page=${perPage}&page=${page}`;
      const res = await fetchFromGitHub(endpoint);
      const items = Array.isArray(res.data) ? res.data : [];

      rawItems.push(...items);

      if (items.length < perPage) {
        break;
      }
      if (page === maxPages && items.length === perPage) {
        capped = true;
      }
    }

    const normalized = rawItems.map(normalizePullRequest);
    const warnings = [];

    if (capped) {
      warnings.push('Pull requests observation capped at 200 items limit');
    }

    const result = {
      pullRequests: normalized,
      capped,
      warnings,
    };
    const fetchedAt = new Date().toISOString();

    githubCache.set(cacheKey, result, fetchedAt);
    return { ...result, source: 'live', fetchedAt };
  }

  async fetchAllRepositoryData(owner, repo, { refresh = false } = {}) {
    const [metadataRes, commitsRes, issuesRes, pullsRes] = await Promise.all([
      this.fetchRepositoryMetadata(owner, repo, { refresh }),
      this.fetchCommits(owner, repo, { refresh }),
      this.fetchIssues(owner, repo, { refresh }),
      this.fetchPullRequests(owner, repo, { refresh }),
    ]);

    const warnings = [
      ...commitsRes.warnings,
      ...issuesRes.warnings,
      ...pullsRes.warnings,
    ];

    const isComplete = !commitsRes.capped && !issuesRes.capped && !pullsRes.capped;

    const observationScope = {
      complete: isComplete,
      dataWarnings: warnings,
      commits: {
        fetched: commitsRes.commits.length,
        cap: GITHUB_CONFIG.BOUNDS.COMMITS.PER_PAGE,
        capped: commitsRes.capped,
      },
      issues: {
        fetched: issuesRes.issues.length,
        cap: GITHUB_CONFIG.BOUNDS.ISSUES.MAX_PAGES * GITHUB_CONFIG.BOUNDS.ISSUES.PER_PAGE,
        capped: issuesRes.capped,
      },
      pullRequests: {
        fetched: pullsRes.pullRequests.length,
        cap: GITHUB_CONFIG.BOUNDS.PULLS.MAX_PAGES * GITHUB_CONFIG.BOUNDS.PULLS.PER_PAGE,
        capped: pullsRes.capped,
      },
    };

    return {
      repo: metadataRes.data,
      commits: commitsRes.commits,
      issues: issuesRes.issues,
      pulls: pullsRes.pullRequests,
      scope: observationScope,
      source:
        metadataRes.source === 'cached' &&
        commitsRes.source === 'cached' &&
        issuesRes.source === 'cached' &&
        pullsRes.source === 'cached'
          ? 'cached'
          : 'live',
      fetchedAt: metadataRes.fetchedAt,
    };
  }
}

export const githubService = new GitHubService();
