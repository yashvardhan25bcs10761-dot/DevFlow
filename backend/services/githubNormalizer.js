export function normalizeRepository(raw) {
  if (!raw) return null;
  return {
    githubId: raw.id,
    ownerLogin: raw.owner?.login || '',
    name: raw.name || '',
    fullName: (raw.full_name || `${raw.owner?.login}/${raw.name}`).toLowerCase(),
    description: raw.description || '',
    htmlUrl: raw.html_url || '',
    defaultBranch: raw.default_branch || 'main',
    visibility: raw.visibility || (raw.private ? 'private' : 'public'),
    stars: typeof raw.stargazers_count === 'number' ? raw.stargazers_count : 0,
    forks: typeof raw.forks_count === 'number' ? raw.forks_count : 0,
    openIssuesCount: typeof raw.open_issues_count === 'number' ? raw.open_issues_count : 0,
    githubCreatedAt: raw.created_at || null,
    githubUpdatedAt: raw.updated_at || null,
    githubPushedAt: raw.pushed_at || null,
  };
}

export function normalizeCommit(raw) {
  if (!raw) return null;
  const rawMsg = raw.commit?.message || '';
  const firstLineMsg = rawMsg.split('\n')[0].slice(0, 150);

  return {
    sha: raw.sha,
    message: firstLineMsg,
    author: raw.commit?.author?.name || raw.author?.login || 'Unknown',
    date: raw.commit?.author?.date || raw.commit?.committer?.date || null,
    htmlUrl: raw.html_url || '',
  };
}

export function normalizeIssue(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title || '',
    state: raw.state || 'open',
    createdAt: raw.created_at || null,
    updatedAt: raw.updated_at || null,
    closedAt: raw.closed_at || null,
    author: raw.user?.login || 'Unknown',
    labels: Array.isArray(raw.labels)
      ? raw.labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean)
      : [],
    commentsCount: typeof raw.comments === 'number' ? raw.comments : 0,
    htmlUrl: raw.html_url || '',
  };
}

export function normalizePullRequest(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title || '',
    state: raw.state || 'open',
    isDraft: Boolean(raw.draft),
    createdAt: raw.created_at || null,
    updatedAt: raw.updated_at || null,
    closedAt: raw.closed_at || null,
    mergedAt: raw.merged_at || null,
    author: raw.user?.login || 'Unknown',
    labels: Array.isArray(raw.labels)
      ? raw.labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean)
      : [],
    htmlUrl: raw.html_url || '',
  };
}
