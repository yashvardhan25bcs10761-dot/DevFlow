/**
 * Component Weights per SPEC Section 9:
 * Total weights sum to 1.00 (0.30 + 0.25 + 0.25 + 0.20).
 */
export const COMPONENT_WEIGHTS = {
  commits: 0.30,
  issues: 0.25,
  pullRequests: 0.25,
  resolution: 0.20,
};

export const PARTIAL_WEIGHT_THRESHOLD = 0.55;

/**
 * Pure function to calculate component scores and overall health score.
 *
 * Why missing-data policy is null instead of 0:
 * A missing metric (e.g. repo has 0 open issues) means there is no data to evaluate,
 * not that the repository is failing or broken. Assigning 0 would falsely penalize
 * clean repositories.
 *
 * Why partial score threshold is 0.55:
 * Ensures at least two significant signals (e.g. commits 0.30 + issues 0.25 = 0.55)
 * are measurable before calculating an overall score. Below 0.55, the data is too
 * sparse to represent overall repository health reliably.
 */
export function calculateHealthScore({
  commits30d, // count or null if commit fetch failed
  observedOpenIssues = 0,
  staleOpenIssues = 0,
  observedOpenPRs = 0,
  staleOpenPRs = 0,
  created30d = 0,
  closed30d = 0,
  oldestIssueUpdatedAt = null,
  windowStart = null,
} = {}) {
  const breakdown = {};

  // 1. Commit Activity (Weight: 0.30)
  // Why saturation at 20: 20 commits in 30 days represents ~1 commit per business day.
  // Above 20 commits, engineering momentum is saturated at 100%.
  if (commits30d === null || commits30d === undefined || Number.isNaN(commits30d)) {
    breakdown.commits = {
      score: null,
      weight: COMPONENT_WEIGHTS.commits,
      available: false,
      explanation: 'Commit activity data unavailable',
    };
  } else {
    const rawCommitScore = Math.min(100, Math.round((commits30d / 20) * 100));
    const score = Math.max(0, Math.min(100, rawCommitScore));
    const explanation =
      commits30d === 0
        ? 'no commits observed in 30 days'
        : `${commits30d} commit${commits30d === 1 ? '' : 's'} observed in the last 30 days`;

    breakdown.commits = {
      score,
      weight: COMPONENT_WEIGHTS.commits,
      available: true,
      explanation,
    };
  }

  // 2. Issue Management (Weight: 0.25)
  // Why null on 0 open issues: No open issues means there is no issue backlog to evaluate.
  if (!observedOpenIssues || observedOpenIssues <= 0) {
    breakdown.issues = {
      score: null,
      weight: COMPONENT_WEIGHTS.issues,
      available: false,
      explanation: 'No open issues observed to evaluate backlog freshness',
    };
  } else {
    const staleRatio = staleOpenIssues / observedOpenIssues;
    const rawIssueScore = Math.round(100 * (1 - staleRatio));
    const score = Math.max(0, Math.min(100, rawIssueScore));

    breakdown.issues = {
      score,
      weight: COMPONENT_WEIGHTS.issues,
      available: true,
      explanation: `${staleOpenIssues} of ${observedOpenIssues} observed open issues are stale`,
    };
  }

  // 3. Pull Request Management (Weight: 0.25)
  // Why null on 0 open PRs: No open pull requests means no active contribution queue to evaluate.
  if (!observedOpenPRs || observedOpenPRs <= 0) {
    breakdown.pullRequests = {
      score: null,
      weight: COMPONENT_WEIGHTS.pullRequests,
      available: false,
      explanation: 'No open pull requests observed to evaluate review velocity',
    };
  } else {
    const staleRatio = staleOpenPRs / observedOpenPRs;
    const rawPRScore = Math.round(100 * (1 - staleRatio));
    const score = Math.max(0, Math.min(100, rawPRScore));

    breakdown.pullRequests = {
      score,
      weight: COMPONENT_WEIGHTS.pullRequests,
      available: true,
      explanation: `${staleOpenPRs} of ${observedOpenPRs} observed open pull requests are stale`,
    };
  }

  // 4. Resolution Activity (Weight: 0.20)
  // Compares issue inflow vs outflow over 30 days.
  let isPartialWindow = false;
  if (oldestIssueUpdatedAt && windowStart) {
    const oldestDate = new Date(oldestIssueUpdatedAt).getTime();
    const startDate = new Date(windowStart).getTime();
    if (!Number.isNaN(oldestDate) && !Number.isNaN(startDate) && oldestDate > startDate) {
      isPartialWindow = true; // Pagination cap cut the 30d window short
    }
  }

  if (created30d === 0 && closed30d === 0) {
    breakdown.resolution = {
      score: null,
      weight: COMPONENT_WEIGHTS.resolution,
      available: false,
      explanation: 'No issue creation or resolution activity observed in 30 days',
      partialWindow: isPartialWindow,
    };
  } else if (created30d === 0 && closed30d > 0) {
    breakdown.resolution = {
      score: 100,
      weight: COMPONENT_WEIGHTS.resolution,
      available: true,
      explanation: `${closed30d} issue${closed30d === 1 ? '' : 's'} closed with 0 new issues created in 30 days`,
      partialWindow: isPartialWindow,
    };
  } else {
    const ratio = closed30d / created30d;
    const rawResScore = Math.round(100 * Math.min(1, ratio));
    const score = Math.max(0, Math.min(100, rawResScore));

    breakdown.resolution = {
      score,
      weight: COMPONENT_WEIGHTS.resolution,
      available: true,
      explanation: `${closed30d} closed vs ${created30d} opened in the last 30 days`,
      partialWindow: isPartialWindow,
    };
  }

  // Overall Score Calculation & Missing-Data Policy (SPEC Section 9)
  let availableWeight = 0;
  let weightedScoreSum = 0;
  let availableComponentsCount = 0;

  for (const comp of Object.values(breakdown)) {
    if (comp.available && comp.score !== null) {
      availableWeight += comp.weight;
      weightedScoreSum += comp.score * comp.weight;
      availableComponentsCount++;
    }
  }

  // Round availableWeight to 2 decimal places to avoid IEEE 754 precision issues
  availableWeight = Math.round(availableWeight * 100) / 100;

  let scoreStatus = 'insufficient_data';
  let healthScore = null;

  if (availableComponentsCount === 4) {
    scoreStatus = 'complete';
    healthScore = Math.max(0, Math.min(100, Math.round(weightedScoreSum / availableWeight)));
  } else if (availableWeight >= PARTIAL_WEIGHT_THRESHOLD) {
    scoreStatus = 'partial';
    healthScore = Math.max(0, Math.min(100, Math.round(weightedScoreSum / availableWeight)));
  } else {
    scoreStatus = 'insufficient_data';
    healthScore = null;
  }

  return {
    healthScore,
    scoreStatus,
    availableWeight,
    breakdown,
  };
}
