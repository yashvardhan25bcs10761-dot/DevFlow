import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ExternalLink, GitBranch, GitFork, RefreshCw, Star, Trash2 } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../contexts/ToastContext';
import { apiRequest, formatDate, formatError } from '../services/api';

const componentLabels = {
  commits: 'Commit activity',
  issues: 'Issue management',
  pullRequests: 'Pull request management',
  resolution: 'Resolution activity',
};

function displayedCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : 'Unavailable';
}

export default function RepositoryDetail() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [repository, setRepository] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [repoResult, analysisResult] = await Promise.allSettled([
        apiRequest(`/api/v1/repositories/${repoId}`),
        apiRequest(`/api/v1/repositories/${repoId}/latest-analysis`),
      ]);
      if (repoResult.status === 'rejected') throw repoResult.reason;
      setRepository(repoResult.value);
      if (analysisResult.status === 'fulfilled') setAnalysis(analysisResult.value);
      else if (analysisResult.reason?.status === 404) setAnalysis(null);
      else throw analysisResult.reason;
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('devflow:refresh', load);
    return () => window.removeEventListener('devflow:refresh', load);
  }, [load]);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const result = await apiRequest(`/api/v1/repositories/${repoId}/analyze`, {
        method: 'POST',
        onSlow: () => addToast('The server is waking up. Analysis may take a little longer on an idle service.', 'info'),
      });
      setAnalysis(result);
      await load();
      addToast(`Analysis snapshot saved for ${repository?.fullName || 'repository'}.`, 'success');
    } catch (analysisError) {
      addToast(formatError(analysisError), 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  async function removeRepository() {
    setRemoving(true);
    try {
      await apiRequest(`/api/v1/repositories/${repoId}`, { method: 'DELETE' });
      window.dispatchEvent(new Event('devflow:repositories-changed'));
      addToast(`${repository?.fullName || 'Repository'} removed.`, 'success');
      navigate('/repositories');
    } catch (removeError) {
      addToast(formatError(removeError), 'error');
      setRemoving(false);
      setConfirmRemoval(false);
    }
  }

  if (loading) return <div className="loading-panel" role="status"><span className="spinner" /> Loading repository…</div>;
  if (error) {
    return <section className="state-card state-error" role="alert"><AlertTriangle size={20} /><div><h2>Could not load repository</h2><p>{error}</p><button className="button button-secondary" onClick={load}><RefreshCw size={15} /> Try again</button></div></section>;
  }
  if (!repository) return null;

  const breakdown = analysis?.scoreBreakdown || {};
  const excluded = Object.entries(breakdown).filter(([, component]) => !component.available);

  return (
    <div className="repository-detail-page">
      <Link to="/repositories" className="back-link"><ArrowLeft size={15} /> All repositories</Link>
      <section className="repo-hero surface-card">
        <div className="repo-hero-main">
          <div className="repo-title-row"><div className="repo-avatar"><GitBranch size={20} /></div><div><p className="eyebrow">SAVED PUBLIC REPOSITORY</p><h2>{repository.fullName}</h2></div></div>
          <p className="repo-description">{repository.description || 'No repository description is available.'}</p>
          <div className="repo-facts">
            <span><Star size={15} /> {displayedCount(repository.stars)} stars</span>
            <span><GitFork size={15} /> {displayedCount(repository.forks)} forks</span>
            <span>Default branch: {repository.defaultBranch || 'Unavailable'}</span>
            <span>{repository.visibility || 'Visibility unavailable'}</span>
          </div>
        </div>
        <div className="repo-hero-actions">
          <button className="button button-primary" onClick={runAnalysis} disabled={analyzing}>
            <RefreshCw size={15} className={analyzing ? 'spin' : ''} /> {analyzing ? 'Analyzing…' : 'Analyze now'}
          </button>
          <a className="button button-secondary" href={repository.htmlUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> GitHub</a>
          <button className="button button-danger" onClick={() => setConfirmRemoval(true)} disabled={removing}><Trash2 size={15} /> {removing ? 'Removing…' : 'Remove'}</button>
        </div>
      </section>

      <div className="metadata-source-row">
        <span>Source: saved repository metadata</span>
        <span>Record updated {formatDate(repository.updatedAt)}</span>
        <span>GitHub last updated {formatDate(repository.githubUpdatedAt)}</span>
      </div>

      {!analysis ? (
        <section className="state-card state-empty"><div className="welcome-icon"><RefreshCw size={20} /></div><div><h3>No analysis snapshot yet</h3><p>Analysis uses current GitHub data and stores an explainable report with its observation scope.</p></div><button className="button button-primary" onClick={runAnalysis} disabled={analyzing}>{analyzing ? 'Analyzing…' : 'Run first analysis'}</button></section>
      ) : (
        <>
          <section className="score-overview surface-card">
            <div><p className="eyebrow">DEVFLOW HEALTH SCORE</p><div className="score-large">{analysis.healthScore == null ? '—' : analysis.healthScore}<small>{analysis.healthScore == null ? '' : ' / 100'}</small></div><span className={`status-pill status-${analysis.scoreStatus}`}>{analysis.scoreStatus === 'partial' ? 'Partial score' : analysis.scoreStatus === 'complete' ? 'Complete score' : 'Insufficient data'}</span></div>
            <div className="score-meta"><span className="snapshot-pill">Stored snapshot</span><p>Analyzed {formatDate(analysis.analyzedAt)}</p><p>Thresholds used: issues {analysis.thresholdsUsed?.issueDays ?? 'Unavailable'}d · pull requests {analysis.thresholdsUsed?.prDays ?? 'Unavailable'}d</p><p>Observation scope: {analysis.observationScope?.complete === false ? 'bounded / incomplete' : analysis.observationScope?.complete === true ? 'complete within fetched limits' : 'not recorded'}</p></div>
          </section>

          {analysis.scoreStatus === 'partial' && <section className="partial-notice" role="status"><AlertTriangle size={17} /><span><strong>Partial score.</strong> Excluded components: {excluded.map(([key]) => componentLabels[key] || key).join(', ') || 'none'}.</span></section>}
          {analysis.scoreStatus === 'insufficient_data' && <section className="partial-notice" role="status"><AlertTriangle size={17} /><span><strong>Insufficient data.</strong> No overall score is shown until enough component weight is available.</span></section>}

          <section className="surface-card detail-section">
            <div className="section-heading"><div><p className="eyebrow">EXPLAINABLE SCORING</p><h3>Score breakdown</h3></div></div>
            <p className="fine-print">DevFlow’s score is a project heuristic, not an official GitHub metric or a measure of code quality.</p>
            <div className="breakdown-grid">
              {Object.entries(breakdown).map(([key, component]) => (
                <article className={`breakdown-item ${component.available ? '' : 'breakdown-unavailable'}`} key={key}>
                  <div className="component-topline"><strong>{componentLabels[key] || key}</strong><span>{component.available && component.score != null ? `${component.score}/100` : 'Unavailable'}</span></div>
                  <div className="component-track"><span style={{ width: `${component.available && component.score != null ? component.score : 0}%` }} /></div>
                  <p>{component.explanation || 'No explanation was stored for this component.'}</p>
                  <span className="component-weight">Weight {(Number(component.weight) * 100).toFixed(0)}%</span>
                  {component.partialWindow && <span className="warning-inline">The issue activity window is partial because the fetch cap may have cut it short.</span>}
                </article>
              ))}
            </div>
          </section>

          <section className="surface-card detail-section">
            <div className="section-heading"><div><p className="eyebrow">OBSERVED METRICS</p><h3>Analysis summary</h3></div></div>
            <div className="detail-metric-grid">
              <DetailMetric label="Stars" value={analysis.repositoryMetrics?.stars} />
              <DetailMetric label="Forks" value={analysis.repositoryMetrics?.forks} />
              <DetailMetric label="Open issues observed" value={analysis.issueSummary?.observedOpenIssues} />
              <DetailMetric label="Stale open issues" value={analysis.issueSummary?.staleOpenIssues} />
              <DetailMetric label="Open PRs observed" value={analysis.pullRequestSummary?.observedOpenPRs} />
              <DetailMetric label="Stale open PRs" value={analysis.pullRequestSummary?.staleOpenPRs} />
              <DetailMetric label="Commits in last 30 days" value={analysis.activitySummary?.commits30d} />
              <DetailMetric label="Active authors observed" value={analysis.activitySummary?.activeAuthorsCount} />
            </div>
          </section>

          <section className="surface-card detail-section">
            <div className="section-heading"><div><p className="eyebrow">RULE-BASED SIGNALS</p><h3>Recommendations</h3></div></div>
            {!analysis.recommendations?.length ? <div className="inline-empty"><p>No recommendations were triggered by the measured data.</p></div> : (
              <div className="recommendation-list">
                {analysis.recommendations.map((recommendation) => (
                  <article className="recommendation-item" key={recommendation.id}>
                    <div className="recommendation-title"><span className={`severity-dot severity-${recommendation.severity}`} /><strong>{recommendation.title}</strong><span className={`severity-label severity-text-${recommendation.severity}`}>{recommendation.severity}</span></div>
                    <p>{recommendation.description}</p>
                    {recommendation.evidence && <div className="recommendation-evidence"><strong>Evidence</strong><span>{recommendation.evidence}</span></div>}
                    {recommendation.suggestedAction && <p className="recommendation-action">Suggested action: {recommendation.suggestedAction}</p>}
                    {recommendation.relatedUrl && <a className="text-link" href={recommendation.relatedUrl} target="_blank" rel="noreferrer">Open related GitHub page <ExternalLink size={13} /></a>}
                  </article>
                ))}
              </div>
            )}
          </section>

          {analysis.dataWarnings?.length > 0 && <section className="data-warning"><AlertTriangle size={16} /><div><strong>Data notes</strong><ul>{analysis.dataWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></section>}
          <p className="source-footnote">Source: stored analysis snapshot · analyzed {formatDate(analysis.analyzedAt)}. Counts describe the fetched observation scope, not necessarily repository-wide totals.</p>
        </>
      )}
      {confirmRemoval && (
        <ConfirmDialog
          title="Remove saved repository?"
          description={`Remove ${repository.fullName} from your dashboard? Its saved analysis history will also be deleted.`}
          confirmLabel="Remove repository"
          busy={removing}
          onConfirm={removeRepository}
          onCancel={() => setConfirmRemoval(false)}
        />
      )}
    </div>
  );
}

function DetailMetric({ label, value }) {
  return <div className="detail-metric"><span>{label}</span><strong>{displayedCount(value)}</strong></div>;
}
