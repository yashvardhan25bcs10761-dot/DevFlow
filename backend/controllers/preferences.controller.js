import { UserPreference } from '../models/UserPreference.js';
import { Repository } from '../models/Repository.js';

export async function getPreferences(req, res, next) {
  try {
    let preferences = await UserPreference.findOne({ userId: req.user.id });

    // Lazily create defaults if not existing yet (SPEC Section 7)
    if (!preferences) {
      preferences = await UserPreference.create({
        userId: req.user.id,
        staleIssueDays: 14,
        stalePullRequestDays: 7,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId: preferences.userId,
        staleIssueDays: preferences.staleIssueDays,
        stalePullRequestDays: preferences.stalePullRequestDays,
        defaultRepositoryId: preferences.defaultRepositoryId,
        createdAt: preferences.createdAt,
        updatedAt: preferences.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePreferences(req, res, next) {
  try {
    const { staleIssueDays, stalePullRequestDays, defaultRepositoryId } = req.validatedBody;

    if (defaultRepositoryId) {
      const ownedRepository = await Repository.findOne({ _id: defaultRepositoryId, userId: req.user.id }).select('_id');
      if (!ownedRepository) {
        return res.status(404).json({
          success: false,
          error: { code: 'REPOSITORY_NOT_FOUND', message: 'Default repository not found or access denied.' },
        });
      }
    }

    let preferences = await UserPreference.findOne({ userId: req.user.id });
    if (!preferences) {
      preferences = new UserPreference({
        userId: req.user.id,
        staleIssueDays: staleIssueDays ?? 14,
        stalePullRequestDays: stalePullRequestDays ?? 7,
        defaultRepositoryId: defaultRepositoryId ?? null,
      });
    } else {
      if (staleIssueDays !== undefined) {
        preferences.staleIssueDays = staleIssueDays;
      }
      if (stalePullRequestDays !== undefined) {
        preferences.stalePullRequestDays = stalePullRequestDays;
      }
      if (defaultRepositoryId !== undefined) {
        preferences.defaultRepositoryId = defaultRepositoryId;
      }
    }

    await preferences.save();

    res.status(200).json({
      success: true,
      data: {
        userId: preferences.userId,
        staleIssueDays: preferences.staleIssueDays,
        stalePullRequestDays: preferences.stalePullRequestDays,
        defaultRepositoryId: preferences.defaultRepositoryId,
        createdAt: preferences.createdAt,
        updatedAt: preferences.updatedAt,
      },
      message: 'Preferences updated successfully',
    });
  } catch (error) {
    next(error);
  }
}
