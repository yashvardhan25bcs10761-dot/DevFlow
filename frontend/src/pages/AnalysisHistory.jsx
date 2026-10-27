import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BarChart3, History, RefreshCw } from 'lucide-react';
import { useRepositoryLayout } from '../components/Navbar';
import { useToast } from '../contexts/ToastContext';
import { apiRequest, formatDate, formatError } from '../services/api';

const PAGE_SIZE = 10;

export default function AnalysisHistory() {
  const { repoId: routeRepoId } = useParams();
  const { repositories, repositoriesLoading, selectedRepo } = useRepositoryLayout();
  const { addToast } = useToast();
  const repository = routeRepoId
    ? repositories.find((item) => item._id === routeRepoId) || (selectedRepo?._id === routeRepoId ? selectedRepo : null)
    : selectedRepo;
  const repoId = routeRepoId || repository?._id;
  const [history, setHistory] = useState([]);
  const [trendHistory, setTrendHistory] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(Boolean(repoId));
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!repoId) {
      setHistory([]);
      setTrendHistory([]);
      setPagination(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const onSlow = () => addToast('The server is waking up. This can take up to a minute on an idle service.', 'info');
      const [data, trendData] = await Promise.all([
        apiRequest(`/api/v1/repositories/${repoId}/analysis-history?page=${page}&limit=${PAGE_SIZE}`, { onSlow }),
        apiRequest(`/api/v1/repositories/${repoId}/analysis-history?page=1&limit=50`, { onSlow }),
      ]);
      setHistory(Array.isArray(data.history) ? data.history : []);
      setTrendHistory(Array.isArray(trendData.history) ? trendData.history : []);
      setPagination(data.pagination || null);
    } catch (requestError) {
      setError(formatError(requestError));
      setHistory([]);
      setTrendHistory([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, page, repoId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleRunAnalysis() {
    if (!repoId) return;
    setAnalyzing(true);
    setError('');
    try {
      await apiRequest(`/api/v1/repositories/${repoId}/analyze`, {
        method: 'POST',
        onSlow: () => addToast('The analysis is taking longer than usual. Please wait for GitHub data.', 'info'),
      });
      setPage(1);
      addToast('Analysis snapshot saved.', 'success');
      if (page === 1) await loadHistory();
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setAnalyzing(false);
    }
  }

  if (repositoriesLoading && !routeRepoId) {
    return <div className="loading-panel" role="status"><span className="spinner" /> Loading repositories…</div>;
  }

  if (!repoId) {
    return (
      <section className="state-card state-empty">
        <div><h2>Select a repository to view analysis history</h2><p>Choose a saved repository in the top bar, or add one before creating snapshots.</p></div>
        <Link className="button button-primary" to="/repositories">Browse repositories <ArrowRight size={15} /></Link>
      </section>
    );
  }

  const snapshotCount = pagination?.total ?? history.length;
  const chartSnapshots = [...trendHistory].reverse();

  return (
    <div className="history-page">
      <div className="page-heading">
        <div><p className="eyebrow">STORED ANALYSIS SNAPSHOTS</p><h2>Analysis history</h2><p className="page-description">{repository?.fullName || 'Saved repository'} · each report keeps the values and thresholds from its analysis date.</p></div>
        <button className="button button-primary" type="button" onClick={handleRunAnalysis} disabled={analyzing || loading}>
          <RefreshCw size={15} className={analyzing ? 'spin' : ''} />{analyzing ? 'Analyzing…' : 'Run new analysis'}
        </button>
      </div>

      <section className="surface-card history-trend-card" aria-labelledby="history-trend-title">
        <div className="section-heading"><div><p className="eyebrow">SCORE OVER TIME</p><h3 id="history-trend-title">Health score trend</h3></div><span className="subtle-count">{snapshotCount} stored {snapshotCount === 1 ? 'snapshot' : 'snapshots'}</span></div>
        {loading ? <div className="history-chart-empty" role="status">Loading stored history…</div>
          : error ? <div className="history-chart-empty">Trend unavailable until stored history loads successfully.</div>
            : chartSnapshots.length >= 2 ? <HistoryTrend snapshots={chartSnapshots} />
              : <div className="history-chart-empty"><BarChart3 size={21} /><strong>Need at least 2 snapshots to show a trend.</strong><span>Run another analysis to compare stored health scores over time.</span></div>}
      </section>

      {error && <section className="state-card state-error" role="alert"><div><h2>Could not load analysis history</h2><p>{error}</p><button className="button button-secondary" type="button" onClick={loadHistory}>Try again</button></div></section>}
      {!error && loading && <div className="loading-panel" role="status"><span className="spinner" /> Loading stored snapshots…</div>}
      {!error && !loading && history.length === 0 && <section className="state-card state-empty"><div><h3>No analysis snapshots yet</h3><p>Run an analysis to save the first snapshot. A second snapshot enables the score trend.</p></div></section>}

      {!error && !loading && history.length > 0 && (
        <section className="history-snapshots" aria-labelledby="snapshots-title">
          <div className="section-heading"><div><p className="eyebrow">IMMUTABLE REPORTS</p><h3 id="snapshots-title">Saved snapshots</h3></div><span className="subtle-count">Newest first</span></div>
          {history.map((snapshot) => <SnapshotRow snapshot={snapshot} key={snapshot._id} />)}
          {pagination && pagination.pages > 1 && (
            <div className="work-pagination">
              <span>Page {pagination.page} of {pagination.pages} · {pagination.total} snapshots</span>
              <button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={14} /> Previous</button>
              <button className="button button-secondary" type="button" disabled={page >= pagination.pages} onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}>Next <ArrowRight size={14} /></button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SnapshotRow({ snapshot }) {
  const score = Number.isFinite(snapshot.healthScore) ? `${snapshot.healthScore.toFixed(1)} / 100` : 'Score unavailable';
  const status = snapshot.scoreStatus === 'partial' ? 'Partial score'
    : snapshot.scoreStatus === 'insufficient_data' ? 'Insufficient data'
      : snapshot.scoreStatus === 'complete' ? 'Complete score' : 'Status unavailable';
  return (
    <Link className="snapshot-row surface-card" to={`/analyses/${snapshot._id}`}>
      <span className="snapshot-row-icon"><History size={17} /></span>
      <span className="snapshot-row-main">
        <strong>{formatDate(snapshot.analyzedAt)}</strong>
        <span className="snapshot-row-label">Historical snapshot · Stored snapshot</span>
        <small>Issues stale after {Number.isFinite(snapshot.thresholdsUsed?.issueDays) ? `${snapshot.thresholdsUsed.issueDays} days` : 'Unavailable'} · PRs stale after {Number.isFinite(snapshot.thresholdsUsed?.prDays) ? `${snapshot.thresholdsUsed.prDays} days` : 'Unavailable'}</small>
      </span>
      <span className="snapshot-row-summary">
        <strong>{score}</strong><span className={`status-pill status-${snapshot.scoreStatus || 'unknown'}`}>{status}</span>
        <small>Issues {Number.isFinite(snapshot.issueSummary?.observedOpenIssues) ? snapshot.issueSummary.observedOpenIssues.toLocaleString() : 'Unavailable'} · PRs {Number.isFinite(snapshot.pullRequestSummary?.observedOpenPRs) ? snapshot.pullRequestSummary.observedOpenPRs.toLocaleString() : 'Unavailable'}</small>
      </span>
      <ArrowRight size={16} className="snapshot-row-arrow" />
    </Link>
  );
}

export function HistoryTrend({ snapshots }) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) return null;

  const width = 720;
  const height = 220;
  const pad = { top: 18, right: 20, bottom: 38, left: 42 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (snapshots.length === 1 ? chartWidth / 2 : (index * chartWidth) / (snapshots.length - 1));
  const yFor = (score) => pad.top + ((100 - score) / 100) * chartHeight;
  const points = snapshots.map((snapshot, index) => ({
    snapshot,
    index,
    score: Number.isFinite(snapshot.healthScore) ? snapshot.healthScore : null,
    x: xFor(index),
    y: Number.isFinite(snapshot.healthScore) ? yFor(snapshot.healthScore) : null,
  }));
  const visibleLabels = points.length <= 6 ? points : points.filter((point, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0);

  return (
    <div className="history-chart-wrap">
      <svg className="history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stored repository health score trend, oldest snapshot to newest">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = yFor(tick);
          return <g key={tick}><line x1={pad.left} y1={y} x2={width - pad.right} y2={y} className="chart-gridline" /><text x={pad.left - 9} y={y + 4} textAnchor="end" className="chart-axis-label">{tick}</text></g>;
        })}
        {points.slice(0, -1).map((point, index) => {
          const next = points[index + 1];
          return point.score === null || next?.score === null ? null
            : <line key={`${point.index}-${next.index}`} x1={point.x} y1={point.y} x2={next.x} y2={next.y} className="chart-trend-line" />;
        })}
        {points.map((point) => point.score === null ? null : (
          <g key={point.snapshot._id}>
            <circle cx={point.x} cy={point.y} r="4.5" className="chart-point" />
            <text x={point.x} y={Math.max(12, point.y - 10)} textAnchor="middle" className="chart-score-label">{point.score.toFixed(1)}</text>
          </g>
        ))}
        {visibleLabels.map((point) => <text key={`label-${point.snapshot._id}`} x={point.x} y={height - 11} textAnchor="middle" className="chart-axis-label">{chartDate(point.snapshot.analyzedAt)}</text>)}
      </svg>
      <p className="history-chart-caption">Values come from stored snapshots; unavailable scores are left off the plot. This is a DevFlow heuristic, not an official GitHub metric.</p>
    </div>
  );
}

function chartDate(value) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleDateString();
}
