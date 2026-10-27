export const GITHUB_CONFIG = {
  BASE_URL: 'https://api.github.com',
  TIMEOUT_MS: 10000, // 10 seconds per SPEC Section 8
  MAX_RETRIES: 2, // Max 2 retries on network / 5xx errors
  INITIAL_RETRY_DELAY_MS: 300,

  // Fetch bounds (constants per SPEC Section 8)
  BOUNDS: {
    METADATA: {
      MAX_CALLS: 1,
    },
    COMMITS: {
      MAX_PAGES: 1,
      PER_PAGE: 100, // Max 100. If 100 returned, report "100+"
      DAYS_WINDOW: 30, // Last 30 days
    },
    ISSUES: {
      MAX_PAGES: 3,
      PER_PAGE: 100, // Max 3 pages (300 items)
    },
    PULLS: {
      MAX_PAGES: 2,
      PER_PAGE: 100, // Max 2 pages (200 items)
    },
  },

  // Cache settings
  CACHE: {
    TTL_MS: 5 * 60 * 1000, // 5 minutes TTL
    MAX_ENTRIES: 100, // Max 100 cache entries
  },
};
