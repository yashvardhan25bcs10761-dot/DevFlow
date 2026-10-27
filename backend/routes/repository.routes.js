import express from 'express';
import {
  listRepositories,
  saveRepository,
  getRepository,
  deleteRepository,
  refreshRepository,
} from '../controllers/repository.controller.js';
import { repositoryAnalysisRouter } from './analysis.routes.js';
import { listRepositoryIssues, listRepositoryPullRequests } from '../controllers/workItems.controller.js';
import { githubService, GitHubError } from '../services/githubService.js';
import { authenticate } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

const REPO_FORMAT_REGEX = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SEARCH_TERM_REGEX = /^[A-Za-z0-9_.-]+$/;

// All repository routes require authentication
router.use(authenticate);

// GET /api/v1/repositories/search?q=owner/repo|owner|repo-name
router.get('/search', async (req, res, next) => {
  try {
    const query = req.query.q ? String(req.query.q).trim() : '';

    if (!query) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter "q" is required.',
        },
      });
    }

    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1 || page > 10) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAGE',
          message: 'Search page must be a whole number from 1 to 10.',
        },
      });
    }

    if (query.length > 100 || (query.includes('/') ? !REPO_FORMAT_REGEX.test(query) : !SEARCH_TERM_REGEX.test(query))) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REPO_FORMAT',
          message: 'Search for a repository using a single owner or repository name, or use "owner/repo".',
        },
      });
    }

    const refresh = req.query.refresh === 'true';

    if (!query.includes('/')) {
      const result = await githubService.searchRepositories(query, { refresh, page });
      return res.status(200).json({
        success: true,
        data: {
          repositories: result.repositories,
          source: result.source,
          fetchedAt: result.fetchedAt,
          page: result.page,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
        },
      });
    }

    if (page !== 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAGE',
          message: 'Exact owner/repository lookups do not support additional result pages.',
        },
      });
    }

    const [owner, repo] = query.split('/');
    const result = await githubService.fetchRepositoryMetadata(owner, repo, { refresh });

    res.status(200).json({
      success: true,
      data: {
        repository: result.data,
        source: result.source,
        fetchedAt: result.fetchedAt,
      },
    });
  } catch (err) {
    if (err instanceof GitHubError) {
      return res.status(err.status).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }
    next(err);
  }
});

// GET /api/v1/repositories (list own repos)
router.get('/', listRepositories);

// POST /api/v1/repositories (save repo)
router.post('/', saveRepository);

// GET /api/v1/repositories/:id (get repo by id, owned only)
router.get('/:id', validateObjectId('id'), getRepository);

// DELETE /api/v1/repositories/:id (delete repo by id, owned only)
router.delete('/:id', validateObjectId('id'), deleteRepository);

// POST /api/v1/repositories/:id/refresh (refresh repo metadata)
router.post('/:id/refresh', validateObjectId('id'), refreshRepository);

// Current GitHub data, bounded by githubService and filtered before pagination.
router.get('/:id/issues', validateObjectId('id'), listRepositoryIssues);
router.get('/:id/pull-requests', validateObjectId('id'), listRepositoryPullRequests);

// Analysis sub-routes under /:id (analyze, latest-analysis, analysis-history)
router.use('/:id', repositoryAnalysisRouter);

export default router;
