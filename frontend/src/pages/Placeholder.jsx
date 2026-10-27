import React, { useState, useEffect } from 'react';
import { Activity, GitPullRequest, GitFork, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function Placeholder() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function checkBackendHealth() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/health');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      setHealthData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkBackendHealth();
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '4rem auto', padding: '0 1.5rem' }}>
      <header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Activity size={36} color="var(--accent-color)" />
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.025em' }}>DevFlow</h1>
        </div>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>
          Understand your repositories. Identify risks. Make better engineering decisions.
        </p>
      </header>

      <section
        style={{
          background: 'var(--card-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>API Gateway & Health Status</h2>
          <button
            onClick={checkBackendHealth}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--elevated-color)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '0.5rem 0.85rem',
              fontSize: '0.875rem',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {loading && (
          <p style={{ color: 'var(--text-muted)' }}>Pinging backend at /api/v1/health via Vite proxy...</p>
        )}

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              color: 'var(--error-color)',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            <AlertCircle size={20} />
            <div>
              <strong>Failed to reach backend proxy:</strong>
              <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</div>
            </div>
          </div>
        )}

        {healthData && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              background: 'var(--elevated-color)',
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-color)' }}>
              <CheckCircle2 size={18} />
              <span style={{ fontWeight: 600 }}>Backend Connected (Phase 1 Skeleton Active)</span>
            </div>
            <pre
              style={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                background: 'var(--bg-color)',
                padding: '1rem',
                borderRadius: '6px',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(healthData, null, 2)}
            </pre>
          </div>
        )}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          style={{
            background: 'var(--card-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <GitPullRequest size={18} color="var(--accent-color)" />
            <h3 style={{ fontSize: '1rem' }}>Explainable Scores</h3>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Transparent heuristic metrics derived strictly from measured repository activity.
          </p>
        </div>

        <div
          style={{
            background: 'var(--card-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <GitFork size={18} color="var(--accent-color)" />
            <h3 style={{ fontSize: '1rem' }}>Stale Detection</h3>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Deterministic flags for stale issues and PRs based on configurable day thresholds.
          </p>
        </div>
      </section>
    </div>
  );
}
