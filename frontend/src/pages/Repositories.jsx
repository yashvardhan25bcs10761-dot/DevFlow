import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Search,
  Star,
  GitFork,
  ExternalLink,
  PlusCircle,
  CheckCircle,
  RefreshCw,
  Trash2,
  AlertCircle,
  FolderGit2,
  CircleDot,
  X,
} from 'lucide-react';

export default function Repositories() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchSource, setSearchSource] = useState(null);
  const [searchFetchedAt, setSearchFetchedAt] = useState(null);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalCount, setSearchTotalCount] = useState(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [savedRepos, setSavedRepos] = useState([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [savedError, setSavedError] = useState('');

  const [actionMessage, setActionMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [repositoryToRemove, setRepositoryToRemove] = useState(null);

  // Fetch saved repositories on mount
  async function fetchSavedRepositories() {
    setIsLoadingSaved(true);
    setSavedError('');
    try {
      const res = await fetch('/api/v1/repositories', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to load repositories`);
      }
      const json = await res.json();
      setSavedRepos(json.data || []);
    } catch (err) {
      setSavedError(err.message || 'Failed to load saved repositories');
    } finally {
      setIsLoadingSaved(false);
    }
  }

  useEffect(() => {
    fetchSavedRepositories();
  }, []);

  function showNotification(type, text) {
    setActionMessage({ type, text });
    setTimeout(() => {
      setActionMessage(null);
    }, 4000);
  }

  function clearSearch() {
    setSearchQuery('');
    setSearchError('');
    setSearchResults([]);
    setSearchSource(null);
    setSearchFetchedAt(null);
    setSearchPage(1);
    setSearchTotalCount(null);
    setSearchHasMore(false);
    setHasSearched(false);
  }

  async function performSearch(query, page = 1, append = false) {
    setSearchError('');
    setIsSearching(true);
    try {
      const res = await fetch(`/api/v1/repositories/search?q=${encodeURIComponent(query)}&page=${page}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Repository not found');
      }

      const results = data.data.repositories || (data.data.repository ? [data.data.repository] : []);
      const existingIds = new Set(searchResults.map((repository) => repository.githubId || repository.fullName));
      setSearchResults(append
        ? [...searchResults, ...results.filter((repository) => !existingIds.has(repository.githubId || repository.fullName))]
        : results);
      setSearchSource(data.data.source || null);
      setSearchFetchedAt(data.data.fetchedAt || null);
      setSearchPage(data.data.page || page);
      setSearchTotalCount(data.data.totalCount ?? results.length);
      setSearchHasMore(Boolean(data.data.hasMore));
      setHasSearched(true);
    } catch (err) {
      setSearchError(err.message || 'Failed to find repository on GitHub');
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    const query = searchQuery.trim();
    setSearchResults([]);
    setSearchSource(null);
    setSearchFetchedAt(null);
    setSearchPage(1);
    setSearchTotalCount(null);
    setSearchHasMore(false);
    setHasSearched(false);

    if (!query) {
      setSearchError('Enter an owner name, repository name, or owner/repo.');
      return;
    }

    const validQuery = query.includes('/')
      ? /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(query)
      : /^[A-Za-z0-9_.-]+$/.test(query);
    if (!validQuery || query.length > 100) {
      setSearchError('Use one owner name, one repository name, or "owner/repo" (letters, numbers, dots, dashes, and underscores).');
      return;
    }

    await performSearch(query);
  }

  async function handleLoadMoreSearchResults() {
    if (!searchHasMore || isSearching) return;
    await performSearch(searchQuery.trim(), searchPage + 1, true);
  }

  async function handleSave(fullName) {
    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fullName }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to save repository');
      }

      setSavedRepos([data.data, ...savedRepos]);
      window.dispatchEvent(new Event('devflow:repositories-changed'));
      showNotification('success', `"${fullName}" added to your dashboard.`);
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRefresh(id, fullName) {
    setRefreshingId(id);
    try {
      const res = await fetch(`/api/v1/repositories/${id}/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to refresh repository');
      }

      setSavedRepos(savedRepos.map((r) => (r._id === id ? data.data : r)));
      showNotification('success', `"${fullName}" metadata refreshed.`);
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setRefreshingId(null);
    }
  }

  function handleDelete(id, fullName) {
    setRepositoryToRemove({ id, fullName });
  }

  async function confirmDelete() {
    if (!repositoryToRemove) return;
    const { id, fullName } = repositoryToRemove;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/repositories/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to delete repository');
      }

      setSavedRepos(savedRepos.filter((r) => r._id !== id));
      window.dispatchEvent(new Event('devflow:repositories-changed'));
      showNotification('success', `"${fullName}" removed.`);
      setRepositoryToRemove(null);
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const isAlreadySaved = (fullName) => {
    return savedRepos.some((r) => r.fullName?.toLowerCase() === fullName.toLowerCase());
  };

  return (
    <div style={{ maxWidth: '960px', margin: '2.5rem auto', padding: '0 1.5rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Repository Management</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Search public GitHub repositories and save them to your active monitoring dashboard.
        </p>
      </header>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            background:
              actionMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: actionMessage.type === 'success' ? 'var(--success-color)' : 'var(--error-color)',
            border: `1px solid ${
              actionMessage.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
            }`,
          }}
        >
          {actionMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Repository Search Section */}
      <section className="repository-search-section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Search GitHub Repository
        </h2>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="repo-search-input-wrap">
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Owner, repository name, or owner/repo"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                background: 'var(--elevated-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
            />
            {searchQuery && (
              <button className="repo-search-clear" type="button" onClick={clearSearch} aria-label="Clear repository search" title="Clear search">
                <X size={15} />
              </button>
            )}
          </div>

          <button
            type="submit"
            className="button button-primary search-submit-button"
            disabled={isSearching}
          >
            <Search size={16} />
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {searchError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--error-color)',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              fontSize: '0.875rem',
              marginTop: '1rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{searchError}</span>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="repository-search-results-list">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
              {searchResults.length} public {searchResults.length === 1 ? 'repository' : 'repositories'} loaded
              {searchTotalCount !== null && ` · ${searchTotalCount.toLocaleString()} matching`}
              {searchSource && ` · ${searchSource}`}
              {searchFetchedAt && ` · ${new Date(searchFetchedAt).toLocaleString()}`}
            </p>
            {searchResults.map((searchResult) => (
              <article className="repository-search-result" key={searchResult.githubId || searchResult.fullName}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>{searchResult.fullName}</h3>
                    <span style={{ fontSize: '0.7rem', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-color)', padding: '0.15rem 0.5rem', borderRadius: '12px', textTransform: 'uppercase' }}>
                      {searchResult.visibility || 'public'}
                    </span>
                    <a href={searchResult.htmlUrl} target="_blank" rel="noopener noreferrer" title="View on GitHub" style={{ color: 'var(--text-muted)' }}>
                      <ExternalLink size={15} />
                    </a>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.4rem 0 0' }}>
                    {searchResult.description || 'No description provided.'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.65rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span><Star size={13} color="var(--warning-color)" /> {searchResult.stars?.toLocaleString?.() ?? 'Unavailable'}</span>
                    <span><GitFork size={13} /> {searchResult.forks?.toLocaleString?.() ?? 'Unavailable'}</span>
                    <span><CircleDot size={13} /> {searchResult.openIssuesCount?.toLocaleString?.() ?? 'Unavailable'} issues</span>
                  </div>
                </div>
                <div>
                  {isAlreadySaved(searchResult.fullName) ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--success-color)', padding: '0.5rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500 }}>
                      <CheckCircle size={15} /> Saved in Dashboard
                    </span>
                  ) : (
                    <button className="button button-primary search-save-button" onClick={() => handleSave(searchResult.fullName)} disabled={isSaving}>
                      <PlusCircle size={15} /> {isSaving ? 'Saving...' : 'Save Repository'}
                    </button>
                  )}
                </div>
              </article>
            ))}
            {searchHasMore && (
              <div className="repository-search-pagination">
                <span>More matching repositories are available.</span>
                <button className="button button-secondary" type="button" onClick={handleLoadMoreSearchResults} disabled={isSearching}>
                  {isSearching ? 'Loading more…' : 'Load more matching repositories'}
                </button>
              </div>
            )}
            {!searchHasMore && searchPage === 10 && searchResults.length >= 1000 && (
              <p className="repository-search-limit-note">DevFlow has loaded the first 1,000 matches available for this query.</p>
            )}
          </div>
        )}
        {hasSearched && !searchError && searchResults.length === 0 && (
          <div className="inline-empty" role="status"><p>No public repositories matched that owner or repository name.</p></div>
        )}
      </section>

      {/* Saved Repositories Section */}
      <section className="saved-repositories-section">
        <div className="saved-repositories-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderGit2 size={20} color="var(--accent-color)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Saved Repositories</h2>
            <span
              style={{
                fontSize: '0.8rem',
                background: 'var(--elevated-color)',
                border: '1px solid var(--border-color)',
                padding: '0.15rem 0.5rem',
                borderRadius: '12px',
                color: 'var(--text-muted)',
              }}
            >
              {savedRepos.length}
            </span>
          </div>

          <button
            onClick={fetchSavedRepositories}
            disabled={isLoadingSaved}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            <RefreshCw size={13} className={isLoadingSaved ? 'spin' : ''} />
            Refresh List
          </button>
        </div>

        {/* Loading State */}
        {isLoadingSaved && (
          <div
            style={{
              background: 'var(--card-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '2.5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <p>Loading your saved repositories...</p>
          </div>
        )}

        {/* Error State */}
        {savedError && !isLoadingSaved && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--error-color)',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            <AlertCircle size={18} />
            <span>{savedError}</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoadingSaved && !savedError && savedRepos.length === 0 && (
          <div
            style={{
              background: 'var(--card-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '3rem 2rem',
              textAlign: 'center',
            }}
          >
            <FolderGit2 size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              No repositories saved yet
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto' }}>
              Search for public GitHub repositories using the search bar above to save them to your DevFlow dashboard.
            </p>
          </div>
        )}

        {/* Saved Repositories List */}
        {!isLoadingSaved && !savedError && savedRepos.length > 0 && (
          <div className="saved-repository-list">
            {savedRepos.map((repo) => (
              <div
                key={repo._id}
                className="saved-repository-card"
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}><Link to={`/repositories/${repo._id}`}>{repo.fullName}</Link></h3>
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open on GitHub"
                      style={{ color: 'var(--text-muted)', display: 'inline-flex' }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                      marginTop: '0.25rem',
                      maxWidth: '550px',
                    }}
                  >
                    {repo.description || 'No description provided.'}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      marginTop: '0.5rem',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Star size={13} color="var(--warning-color)" /> {repo.stars?.toLocaleString?.() ?? 'Unavailable'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <GitFork size={13} /> {repo.forks?.toLocaleString?.() ?? 'Unavailable'}
                    </span>
                    <span>Branch: {repo.defaultBranch || 'Unavailable'}</span>
                    {repo.githubUpdatedAt && (
                      <span>Updated: {new Date(repo.githubUpdatedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleRefresh(repo._id, repo.fullName)}
                    disabled={refreshingId === repo._id}
                    title="Refresh repository metadata from GitHub"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'var(--elevated-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-main)',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      cursor: refreshingId === repo._id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <RefreshCw size={13} className={refreshingId === repo._id ? 'spin' : ''} />
                    {refreshingId === repo._id ? 'Refreshing...' : 'Refresh'}
                  </button>

                  <button
                    onClick={() => handleDelete(repo._id, repo.fullName)}
                    disabled={deletingId === repo._id}
                    title="Remove repository from dashboard"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '6px',
                      color: 'var(--error-color)',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      cursor: deletingId === repo._id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Trash2 size={13} />
                    {deletingId === repo._id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {repositoryToRemove && (
        <ConfirmDialog
          title="Remove saved repository?"
          description={`Remove ${repositoryToRemove.fullName} from your dashboard? Its saved analysis history will also be deleted.`}
          confirmLabel="Remove repository"
          busy={deletingId === repositoryToRemove.id}
          onConfirm={confirmDelete}
          onCancel={() => setRepositoryToRemove(null)}
        />
      )}
    </div>
  );
}
