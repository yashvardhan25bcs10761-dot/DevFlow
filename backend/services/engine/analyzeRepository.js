import { detectStaleItem } from './staleDetection.js';
import { calculateHealthScore } from './healthScore.js';
import { generateRecommendations } from './recommendations.js';

const MS_PER_DAY = 86_400_000;

/**
 * Pure orchestration engine for repository health analysis.
 *
 * Rules:
 * - Deterministic, pure function (takes `now` parameter).
 * - Caps stale issues list to max 50 items.
 * - Caps stale PRs list to max 50 items.
 * - Caps recommendations to max 20 items.
 * - Collects and never silences warnings or missing data.
 */
export function analyzeRepository({
  repo = {},
  commits = [],
  issues = [],
  pulls = [],
  thresholds = {},
  now = new Date(),
  scope = {},
} = {}) {
  const currentNow = now instanceof Date ? now : new Date(now);
  const staleIssueDays = thresholds.staleIssueDays || 14;
  const stalePullRequestDays = thresholds.stalePullRequestDays || 7;
  const windowStart = new Date(currentNow.getTime() - 30 * MS_PER_DAY);

  const warnings = [...(scope.dataWarnings || [])];

  // 1. Process Commits
  const commitList = Array.isArray(commits) ? commits : [];
  const commits30d = commitList.length;
  const uniqueAuthors = new Set(
    commitList.map((c) => c.author).filter((author) => author && author !== 'Unknown')
  );

  // 2. Process Issues (Drop PRs if any slipped through)
  const pureIssues = (Array.isArray(issues) ? issues : []).filter((item) => !item.pull_request);
  const openIssues = [];
  const closedIssues = [];
  const staleIssues = [];
  let created30d = 0;
  let closed30d = 0;
  let oldestIssueUpdatedAt = null;

  for (const issue of pureIssues) {
    if (issue.updatedAt) {
      if (!oldestIssueUpdatedAt || new Date(issue.updatedAt) < new Date(oldestIssueUpdatedAt)) {
        oldestIssueUpdatedAt = issue.updatedAt;
      }
    }

    // Resolution window metrics (30 days)
    if (issue.createdAt) {
      const createdDate = new Date(issue.createdAt);
      if (createdDate >= windowStart && createdDate <= currentNow) {
        created30d++;
      }
    }

    if (issue.state === 'closed') {
      closedIssues.push(issue);
      if (issue.closedAt) {
        const closedDate = new Date(issue.closedAt);
        if (closedDate >= windowStart && closedDate <= currentNow) {
          closed30d++;
        }
      }
    } else {
      openIssues.push(issue);
      const staleCheck = detectStaleItem(issue, staleIssueDays, currentNow);
      if (staleCheck.warning) {
        warnings.push(staleCheck.warning);
      }
      if (staleCheck.isStale) {
        staleIssues.push({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          updatedAt: issue.updatedAt,
          inactivityDays: staleCheck.inactivityDays,
          author: issue.author,
          htmlUrl: issue.htmlUrl,
        });
      }
    }
  }

  // 3. Process Pull Requests
  const pullList = Array.isArray(pulls) ? pulls : [];
  const openPulls = [];
  const stalePulls = [];
  let draftCount = 0;

  for (const pr of pullList) {
    if (pr.isDraft) {
      draftCount++;
    }

    if (pr.state === 'open' || !pr.state) {
      openPulls.push(pr);
      const staleCheck = detectStaleItem(pr, stalePullRequestDays, currentNow);
      if (staleCheck.warning) {
        warnings.push(staleCheck.warning);
      }
      if (staleCheck.isStale) {
        stalePulls.push({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          updatedAt: pr.updatedAt,
          inactivityDays: staleCheck.inactivityDays,
          isDraft: Boolean(pr.isDraft),
          author: pr.author,
          htmlUrl: pr.htmlUrl,
        });
      }
    }
  }

  // Sort stale items by inactivity descending
  staleIssues.sort((a, b) => b.inactivityDays - a.inactivityDays);
  stalePulls.sort((a, b) => b.inactivityDays - a.inactivityDays);

  // 4. Calculate Health Score
  const scoreResult = calculateHealthScore({
    commits30d,
    observedOpenIssues: openIssues.length,
    staleOpenIssues: staleIssues.length,
    observedOpenPRs: openPulls.length,
    staleOpenPRs: stalePulls.length,
    created30d,
    closed30d,
    oldestIssueUpdatedAt,
    windowStart: windowStart.toISOString(),
  });

  // 5. Generate Recommendations
  const allRecommendations = generateRecommendations({
    staleOpenIssues: staleIssues.length,
    observedOpenIssues: openIssues.length,
    staleOpenPRs: stalePulls.length,
    observedOpenPRs: openPulls.length,
    commits30d,
    created30d,
    closed30d,
    scoreStatus: scoreResult.scoreStatus,
    scope,
    dataWarnings: warnings,
    repo,
  });

  // Caps per SPEC Section 7: stale items max 50, recommendations max 20
  const cappedStaleIssues = staleIssues.slice(0, 50);
  const cappedStalePulls = stalePulls.slice(0, 50);
  const cappedRecommendations = allRecommendations.slice(0, 20);

  return {
    healthScore: scoreResult.healthScore,
    scoreStatus: scoreResult.scoreStatus,
    scoreBreakdown: scoreResult.breakdown,
    repositoryMetrics: {
      stars: repo.stars ?? 0,
      forks: repo.forks ?? 0,
      openIssuesCount: repo.openIssuesCount ?? 0,
    },
    activitySummary: {
      commits30d,
      activeAuthorsCount: uniqueAuthors.size,
    },
    issueSummary: {
      totalObserved: pureIssues.length,
      observedOpenIssues: openIssues.length,
      observedClosedIssues: closedIssues.length,
      staleOpenIssues: staleIssues.length,
    },
    pullRequestSummary: {
      totalObserved: pullList.length,
      observedOpenPRs: openPulls.length,
      staleOpenPRs: stalePulls.length,
      draftPRs: draftCount,
    },
    staleIssues: cappedStaleIssues,
    stalePullRequests: cappedStalePulls,
    recommendations: cappedRecommendations,
    dataWarnings: Array.from(new Set(warnings)),
    thresholdsUsed: {
      issueDays: staleIssueDays,
      prDays: stalePullRequestDays,
    },
    observationScope: scope,
    analyzedAt: currentNow.toISOString(),
  };
}
