import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, History, Quote, RefreshCw, Sparkles } from 'lucide-react';
import { useRepositoryLayout } from '../components/Navbar';
import { apiRequest, formatDate, formatError } from '../services/api';
import { useToast } from '../contexts/ToastContext';

const componentLabels = {
  commits: 'Commit activity',
  issues: 'Issue management',
  pullRequests: 'Pull request management',
  resolution: 'Resolution activity',
};

function countValue(value) {
  return Number.isFinite(value) ? value.toLocaleString() : 'Unavailable';
}

export default function Dashboard() {
  const { selectedRepo, repositoriesLoading, repositoriesError, refreshTick } = useRepositoryLayout();
  const { addToast } = useToast();
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!selectedRepo) {
      setAnalysis(null);
      setHistory([]);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const slowTimer = () => addToast('The server is waking up. This can take up to a minute on an idle service.', 'info');
    try {
      const [latestResult, historyResult] = await Promise.allSettled([
        apiRequest(`/api/v1/repositories/${selectedRepo._id}/latest-analysis`, { onSlow: slowTimer }),
        apiRequest(`/api/v1/repositories/${selectedRepo._id}/analysis-history?page=1&limit=5`, { onSlow: slowTimer }),
      ]);
      if (latestResult.status === 'fulfilled') setAnalysis(latestResult.value);
      else if (latestResult.reason?.status === 404) setAnalysis(null);
      else throw latestResult.reason;
      if (historyResult.status === 'fulfilled') setHistory(historyResult.value.history || []);
      else if (historyResult.reason?.status === 404) setHistory([]);
      else throw historyResult.reason;
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setLoading(false);
    }
  }, [addToast, selectedRepo]);

  useEffect(() => { loadDashboard(); }, [loadDashboard, refreshTick]);

  if (repositoriesLoading || loading) {
    return <div className="loading-panel" role="status"><span className="spinner" /> Loading repository analysis…</div>;
  }

  if (repositoriesError) {
    return <section className="state-card state-error" role="alert"><AlertTriangle size={20} /><div><h2>Could not load repositories</h2><p>{repositoriesError}</p></div></section>;
  }

  if (error) {
    return (
      <section className="state-card state-error" role="alert">
        <AlertTriangle size={20} />
        <div><h2>Could not load dashboard data</h2><p>{error}</p><button className="button button-secondary" onClick={loadDashboard}><RefreshCw size={15} /> Try again</button></div>
      </section>
    );
  }

  if (!selectedRepo) {
    return (
      <div className="dashboard-page">
        <DashboardIntro />
        <section className="welcome-card">
          <div className="welcome-icon"><Sparkles size={22} /></div>
          <p className="eyebrow">START WITH A REPOSITORY</p>
          <h2>Your engineering overview starts here.</h2>
          <p>Save a public GitHub repository to see measured activity, issue freshness, pull requests, and analysis history.</p>
          <Link className="button button-primary" to="/repositories">Browse repositories <ArrowRight size={16} /></Link>
        </section>
      </div>
    );
  }

  const hasAnalysis = Boolean(analysis);
  const metrics = analysis?.repositoryMetrics || {};
  const activity = analysis?.activitySummary || {};
  const issues = analysis?.issueSummary || {};
  const pulls = analysis?.pullRequestSummary || {};
  const recommendations = analysis?.recommendations || [];
  const breakdown = analysis?.scoreBreakdown || {};
  const partialComponents = Object.entries(breakdown).filter(([, item]) => !item.available);

  return (
    <div className="dashboard-page">
      <DashboardIntro />
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPOSITORY OVERVIEW</p>
          <h2>{selectedRepo.fullName}</h2>
          <p className="page-description">A measured view of recent repository activity and backlog signals.</p>
        </div>
        <Link className="button button-secondary" to={`/repositories/${selectedRepo._id}`}>Repository details <ArrowRight size={15} /></Link>
      </div>

      {!hasAnalysis ? (
        <section className="state-card state-empty">
          <div className="welcome-icon"><History size={21} /></div>
          <div><h3>No analysis snapshot yet</h3><p>Run an analysis to populate dashboard metrics from GitHub data.</p></div>
          <Link className="button button-primary" to={`/repositories/${selectedRepo._id}`}>Open repository <ArrowRight size={15} /></Link>
        </section>
      ) : (
        <>
          <section className="snapshot-banner">
            <span className="snapshot-pill">Stored snapshot</span>
            <span>Analyzed {formatDate(analysis.analyzedAt)}</span>
            {analysis.observationScope?.complete === false && <span className="warning-pill">Bounded observations</span>}
          </section>

          {analysis.scoreStatus === 'partial' && (
            <section className="partial-notice" role="status">
              <AlertTriangle size={17} />
              <span><strong>Partial score.</strong> Excluded components: {partialComponents.map(([key]) => componentLabels[key] || key).join(', ') || 'none'}. Reasons are shown below.</span>
            </section>
          )}
          {analysis.scoreStatus === 'insufficient_data' && (
            <section className="partial-notice" role="status"><AlertTriangle size={17} /><span><strong>Insufficient data for an overall score.</strong> Available components and missing-data reasons are shown below.</span></section>
          )}

          <section className="metrics-grid" aria-label="Repository metrics">
            <MetricCard label="Health score" value={analysis.healthScore == null ? '—' : `${analysis.healthScore}`} suffix={analysis.healthScore == null ? '' : '/100'} caption="DevFlow heuristic based on the available activity and backlog components." className="metric-score" />
            <MetricCard label="Open issues" value={countValue(issues.observedOpenIssues)} caption="Issues observed in the bounded GitHub issue fetch; pull requests are excluded." />
            <MetricCard label="Stale issues" value={countValue(issues.staleOpenIssues)} caption={`Open issues at or beyond the ${analysis.thresholdsUsed?.issueDays ?? 'configured'}-day inactivity threshold.`} className="metric-warning" />
            <MetricCard label="Open pull requests" value={countValue(pulls.observedOpenPRs)} caption="Open pull requests observed across the configured fetch window and page cap." />
            <MetricCard label="Stale pull requests" value={countValue(pulls.staleOpenPRs)} caption={`Open pull requests at or beyond the ${analysis.thresholdsUsed?.prDays ?? 'configured'}-day inactivity threshold.`} className="metric-warning" />
            <MetricCard label="Commits · 30 days" value={countValue(activity.commits30d)} caption="Commits observed on the default branch during the last 30 days." />
          </section>

          <div className="dashboard-columns">
            <section className="surface-card score-card">
              <div className="section-heading"><div><p className="eyebrow">EXPLAINABLE SCORING</p><h3>Score components</h3></div><span className={`status-pill status-${analysis.scoreStatus}`}>{analysis.scoreStatus === 'partial' ? 'Partial score' : analysis.scoreStatus === 'complete' ? 'Complete score' : 'Insufficient data'}</span></div>
              <p className="fine-print">This DevFlow-defined heuristic is not an official GitHub metric or a measure of code quality.</p>
              <div className="component-list">
                {Object.entries(breakdown).map(([key, component]) => (
                  <div className="component-row" key={key}>
                    <div className="component-topline"><strong>{componentLabels[key] || key}</strong><span>{component.available && component.score != null ? `${component.score}/100` : 'Unavailable'}</span></div>
                    <div className="component-track"><span style={{ width: `${component.available && component.score != null ? component.score : 0}%` }} /></div>
                    <div className="component-explanation"><span>Weight {(Number(component.weight) * 100).toFixed(0)}%</span><span>{component.explanation || 'No explanation was stored for this component.'}</span></div>
                    {component.partialWindow && <span className="warning-inline">The observed issue window is partial because the fetch cap may have cut it short.</span>}
                  </div>
                ))}
              </div>
            </section>

            <section className="surface-card recommendations-card">
              <div className="section-heading"><div><p className="eyebrow">RULE-BASED SIGNALS</p><h3>Top recommendations</h3></div><span className="subtle-count">{recommendations.length} measured</span></div>
              {recommendations.length === 0 ? (
                <div className="inline-empty"><Sparkles size={18} /><p>No recommendations were triggered by the observed data.</p></div>
              ) : (
                <div className="recommendation-list">
                  {recommendations.slice(0, 3).map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} />)}
                </div>
              )}
            </section>
          </div>

          {analysis.dataWarnings?.length > 0 && (
            <section className="data-warning"><AlertTriangle size={16} /><div><strong>Data notes</strong><ul>{analysis.dataWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></section>
          )}

          <section className="surface-card history-card">
            <div className="section-heading"><div><p className="eyebrow">SAVED REPORTS</p><h3>Recent analysis history</h3></div><Link to={`/repositories/${selectedRepo._id}/history`} className="text-link">View history <ArrowRight size={14} /></Link></div>
            {history.length === 0 ? (
              <div className="inline-empty"><History size={18} /><p>No stored reports are available yet.</p></div>
            ) : (
              <div className="history-list">
                {history.slice(0, 5).map((snapshot) => (
                  <Link className="history-row" key={snapshot._id} to={`/analyses/${snapshot._id}`}>
                    <span className="history-icon"><History size={16} /></span>
                    <span className="history-detail"><strong>{formatDate(snapshot.analyzedAt)}</strong><small>Historical snapshot · issue threshold {snapshot.thresholdsUsed?.issueDays ?? 'Unavailable'}d · PR threshold {snapshot.thresholdsUsed?.prDays ?? 'Unavailable'}d</small></span>
                    <span className={`history-score ${snapshot.healthScore == null ? 'score-unavailable' : ''}`}>{snapshot.healthScore == null ? '—' : `${snapshot.healthScore}/100`}</span>
                    <ArrowRight size={15} className="history-arrow" />
                  </Link>
                ))}
              </div>
            )}
          </section>
          <p className="source-footnote">Source: stored analysis snapshot · {formatDate(analysis.analyzedAt)}. Counts reflect the observation scope stored with this report.</p>
        </>
      )}
    </div>
  );
}

