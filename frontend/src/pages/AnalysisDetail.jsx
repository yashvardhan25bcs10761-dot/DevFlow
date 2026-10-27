import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { apiRequest, formatError } from '../services/api';

/**
 * AnalysisDetail — displays one stored analysis snapshot.
 * Reads stored values only; never recomputes.
 */
export default function AnalysisDetail() {
  const { analysisId } = useParams();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest(`/api/v1/analyses/${analysisId}`)
      .then(setAnalysis)
      .catch((requestError) => setError(formatError(requestError)))
      .finally(() => setLoading(false));
  }, [analysisId]);

  function scoreColor(score) {
    if (score === null || score === undefined) return '#6b7280';
    if (score >= 75) return '#16a34a';
    if (score >= 50) return '#ca8a04';
    return '#dc2626';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1rem', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#6b7280' }}>Loading analysis…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1rem', fontFamily: 'sans-serif' }}>
        <Link to="/repositories" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Back to Repositories
        </Link>
        <p style={{ color: '#dc2626', marginTop: '1rem' }}>{error}</p>
      </div>
    );
  }

  const {
    healthScore,
    scoreStatus,
    scoreBreakdown,
    repositoryMetrics,
    activitySummary,
    issueSummary,
    pullRequestSummary,
    staleIssues,
    stalePullRequests,
    recommendations,
    dataWarnings,
    thresholdsUsed,
    observationScope,
    analyzedAt,
    repositoryId,
  } = analysis;

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1rem', fontFamily: 'sans-serif' }}>
      {/* Back link */}
      <div style={{ marginBottom: '1rem' }}>
        <Link
          to={`/repositories/${repositoryId}/history`}
          style={{ color: '#2563eb', fontSize: 14 }}
        >
          ← Back to Analysis History
        </Link>
      </div>

      <div className="historical-snapshot-banner" role="note">
        <History size={16} />
        <span><strong>Historical snapshot</strong> · Stored values from {formatDate(analyzedAt)}. This report is not recalculated from current GitHub data.</span>
      </div>

      {/* Header with score */}
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: '1.5rem',
          background: '#fff',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={{ margin: 0, marginBottom: 4 }}>Health Score</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
            Analyzed on {formatDate(analyzedAt)}
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: 12, color: '#9ca3af' }}>
            Status: <strong>{scoreStatus}</strong> &nbsp;|&nbsp; Thresholds: issues stale after{' '}
            {thresholdsUsed?.issueDays}d, PRs stale after {thresholdsUsed?.prDays}d
          </p>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: scoreColor(healthScore),
            lineHeight: 1,
          }}
        >
          {healthScore !== null && healthScore !== undefined
            ? healthScore.toFixed(1)
            : 'N/A'}
        </div>
      </div>

      {/* DevFlow disclaimer */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          fontSize: 13,
          color: '#1d4ed8',
        }}
      >
        ℹ️ The DevFlow health score is a <strong>custom heuristic</strong> — not an official GitHub
        metric or a measure of code quality.
      </div>

      {/* Score Breakdown */}
      {scoreBreakdown && (
        <Section title="Score Breakdown">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Object.entries(scoreBreakdown).map(([key, comp]) => (
              <div
                key={key}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: '0.75rem 1rem',
                  background: comp.available ? '#f9fafb' : '#fafafa',
                  opacity: comp.available ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    marginBottom: 4,
                    textTransform: 'capitalize',
                  }}
                >
                  {key.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: comp.available ? '#1d4ed8' : '#9ca3af' }}>
                  {comp.available && comp.score !== null ? comp.score.toFixed(1) : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  Weight: {(comp.weight * 100).toFixed(0)}% &nbsp;|&nbsp;{' '}
                  {comp.available ? 'Available' : 'No data'}
                </div>
                {comp.explanation && (
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                    {comp.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Metrics summary */}
      <Section title="Repository Metrics">
        <MetricRow label="Stars" value={repositoryMetrics?.stars ?? '—'} />
        <MetricRow label="Forks" value={repositoryMetrics?.forks ?? '—'} />
        <MetricRow label="Open Issues (GitHub)" value={repositoryMetrics?.openIssuesCount ?? '—'} />
        <MetricRow label="Commits (30d)" value={activitySummary?.commits30d ?? '—'} />
        <MetricRow label="Active Authors (30d)" value={activitySummary?.activeAuthorsCount ?? '—'} />
      </Section>

      {/* Issue Summary */}
      <Section title="Issue Summary">
        <MetricRow label="Total Observed" value={issueSummary?.totalObserved ?? '—'} />
        <MetricRow label="Open" value={issueSummary?.observedOpenIssues ?? '—'} />
        <MetricRow label="Closed" value={issueSummary?.observedClosedIssues ?? '—'} />
        <MetricRow
          label={`Stale Open (>${thresholdsUsed?.issueDays}d inactive)`}
          value={issueSummary?.staleOpenIssues ?? '—'}
          highlight={issueSummary?.staleOpenIssues > 0}
        />
      </Section>

      {/* PR Summary */}
      <Section title="Pull Request Summary">
        <MetricRow label="Total Observed" value={pullRequestSummary?.totalObserved ?? '—'} />
        <MetricRow label="Open" value={pullRequestSummary?.observedOpenPRs ?? '—'} />
        <MetricRow
          label={`Stale Open (>${thresholdsUsed?.prDays}d inactive)`}
          value={pullRequestSummary?.staleOpenPRs ?? '—'}
          highlight={pullRequestSummary?.staleOpenPRs > 0}
        />
        <MetricRow label="Drafts" value={pullRequestSummary?.draftPRs ?? '—'} />
      </Section>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <Section title={`Recommendations (${recommendations.length})`}>
          <div className="recommendation-list">
            {recommendations.map((rec, index) => {
              const severity = rec.severity || rec.priority;
              const title = rec.title || rec.message || 'Recommendation details unavailable';
              return (
                <article className="recommendation-item" key={rec.id || index}>
                  <div className="recommendation-title">
                    <span className={`severity-dot severity-${severity || 'unknown'}`} />
                    <strong>{title}</strong>
                    <span className={`severity-label severity-text-${severity || 'unknown'}`}>
                      {severity || 'Severity unavailable'}
                    </span>
                  </div>
                  {rec.description && <p>{rec.description}</p>}
                  {rec.evidence && (
                    <div className="recommendation-evidence">
                      <strong>Evidence</strong><span>{rec.evidence}</span>
                    </div>
                  )}
                  {rec.suggestedAction && <p className="recommendation-action">Suggested action: {rec.suggestedAction}</p>}
                  {rec.relatedUrl && (
                    <a className="text-link" href={rec.relatedUrl} target="_blank" rel="noreferrer">
                      Open related GitHub page
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </Section>
      )}

      {/* Stale Issues */}
      {staleIssues && staleIssues.length > 0 && (
        <Section title={`Stale Issues (${staleIssues.length})`}>
          {staleIssues.map((issue) => (
            <StaleItem key={issue.id} item={issue} type="issue" />
          ))}
        </Section>
      )}

      {/* Stale PRs */}
      {stalePullRequests && stalePullRequests.length > 0 && (
        <Section title={`Stale Pull Requests (${stalePullRequests.length})`}>
          {stalePullRequests.map((pr) => (
            <StaleItem key={pr.id} item={pr} type="pr" />
          ))}
        </Section>
      )}

      {/* Data Warnings */}
      {dataWarnings && dataWarnings.length > 0 && (
        <Section title="Data Warnings">
          <ul style={{ padding: '0 0 0 1.25rem', margin: 0 }}>
            {dataWarnings.map((w, i) => (
              <li key={i} style={{ fontSize: 13, color: '#ca8a04', marginBottom: 4 }}>
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Observation Scope */}
      {observationScope && (
        <Section title="Observation Scope">
          <div style={{ fontSize: 13, color: '#4b5563' }}>
            <div>Complete: {observationScope.complete ? '✅ Yes' : '⚠️ No (some data was capped)'}</div>
            {observationScope.commits && (
              <div>
                Commits fetched: {observationScope.commits.fetched} / cap {observationScope.commits.cap}
                {observationScope.commits.capped ? ' (CAPPED)' : ''}
              </div>
            )}
            {observationScope.issues && (
              <div>
                Issues fetched: {observationScope.issues.fetched} / cap {observationScope.issues.cap}
                {observationScope.issues.capped ? ' (CAPPED)' : ''}
              </div>
            )}
            {observationScope.pullRequests && (
              <div>
                PRs fetched: {observationScope.pullRequests.fetched} / cap{' '}
                {observationScope.pullRequests.cap}
                {observationScope.pullRequests.capped ? ' (CAPPED)' : ''}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---- Sub-components --------------------------------------------------------

function Section({ title, children }) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '1rem 1.25rem',
        background: '#fff',
        marginBottom: '1rem',
      }}
    >
      <h3 style={{ margin: '0 0 0.75rem', fontSize: 15, color: '#111827' }}>{title}</h3>
      {children}
    </div>
  );
}

function MetricRow({ label, value, highlight }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.3rem 0',
        borderBottom: '1px solid #f3f4f6',
        fontSize: 14,
      }}
    >
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight ? '#dc2626' : '#111827' }}>{value}</span>
    </div>
  );
}

function StaleItem({ item, type }) {
  return (
    <div
      style={{
        padding: '0.5rem 0',
        borderBottom: '1px solid #f3f4f6',
        fontSize: 13,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
    >
      <div>
        <a
          href={item.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2563eb', fontWeight: 500 }}
        >
          #{item.number} {item.title}
        </a>
        <div style={{ color: '#9ca3af', marginTop: 2 }}>
          by {item.author} · last updated {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}
          {type === 'pr' && item.isDraft && ' (draft)'}
        </div>
      </div>
      <span
        style={{
          background: '#fee2e2',
          color: '#dc2626',
          padding: '2px 8px',
          borderRadius: 999,
          fontWeight: 600,
          fontSize: 12,
          whiteSpace: 'nowrap',
          marginLeft: 8,
        }}
      >
        {item.inactivityDays}d
      </span>
    </div>
  );
}
