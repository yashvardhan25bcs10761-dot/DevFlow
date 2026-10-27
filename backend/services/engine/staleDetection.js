const MS_PER_DAY = 86_400_000;

/**
 * Pure function to detect if an issue or pull request is stale based on inactivity.
 *
 * Why updatedAt:
 * GitHub updates `updated_at` on comments, reviews, commits, labels, and state changes.
 * This makes updatedAt the standard heuristic for measuring maintainer/contributor inactivity.
 *
 * Why floor:
 * floor((now - updatedAt) / 86400000) counts full elapsed 24-hour days, preventing
 * premature stale labeling before the complete threshold duration has passed.
 *
 * Why boundary is >= threshold:
 * An item inactive for exactly 14.0 days meets the 14-day threshold and is considered stale.
 *
 * Why closed items are never stale:
 * Closed issues and merged/closed PRs represent finished work and do not burden maintainers.
 */
export function detectStaleItem(item, thresholdDays, now = new Date()) {
  if (!item) {
    return { isStale: false, inactivityDays: 0, warning: 'Item is null or undefined' };
  }

  // Closed items are never stale (SPEC Section 9)
  if (item.state && item.state.toLowerCase() === 'closed') {
    return { isStale: false, inactivityDays: 0 };
  }

  const rawTimestamp = item.updatedAt || item.updated_at;
  if (!rawTimestamp) {
    return {
      isStale: false,
      inactivityDays: 0,
      warning: `Item #${item.number || 'unknown'} has missing updatedAt timestamp`,
    };
  }

  const date = new Date(rawTimestamp);
  if (Number.isNaN(date.getTime())) {
    return {
      isStale: false,
      inactivityDays: 0,
      warning: `Item #${item.number || 'unknown'} has invalid timestamp "${rawTimestamp}"`,
    };
  }

  const nowEpoch = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const diffMs = nowEpoch - date.getTime();

  // Inactivity days formula: floor((now - updatedAt) / 86_400_000)
  const inactivityDays = Math.max(0, Math.floor(diffMs / MS_PER_DAY));

  const isStale = inactivityDays >= thresholdDays;

  return {
    isStale,
    inactivityDays,
  };
}
