import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/contexts/ToastContext';
import WorkItemsPage from '../src/pages/WorkItemsPage';

const issueRows = [
  {
    id: 1,
    number: 12,
    title: 'Old stale issue',
    state: 'open',
    author: 'octocat',
    updatedAt: '2020-01-01T00:00:00.000Z',
    htmlUrl: 'https://github.com/octocat/hello-world/issues/12',
    labels: ['bug'],
    inactivityDays: 100,
    isStale: true,
  },
  {
    id: 2,
    number: 13,
    title: 'Recently updated issue',
    state: 'open',
    author: 'hubot',
    updatedAt: '2026-10-26T00:00:00.000Z',
    htmlUrl: 'https://github.com/octocat/hello-world/issues/13',
    labels: ['help wanted'],
    inactivityDays: 1,
    isStale: false,
  },
];

function response(data) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

describe('work item filters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows only stale issues when the stale filter is applied', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/v1/preferences') {
        return response({ staleIssueDays: 14, stalePullRequestDays: 7 });
      }
      const requestUrl = new URL(url, 'http://localhost');
      const stale = requestUrl.searchParams.get('stale');
      const items = stale === 'all' ? issueRows : issueRows.filter((issue) => String(issue.isStale) === stale);
      return response({
        issues: items,
        pagination: { page: 1, limit: 25, total: items.length, pages: 1 },
        source: 'live',
        fetchedAt: '2026-10-27T10:00:00.000Z',
        thresholdDays: 14,
        availableLabels: ['bug', 'help wanted'],
        dataWarnings: [],
        observationScope: { complete: true, fetched: 2, capped: false, warnings: [], stateScope: 'all-states' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ToastProvider>
          <WorkItemsPage kind="issues" repository={{ _id: 'repo-1', fullName: 'octocat/hello-world' }} />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Old stale issue')).toBeInTheDocument();
    expect(screen.getByText('Recently updated issue')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Stale status' }), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('stale=true'), expect.any(Object)));
    expect(await screen.findByText('Old stale issue')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Recently updated issue')).not.toBeInTheDocument());
    expect(screen.getByText('Stale', { selector: '.stale-badge' })).toBeInTheDocument();
  });
});
