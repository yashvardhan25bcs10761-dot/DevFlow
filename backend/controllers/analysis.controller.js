import { Repository } from '../models/Repository.js';
import { Analysis } from '../models/Analysis.js';
import { UserPreference } from '../models/UserPreference.js';
import { githubService, GitHubError } from '../services/githubService.js';
import { analyzeRepository } from '../services/analysisEngine.js';

export async function runAnalysis(req, res, next) {
  try {
    const repositoryId = req.params.id;

    // 1. Verify repository exists and belongs to the authenticated user
    const repo = await Repository.findOne({
      _id: repositoryId,
      userId: req.user.id,
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository not found or access denied.',
        },
      });
    }

    // 2. Fetch user preferences to get active analysis thresholds
    let preference = await UserPreference.findOne({ userId: req.user.id });
    const staleIssueDays = preference?.staleIssueDays ?? 14;
    const stalePullRequestDays = preference?.stalePullRequestDays ?? 7;

    // 3. Fetch fresh repository data from GitHub via githubService
    let githubData;
    try {
      githubData = await githubService.fetchAllRepositoryData(repo.ownerLogin, repo.name, {
        refresh: true,
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
      throw err;
    }

    // 4. Run deterministic analysis engine
    const analysisResult = analyzeRepository({
      repo: githubData.repo,
      commits: githubData.commits,
      issues: githubData.issues,
      pulls: githubData.pulls,
      thresholds: {
        staleIssueDays,
        stalePullRequestDays,
      },
      now: new Date(),
      scope: githubData.scope,
    });

    // 5. Store snapshot in MongoDB (Analysis collection)
    const analysis = await Analysis.create({
      userId: req.user.id,
      repositoryId: repo._id,
      analyzedAt: analysisResult.analyzedAt,
      healthScore: analysisResult.healthScore,
      scoreStatus: analysisResult.scoreStatus,
      scoreBreakdown: analysisResult.scoreBreakdown,
      repositoryMetrics: analysisResult.repositoryMetrics,
      activitySummary: analysisResult.activitySummary,
      issueSummary: analysisResult.issueSummary,
      pullRequestSummary: analysisResult.pullRequestSummary,
      staleIssues: analysisResult.staleIssues,
      stalePullRequests: analysisResult.stalePullRequests,
      recommendations: analysisResult.recommendations,
      dataWarnings: analysisResult.dataWarnings,
      thresholdsUsed: analysisResult.thresholdsUsed,
      observationScope: analysisResult.observationScope,
    });

    // 6. Update Repository with latest summary values (SPEC Section 10)
    repo.latestHealthScore = analysis.healthScore;
    repo.lastAnalyzedAt = analysis.analyzedAt;
    repo.stars = githubData.repo.stars ?? repo.stars;
    repo.forks = githubData.repo.forks ?? repo.forks;
    repo.openIssuesCount = githubData.repo.openIssuesCount ?? repo.openIssuesCount;
    await repo.save();

    res.status(201).json({
      success: true,
      data: analysis,
      message: 'Repository analyzed successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function getLatestAnalysis(req, res, next) {
  try {
    const repositoryId = req.params.id;

    // Verify repository ownership
    const repo = await Repository.findOne({
      _id: repositoryId,
      userId: req.user.id,
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository not found or access denied.',
        },
      });
    }

    // Retrieval returns stored values only, NEVER recomputes (SPEC Section 10)
    const analysis = await Analysis.findOne({
      repositoryId,
      userId: req.user.id,
    }).sort({ analyzedAt: -1 });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ANALYSIS_NOT_FOUND',
          message: 'No analysis snapshot found for this repository. Run an analysis first.',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAnalysisHistory(req, res, next) {
  try {
    const repositoryId = req.params.id;

    // Verify repository ownership
    const repo = await Repository.findOne({
      _id: repositoryId,
      userId: req.user.id,
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository not found or access denied.',
        },
      });
    }

    const page = readHistoryInteger(req.query.page, 1);
    const requestedLimit = readHistoryInteger(req.query.limit, 10);
    if (page === null || requestedLimit === null) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'page and limit must be positive whole numbers.',
        },
      });
    }
    const limit = Math.min(50, requestedLimit);
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'page is outside the supported range.' },
      });
    }

    // Retrieval returns stored values only, newest first
    const [history, total] = await Promise.all([
      Analysis.find({
        repositoryId,
        userId: req.user.id,
      })
        .sort({ analyzedAt: -1 })
        .skip(skip)
        .limit(limit),
      Analysis.countDocuments({
        repositoryId,
        userId: req.user.id,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        history,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

function readHistoryInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

export async function getAnalysisById(req, res, next) {
  try {
    const analysisId = req.params.id;

    // Owned only check (SPEC Section 10)
    const analysis = await Analysis.findOne({
      _id: analysisId,
      userId: req.user.id,
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ANALYSIS_NOT_FOUND',
          message: 'Analysis report not found or access denied.',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (err) {
    next(err);
  }
}
