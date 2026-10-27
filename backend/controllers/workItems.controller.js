import { Repository } from '../models/Repository.js';
import { UserPreference } from '../models/UserPreference.js';
import { githubService, GitHubError } from '../services/githubService.js';
import { detectStaleItem } from '../services/analysisEngine.js';

const DEFAULT_THRESHOLDS = { issues: 14, pullRequests: 7 };
const MAX_PAGE_SIZE = 100;
const MS_PER_DAY = 86_400_000;

function readInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function invalidQuery(res, message) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message },
  });
}

function inactivityDays(updatedAt, now) {
  if (!updatedAt) return null;
  const timestamp = new Date(updatedAt).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / MS_PER_DAY));
}

function addStaleMetadata(items, thresholdDays, now) {
  const warnings = [];
  const rows = items.map((item) => {
    const staleCheck = detectStaleItem(item, thresholdDays, now);
    if (staleCheck.warning) warnings.push(staleCheck.warning);
    return {
      ...item,
      inactivityDays: inactivityDays(item.updatedAt, now),
      isStale: item.state === 'open' && !staleCheck.warning && staleCheck.isStale,
    };
  });
  return { rows, warnings: [...new Set(warnings)] };
}

function filterItems(items, { state, stale, label, search }) {
  const normalizedLabel = label.toLocaleLowerCase();
  const normalizedSearch = search.toLocaleLowerCase();
  return items.filter((item) => {
    if (state !== 'all' && item.state !== state) return false;
    if (stale !== 'all' && item.isStale !== (stale === 'true')) return false;
    if (normalizedLabel && !item.labels?.some((value) => value.toLocaleLowerCase() === normalizedLabel)) return false;
    if (normalizedSearch) {
      const haystack = `${item.number ?? ''} ${item.title ?? ''} ${item.author ?? ''}`.toLocaleLowerCase();
      if (!haystack.includes(normalizedSearch)) return false;
    }
    return true;
  });
}

function pageItems(items, page, limit) {
  const pages = Math.ceil(items.length / limit);
  const safePage = Math.min(page, Math.max(1, pages));
  return {
    items: items.slice((safePage - 1) * limit, safePage * limit),
    pagination: { page: safePage, limit, total: items.length, pages: Math.max(1, pages) },
  };
}

function sendGitHubError(res, error) {
  if (!(error instanceof GitHubError)) return false;
  res.status(error.status).json({
    success: false,
    error: { code: error.code, message: error.message, details: error.details },
  });
  return true;
}

async function repositoryForRequest(req, res) {
  const repository = await Repository.findOne({ _id: req.params.id, userId: req.user.id });
  if (!repository) {
    res.status(404).json({
      success: false,
      error: { code: 'REPOSITORY_NOT_FOUND', message: 'Repository not found or access denied.' },
    });
    return null;
  }
  return repository;
}

async function getOptions(req, res, kind) {
  const state = req.query.state === undefined ? 'open' : String(req.query.state);
  const allowedStates = kind === 'issues' ? ['all', 'open', 'closed'] : ['all', 'open', 'closed'];
  if (!allowedStates.includes(state)) {
    invalidQuery(res, `state must be one of: ${allowedStates.join(', ')}.`);
    return null;
  }
  const stale = req.query.stale === undefined ? 'all' : String(req.query.stale);
  if (!['all', 'true', 'false'].includes(stale)) {
    invalidQuery(res, 'stale must be all, true, or false.');
    return null;
  }
  const page = readInteger(req.query.page, 1);
  const limit = readInteger(req.query.limit, 25, { max: MAX_PAGE_SIZE });
  const queryThreshold = readInteger(req.query.threshold, null, { min: 1, max: 365 });
  if (page === null || limit === null || (req.query.threshold !== undefined && queryThreshold === null)) {
    invalidQuery(res, 'page, limit, or threshold is outside its valid range.');
    return null;
  }
  let thresholdDays = queryThreshold;
  if (thresholdDays === null) {
    const preferences = await UserPreference.findOne({ userId: req.user.id });
    thresholdDays = kind === 'issues'
      ? preferences?.staleIssueDays ?? DEFAULT_THRESHOLDS.issues
      : preferences?.stalePullRequestDays ?? DEFAULT_THRESHOLDS.pullRequests;
  }
  return {
    state,
    stale,
    page,
    limit,
    thresholdDays,
    label: req.query.label ? String(req.query.label).trim() : '',
    search: req.query.search ? String(req.query.search).trim() : '',
  };
}

async function listWorkItems(req, res, next, kind) {
  try {
    const options = await getOptions(req, res, kind);
    if (!options) return;
    const repository = await repositoryForRequest(req, res);
    if (!repository) return;

    const result = kind === 'issues'
      ? await githubService.fetchIssues(repository.ownerLogin, repository.name)
      : await githubService.fetchPullRequests(repository.ownerLogin, repository.name);
    const sourceItems = kind === 'issues' ? result.issues : result.pullRequests;
    const now = new Date();
    const enriched = addStaleMetadata(sourceItems, options.thresholdDays, now);
    const availableLabels = [...new Set(sourceItems.flatMap((item) => item.labels || []))]
      .sort((a, b) => a.localeCompare(b));
    const filtered = filterItems(enriched.rows, options);
    const page = pageItems(filtered, options.page, options.limit);
    const dataWarnings = [...(result.warnings || []), ...enriched.warnings];

    res.status(200).json({
      success: true,
      data: {
        [kind]: page.items,
        pagination: page.pagination,
        source: result.source || 'unavailable',
        fetchedAt: result.fetchedAt || null,
        thresholdDays: options.thresholdDays,
        availableLabels,
        dataWarnings,
        observationScope: {
          complete: !result.capped,
          fetched: sourceItems.length,
          capped: Boolean(result.capped),
          warnings: result.warnings || [],
          stateScope: kind === 'pullRequests' ? 'open-only' : 'all-states',
        },
      },
    });
  } catch (error) {
    if (sendGitHubError(res, error)) return;
    next(error);
  }
}

export function listRepositoryIssues(req, res, next) {
  return listWorkItems(req, res, next, 'issues');
}

export function listRepositoryPullRequests(req, res, next) {
  return listWorkItems(req, res, next, 'pullRequests');
}
