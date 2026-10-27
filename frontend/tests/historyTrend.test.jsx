import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoryTrend } from '../src/pages/AnalysisHistory';

const snapshots = [
  { _id: 'older', analyzedAt: '2026-10-20T12:00:00.000Z', healthScore: 42 },
  { _id: 'newer', analyzedAt: '2026-10-27T12:00:00.000Z', healthScore: 68 },
];

describe('analysis history trend chart', () => {
  it('renders a trend from at least two stored snapshots', () => {
    const { container } = render(<HistoryTrend snapshots={snapshots} />);
    expect(screen.getByRole('img', { name: /stored repository health score trend/i })).toBeInTheDocument();
    expect(container.querySelectorAll('.chart-point')).toHaveLength(2);
    expect(container.querySelectorAll('.chart-trend-line')).toHaveLength(1);
  });

  it('renders no chart with fewer than two snapshots', () => {
    const { container } = render(<HistoryTrend snapshots={[snapshots[0]]} />);
    expect(screen.queryByRole('img', { name: /stored repository health score trend/i })).not.toBeInTheDocument();
    expect(container.querySelector('.history-chart')).not.toBeInTheDocument();
  });
});