function DashboardIntro() {
  return (
    <section className="dashboard-intro surface-card" aria-labelledby="dashboard-intro-title">
      <div className="dashboard-intro-copy">
        <p className="eyebrow">WHAT DEVFLOW DOES</p>
        <h2 id="dashboard-intro-title">Repository health, made explainable.</h2>
        <p>DevFlow turns public GitHub activity into a clear view of recent commits, inactive issues and pull requests, and evidence-based recommendations.</p>
        <p className="dashboard-intro-note">Its health score is a DevFlow-defined heuristic, not an official GitHub metric or a measure of code quality.</p>
      </div>
      <div className="dashboard-punchlines" aria-label="DevFlow punchlines">
        <p><Quote size={15} aria-hidden="true" /> Less guesswork. Clearer signals.</p>
        <p><Quote size={15} aria-hidden="true" /> Spot stale work. Find the next step.</p>
        <p><Quote size={15} aria-hidden="true" /> Make decisions with evidence.</p>
      </div>
    </section>
  );
}

function MetricCard({ label, value, suffix, caption, className = '' }) {
  return (
    <article className={`metric-card ${className}`} title={caption}>
      <div className="metric-label">{label}<span className="metric-info" aria-label={caption}>i</span></div>
      <div className="metric-value">{value}<small>{suffix}</small></div>
      <p>{caption}</p>
    </article>
  );
}

function RecommendationCard({ recommendation }) {
  return (
    <article className="recommendation-item">
      <div className="recommendation-title"><span className={`severity-dot severity-${recommendation.severity}`} /><strong>{recommendation.title}</strong><span className={`severity-label severity-text-${recommendation.severity}`}>{recommendation.severity}</span></div>
      <p>{recommendation.description}</p>
      {recommendation.evidence && <div className="recommendation-evidence"><strong>Evidence</strong><span>{recommendation.evidence}</span></div>}
      {recommendation.suggestedAction && <p className="recommendation-action">Next step: {recommendation.suggestedAction}</p>}
      {recommendation.relatedUrl && <a href={recommendation.relatedUrl} target="_blank" rel="noreferrer" className="text-link">Open related GitHub page <ArrowRight size={13} /></a>}
    </article>
  );
}
