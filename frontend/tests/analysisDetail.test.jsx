import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AnalysisDetail from '../src/pages/AnalysisDetail';

const snapshot = {
  _id: 'analysis-1',
  repositoryId: 'repo-1',
  analyzedAt: '2026-10-27T12:00:00.000Z',
  healthScore: 64,
  scoreStatus: 'partial',
  scoreBreakdown: {},
  repositoryMetrics: {},
  activitySummary: {},
  issueSummary: {},
  pullRequestSummary: {},
  staleIssues: [],
  stalePullRequests: [],
  dataWarnings: [],
  thresholdsUsed: { issueDays: 14, prDays: 7 },
  observationScope: { complete: true },
  recommendations: [{
    id: 'R1',
    category: 'issue-management',
    severity: 'high',
    title: 'Triage stale issues',
    description: 'Several observed open issues are inactive.',
    evidence: '3 of 5 observed open issues are stale.',
    suggestedAction: 'Review and close resolved issues.',
    relatedUrl: 'https://github.com/octocat/Hello-World/issues',
  }],
};

describe('historical analysis report', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders stored recommendation title, severity, evidence, action, and link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: snapshot }),
    }));

    render(
      <MemoryRouter initialEntries={['/analyses/analysis-1']}>
        <Routes>
          <Route path="/analyses/:analysisId" element={<AnalysisDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Recommendations (1)' })).toBeInTheDocument();
    expect(screen.getByText('Triage stale issues')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('Several observed open issues are inactive.')).toBeInTheDocument();
    expect(screen.getByText('3 of 5 observed open issues are stale.')).toBeInTheDocument();
    expect(screen.getByText('Suggested action: Review and close resolved issues.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open related GitHub page' })).toHaveAttribute(
      'href',
      snapshot.recommendations[0].relatedUrl,
    );
  });
});
