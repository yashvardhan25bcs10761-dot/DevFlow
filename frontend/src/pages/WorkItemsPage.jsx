import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Search, SlidersHorizontal, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiRequest, formatDate, formatError } from '../services/api';
import { useToast } from '../contexts/ToastContext';

const PAGE_SIZE = 25;
const DEFAULT_THRESHOLDS = { issues: 14, pullRequests: 7 };

export default function WorkItemsPage({ kind, repository, refreshTick = 0 }) {
  const { addToast } = useToast();
  const isPullRequest = kind === 'pullRequests';
  const itemName = isPullRequest ? 'pull requests' : 'issues';
  const endpointName = isPullRequest ? 'pull-requests' : 'issues';
  const itemsKey = isPullRequest ? 'pullRequests' : 'issues';
  const thresholdKey = isPullRequest ? 'stalePullRequestDays' : 'staleIssueDays';

  const [thresholdInput, setThresholdInput] = useState('');
  const [threshold, setThreshold] = useState(null);
  const [thresholdDefault, setThresholdDefault] = useState(DEFAULT_THRESHOLDS[kind]);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', state: 'open', stale: 'all', label: '' });
  const [availableLabels, setAvailableLabels] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(Boolean(repository));
  const [error, setError] = useState('');
  const [preferencesWarning, setPreferencesWarning] = useState('');

  useEffect(() => {
    let active = true;
    setThreshold(null);
    setThresholdInput('');
    setResult(null);
    setError('');
    setLoading(Boolean(repository));
    if (!repository) return () => { active = false; };

    apiRequest('/api/v1/preferences', {
      onSlow: () => addToast('The server is waking up. This can take up to a minute on an idle service.', 'info'),
    }).then((preferences) => {
      const value = preferences?.[thresholdKey];
      const safeValue = Number.isInteger(value) && value >= 1 && value <= 365 ? value : DEFAULT_THRESHOLDS[kind];
      if (active) {
        setThreshold(safeValue);
        setThresholdDefault(safeValue);
        setThresholdInput(String(safeValue));
        setPreferencesWarning('');
      }
    }).catch((preferenceError) => {
      if (!active) return;
      const fallback = DEFAULT_THRESHOLDS[kind];
      setThreshold(fallback);
      setThresholdDefault(fallback);
      setThresholdInput(String(fallback));
      setPreferencesWarning(`Could not load your saved threshold; using the documented ${fallback}-day default. ${formatError(preferenceError)}`);
    });

    return () => { active = false; };
  }, [addToast, kind, repository?._id, thresholdKey]);

  const loadItems = useCallback(async () => {
    if (!repository || threshold === null) {
      setResult(null);
      setLoading(Boolean(repository));
      return;
    }
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      state: filters.state,
      stale: filters.stale,
      threshold: String(threshold),
      search: filters.search,
      label: filters.label,
      page: String(page),
      limit: String(limit),
    });
    try {
      const data = await apiRequest(`/api/v1/repositories/${repository._id}/${endpointName}?${params}`, {
        onSlow: () => addToast('The server is waking up. This can take up to a minute on an idle service.', 'info'),
      });
      setResult(data);
      setAvailableLabels(Array.isArray(data.availableLabels) ? data.availableLabels : []);
    } catch (requestError) {
      setError(formatError(requestError));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, endpointName, filters, limit, page, repository, threshold]);

  useEffect(() => { loadItems(); }, [loadItems, refreshTick]);

  const items = Array.isArray(result?.[itemsKey]) ? result[itemsKey] : [];
  const pagination = result?.pagination;
  const updateFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));

  function applyFilters(event) {
    event.preventDefault();
    const parsedThreshold = Number(thresholdInput);
    if (!Number.isInteger(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 365) {
      setError('Enter a whole-number threshold from 1 to 365 days.');
      return;
    }
    setError('');
    setThreshold(parsedThreshold);
    setFilters((current) => ({ ...current, search: searchInput.trim() }));
    setPage(1);
  }

  function clearFilters() {
    setSearchInput('');
    setFilters({ search: '', state: 'open', stale: 'all', label: '' });
    setThresholdInput(String(thresholdDefault));
    setThreshold(thresholdDefault);
    setPage(1);
  }

  if (!repository) {
    return (
      <section className="work-empty state-card">
        <div><h2>Select a repository to inspect {itemName}</h2><p>Choose one in the repository selector or add a public repository first.</p></div>
        <a className="button button-primary" href="/repositories">Browse repositories <ArrowRight size={15} /></a>
      </section>
    );
  }

  const sourceLabel = result?.source === 'live' ? 'GitHub data · live'
    : result?.source === 'cached' ? 'GitHub data · cached'
      : 'Source unavailable';
  const observation = result?.observationScope;
  const emptyMessage = filters.stale === 'true'
    ? `No stale ${itemName} match these filters.`
    : filters.search || filters.label || filters.state !== 'open'
      ? `No ${itemName} match these filters in the fetched observation. Clear a filter or search for another value.`
      : `No open ${itemName} were returned in the fetched observation.`;

  return (
    <div className="work-items-page">
      <div className="work-page-heading">
        <div>
          <p className="eyebrow">CURRENT GITHUB DATA</p>
          <h2>{isPullRequest ? 'Pull requests' : 'Issues'} <span>for {repository.fullName}</span></h2>
          <p className="page-description">Search and filter the bounded GitHub observation. Stale is based on full inactive days since the last update.</p>
        </div>
        <span className="snapshot-pill">{repository.fullName}</span>
      </div>

      <form className="work-filter-card surface-card" onSubmit={applyFilters}>
        <div className="work-filter-header"><SlidersHorizontal size={16} /><strong>Filters</strong><span>Thresholds from your saved preferences</span></div>
        <div className="work-filter-grid">
          <label className="work-filter-search">Search
            <span className="work-search-box"><Search size={15} /><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Title, number, or author" /></span>
          </label>
          <label>State
            <select value={filters.state} onChange={(event) => updateFilter('state', event.target.value)}>
              <option value="all">All observed states</option>
              <option value="open">Open</option>
              {!isPullRequest && <option value="closed">Closed</option>}
              {isPullRequest && <option value="closed">Closed (not fetched)</option>}
            </select>
          </label>
          <label>Stale status
            <select aria-label="Stale status" value={filters.stale} onChange={(event) => updateFilter('stale', event.target.value)}>
              <option value="all">All</option><option value="true">Stale only</option><option value="false">Not stale</option>
            </select>
          </label>
          <label>Label
            <select value={filters.label} onChange={(event) => updateFilter('label', event.target.value)}>
              <option value="">All labels</option>
              {availableLabels.map((label) => <option value={label} key={label}>{label}</option>)}
            </select>
          </label>
          <label className="threshold-input">Stale after (days)
            <input aria-label="Stale threshold in days" type="number" min="1" max="365" step="1" value={thresholdInput} onChange={(event) => setThresholdInput(event.target.value)} />
          </label>
          <div className="work-filter-buttons"><button className="button button-primary" type="submit">Apply filters</button><button className="button button-secondary" type="button" onClick={clearFilters}>Reset</button></div>
        </div>
      </form>

      {preferencesWarning && <div className="work-warning" role="status"><AlertTriangle size={15} />{preferencesWarning}</div>}
      {isPullRequest && <div className="work-info-note">The GitHub service currently fetches open pull requests only. Closed and merged pull requests are not available in this observation; review status is not provided by the endpoint.</div>}

      <div className="work-source-row">
        <span className={`source-tag source-${result?.source || 'unknown'}`}>{sourceLabel}</span>
        <span>Fetched {formatDate(result?.fetchedAt)}</span>
        <span>{Number.isFinite(pagination?.total) ? `${pagination.total.toLocaleString()} matching observed` : 'Match count unavailable'}</span>
        {Number.isFinite(observation?.fetched) && <span>Observed {observation.fetched.toLocaleString()} {observation.capped ? '· fetch cap reached' : ''}</span>}
      </div>

      {observation?.capped && <div className="work-warning" role="status"><AlertTriangle size={15} />This result is bounded by the GitHub page limit. Counts apply to fetched items, not necessarily the repository total.</div>}
      {result?.dataWarnings?.length > 0 && <ul className="work-data-warnings">{result.dataWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}

      {loading ? <div className="loading-panel" role="status"><span className="spinner" /> Loading {itemName} from GitHub…</div> : null}
      {!loading && error && <section className="state-card state-error" role="alert"><AlertTriangle size={18} /><div><h2>Could not load {itemName}</h2><p>{error}</p><button className="button button-secondary" onClick={loadItems}><RefreshCw size={14} /> Try again</button></div></section>}
      {!loading && !error && items.length === 0 && <section className="state-card state-empty"><div><h3>{emptyMessage}</h3><p>Fetched data and source timestamp remain visible above when available.</p></div><button className="button button-secondary" type="button" onClick={clearFilters}>Clear filters</button></section>}

      {!loading && !error && items.length > 0 && (
        <section className="work-item-list" aria-label={`Fetched ${itemName}`}>
          {items.map((item) => <WorkItemCard item={item} key={item.id || `${item.number}-${item.htmlUrl}`} />)}
        </section>
      )}

      {!loading && !error && pagination && (
        <div className="work-pagination">
          <span>Page {pagination.page} of {pagination.pages} · {pagination.total.toLocaleString()} matches</span>
          <label>Rows
            <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
              <option value="10">10</option><option value="25">25</option><option value="50">50</option>
            </select>
          </label>
          <button className="button button-secondary" type="button" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={14} /> Previous</button>
          <button className="button button-secondary" type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}>Next <ArrowRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

function WorkItemCard({ item }) {
  const labels = Array.isArray(item.labels) ? item.labels : [];
  return (
    <article className="work-item-card surface-card">
      <div className="work-item-main">
        <div className="work-item-title-row">
          <a className="work-item-title" href={item.htmlUrl || undefined} target={item.htmlUrl ? '_blank' : undefined} rel={item.htmlUrl ? 'noreferrer' : undefined}>
            {item.htmlUrl ? <>{item.title || 'Untitled item'} <span>#{item.number ?? '—'}</span><ExternalLink size={13} /></> : <>{item.title || 'Untitled item'} <span>#{item.number ?? '—'}</span></>}
          </a>
          <span className={`state-badge state-${item.state || 'unknown'}`}>{item.state || 'State unavailable'}</span>
          {item.isStale ? <span className="stale-badge">Stale</span> : <span className="fresh-badge">Not flagged stale</span>}
        </div>
        <div className="work-item-meta"><span>by {item.author || 'Author unavailable'}</span><span>Updated {formatDate(item.updatedAt)}</span><span>{Number.isFinite(item.inactivityDays) ? `${item.inactivityDays} inactive days` : 'Inactivity duration unavailable'}</span></div>
        <div className="work-labels">
          {labels.length ? labels.map((label) => <span className="work-label" key={label}>{label}</span>) : <span className="muted-label">No labels returned</span>}
        </div>
      </div>
    </article>
  );
}
