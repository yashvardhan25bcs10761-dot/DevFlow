const SEVERITY_ORDER = {
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Pure function to generate explainable, rule-based recommendations.
 *
 * Requirements:
 * - Deterministic, rule-based triggers
 * - Concrete evidence with real measured numbers
 * - Deduplicated (max one recommendation per rule)
 * - Sorted by severity (high -> medium -> low -> info), then by rule id
 */
export function generateRecommendations({
  staleOpenIssues = 0,
  observedOpenIssues = 0,
  staleOpenPRs = 0,
  observedOpenPRs = 0,
  commits30d = null,
  created30d = 0,
  closed30d = 0,
  scoreStatus = 'complete',
  scope = {},
  dataWarnings = [],
  repo = {},
} = {}) {
  const recommendations = [];

  // R1: stale-issues (Trigger: staleOpenIssues >= 1)
  if (staleOpenIssues >= 1 && observedOpenIssues > 0) {
    const ratio = staleOpenIssues / observedOpenIssues;
    const isHigh = ratio >= 0.5;
    const percentage = Math.round(ratio * 100);

    recommendations.push({
      id: 'R1',
      category: 'issue-management',
      severity: isHigh ? 'high' : 'medium',
      title: isHigh ? 'Critical volume of stale open issues' : 'Stale open issues detected',
      description:
        'A significant portion of open issues have had no activity for longer than your configured threshold.',
      evidence: `${staleOpenIssues} of ${observedOpenIssues} observed open issues (${percentage}%) are inactive past threshold.`,
      suggestedAction:
        'Triage stale issues: close resolved/inactive items, request updates from authors, or add labels.',
      relatedUrl: repo.htmlUrl ? `${repo.htmlUrl}/issues` : null,
    });
  }

  // R2: stale-prs (Trigger: staleOpenPRs >= 1)
  if (staleOpenPRs >= 1 && observedOpenPRs > 0) {
    const ratio = staleOpenPRs / observedOpenPRs;
    const isHigh = ratio >= 0.5;
    const percentage = Math.round(ratio * 100);

    recommendations.push({
      id: 'R2',
      category: 'pull-request-management',
      severity: isHigh ? 'high' : 'medium',
      title: isHigh ? 'Urgent pull request review bottleneck' : 'Stale pull requests awaiting review',
      description:
        'Open pull requests have been inactive past your stale threshold, which may block external contributions.',
      evidence: `${staleOpenPRs} of ${observedOpenPRs} observed open PRs (${percentage}%) are inactive past threshold.`,
      suggestedAction:
        'Prioritize reviewing or merging pending PRs, or communicate required changes to contributors.',
      relatedUrl: repo.htmlUrl ? `${repo.htmlUrl}/pulls` : null,
    });
  }

  // R3: no-recent-commits (Trigger: commits30d === 0 and commit data available)
  if (commits30d === 0) {
    recommendations.push({
      id: 'R3',
      category: 'commit-activity',
      severity: 'medium',
      title: 'No commit activity in last 30 days',
      description:
        'Zero commits were observed in the default branch during the 30-day activity window.',
      evidence: '0 commits observed across the past 30 days.',
      suggestedAction:
        'Verify if the project is in maintenance mode, or if active development is occurring on a non-default branch.',
      relatedUrl: repo.htmlUrl ? `${repo.htmlUrl}/commits` : null,
    });
  }

  // R4: backlog-growth (Trigger: closed30d + 1 < created30d / 2 AND observedOpenIssues >= 5)
  // Explaining the formula: Issue inflow exceeds twice the resolution outflow.
  if (observedOpenIssues >= 5 && closed30d + 1 < created30d / 2) {
    recommendations.push({
      id: 'R4',
      category: 'backlog-growth',
      severity: 'medium',
      title: 'Issue backlog growing faster than resolution rate',
      description:
        'The team closed less than half the volume of new issues created over the last 30 days.',
      evidence: `Created ${created30d} new issues vs. closed ${closed30d} in 30 days (${observedOpenIssues} currently open).`,
      suggestedAction:
        'Dedicate maintainer bandwidth to backlog burndown or refine issue intake templates.',
      relatedUrl: repo.htmlUrl ? `${repo.htmlUrl}/issues` : null,
    });
  }

  // R5: partial-data (Trigger: scoreStatus !== 'complete' OR scope incomplete OR dataWarnings)
  const hasWarnings = (dataWarnings && dataWarnings.length > 0) || (scope.dataWarnings && scope.dataWarnings.length > 0);
  const isIncomplete = scope.complete === false;

  if (scoreStatus !== 'complete' || isIncomplete || hasWarnings) {
    const reasons = [];
    if (scoreStatus !== 'complete') reasons.push(`Score status is "${scoreStatus}"`);
    if (isIncomplete) reasons.push('GitHub pagination cap reached');
    if (hasWarnings) reasons.push('Data warnings flagged during fetch');

    recommendations.push({
      id: 'R5',
      category: 'data-integrity',
      severity: 'info',
      title: 'Observation scope bounded or partial',
      description:
        'Analysis was computed on bounded or partial data. Metrics reflect measured observations rather than absolute totals.',
      evidence: reasons.join('; '),
      suggestedAction:
        'Review the observation scope details in the report for any component thresholds that were capped.',
      relatedUrl: null,
    });
  }

  // Sort by severity (high -> info), then by rule id
  recommendations.sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity] || 99;
    const sevB = SEVERITY_ORDER[b.severity] || 99;
    if (sevA !== sevB) {
      return sevA - sevB;
    }
    return a.id.localeCompare(b.id);
  });

  return recommendations;
}
