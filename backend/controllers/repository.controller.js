import { Repository } from '../models/Repository.js';
import { Analysis } from '../models/Analysis.js';
import { githubService, GitHubError } from '../services/githubService.js';

const REPO_FORMAT_REGEX = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function listRepositories(req, res, next) {
  try {
    // Only return repositories owned by the authenticated user
    const repositories = await Repository.find({ userId: req.user.id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: repositories,
    });
  } catch (err) {
    next(err);
  }
}

export async function saveRepository(req, res, next) {
  try {
    const rawFullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';

    if (!rawFullName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Repository "fullName" is required (format: owner/repo).',
        },
      });
    }

    if (!REPO_FORMAT_REGEX.test(rawFullName)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REPO_FORMAT',
          message: 'Invalid repository format. Please provide "owner/repo".',
        },
      });
    }

    const normalizedFullName = rawFullName.toLowerCase();
    const [owner, repoName] = rawFullName.split('/');

    // Check for duplicate repository for this user (SPEC Section 7 deduplication)
    const existing = await Repository.findOne({
      userId: req.user.id,
      fullName: normalizedFullName,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_REPOSITORY',
          message: `Repository "${normalizedFullName}" is already saved in your dashboard.`,
        },
      });
    }

    // Backend fetches metadata itself (do NOT trust client-sent stats per SPEC Section 10)
    let metaResult;
    try {
      metaResult = await githubService.fetchRepositoryMetadata(owner, repoName, { refresh: true });
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
      throw err;
    }

    const meta = metaResult.data;

    // Create repository document
    try {
      const repository = await Repository.create({
        userId: req.user.id,
        githubId: meta.githubId,
        fullName: meta.fullName,
        ownerLogin: meta.ownerLogin,
        name: meta.name,
        description: meta.description,
        htmlUrl: meta.htmlUrl,
        defaultBranch: meta.defaultBranch,
        visibility: meta.visibility,
        stars: meta.stars,
        forks: meta.forks,
        openIssuesCount: meta.openIssuesCount,
        githubCreatedAt: meta.githubCreatedAt,
        githubUpdatedAt: meta.githubUpdatedAt,
        githubPushedAt: meta.githubPushedAt,
      });

      res.status(201).json({
        success: true,
        data: repository,
        message: 'Repository saved successfully',
      });
    } catch (createErr) {
      // Catch race-condition compound index violation (E11000)
      if (createErr.code === 11000) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_REPOSITORY',
            message: `Repository "${normalizedFullName}" is already saved.`,
          },
        });
      }
      throw createErr;
    }
  } catch (err) {
    next(err);
  }
}

export async function getRepository(req, res, next) {
  try {
    const repository = await Repository.findOne({
      _id: req.params.id,
      userId: req.user.id, // Ownership check
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository not found or access denied.',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: repository,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteRepository(req, res, next) {
  try {
    const repository = await Repository.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id, // Ownership check
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository not found or access denied.',
        },
      });
    }

    // Cascade delete all analysis snapshots for this repo (Phase 6)
    await Analysis.deleteMany({ repositoryId: req.params.id, userId: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Repository removed successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshRepository(req, res, next) {
  try {
    const repository = await Repository.findOne({
      _id: req.params.id,
      userId: req.user.id, // Ownership check
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository not found or access denied.',
        },
      });
    }

    // Refresh metadata from GitHub
    let metaResult;
    try {
      metaResult = await githubService.fetchRepositoryMetadata(
        repository.ownerLogin,
        repository.name,
        { refresh: true }
      );
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
      throw err;
    }

    const meta = metaResult.data;

    repository.stars = meta.stars;
    repository.forks = meta.forks;
    repository.description = meta.description;
    repository.openIssuesCount = meta.openIssuesCount;
    repository.defaultBranch = meta.defaultBranch;
    repository.githubUpdatedAt = meta.githubUpdatedAt;
    repository.githubPushedAt = meta.githubPushedAt;

    await repository.save();

    res.status(200).json({
      success: true,
      data: repository,
      message: 'Repository metadata refreshed successfully',
    });
  } catch (err) {
    next(err);
  }
}
