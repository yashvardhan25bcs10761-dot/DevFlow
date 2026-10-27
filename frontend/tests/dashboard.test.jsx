import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import Navbar from '../src/components/Navbar';
import Dashboard from '../src/pages/Dashboard';

const repository = { _id: 'repo-1', fullName: 'octocat/Hello-World' };

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Navbar />}>
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>
            <Route path="/login" element={<h1>Login page</h1>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function defaultFetch(url) {
  if (url === '/api/v1/auth/me') {
    return jsonResponse({ success: true, data: { user: { id: 'user-1', name: 'Tester', email: 'test@example.com' } } });
  }
  if (url === '/api/v1/repositories') return jsonResponse({ success: true, data: [repository] });
  if (url === '/api/v1/preferences') return jsonResponse({ success: true, data: { defaultRepositoryId: repository._id } });
  if (url === `/api/v1/repositories/${repository._id}/analysis-history?page=1&limit=5`) {
    return jsonResponse({ success: true, data: { history: [] } });
  }
  return jsonResponse({ success: true, data: null }, { ok: false, status: 404 });
}

describe('Dashboard required states', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a loading status while repository data is pending', async () => {
    let finishRepositories;
    const pendingRepositories = new Promise((resolve) => { finishRepositories = resolve; });
    vi.stubGlobal('fetch', vi.fn((url) => url === '/api/v1/repositories' ? pendingRepositories : Promise.resolve(defaultFetch(url))));

    renderDashboard();
    expect(await screen.findByRole('status')).toHaveTextContent(/loading repository analysis/i);

    finishRepositories(jsonResponse({ success: true, data: [] }));
    expect(await screen.findByText(/Your engineering overview starts here/i)).toBeInTheDocument();
  });

  it('shows the empty state when there are no saved repositories', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      url === '/api/v1/repositories' ? jsonResponse({ success: true, data: [] }) : defaultFetch(url),
    )));

    renderDashboard();
    expect(await screen.findByText(/Your engineering overview starts here/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse repositories/i })).toHaveAttribute('href', '/repositories');
  });

  it('explains DevFlow and shows its punchlines on the dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(defaultFetch(url))));

    renderDashboard();
    expect(await screen.findByRole('heading', { name: /Repository health, made explainable/i })).toBeInTheDocument();
    expect(screen.getByText(/public GitHub activity into a clear view/i)).toBeInTheDocument();
    expect(screen.getByText(/not an official GitHub metric/i)).toBeInTheDocument();
    expect(screen.getByText(/Less guesswork\. Clearer signals\./)).toBeInTheDocument();
    expect(screen.getByText(/Make decisions with evidence\./)).toBeInTheDocument();
  });

  it('shows an actionable error when the latest analysis request fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      url === `/api/v1/repositories/${repository._id}/latest-analysis`
        ? jsonResponse({ success: false, error: { message: 'Service temporarily unavailable.' } }, { ok: false, status: 503 })
        : defaultFetch(url),
    )));

    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load dashboard data/i);
    expect(screen.getByText(/Service temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });
});

describe('Authenticated layout logout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens, filters, and selects from the styled repository menu', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(defaultFetch(url))));

    renderDashboard();
    await screen.findByRole('heading', { name: /No analysis snapshot yet/i });
    fireEvent.click(screen.getByRole('button', { name: 'Select repository' }));

    expect(screen.getByRole('dialog', { name: /Choose a saved repository/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select octocat\/Hello-World/i })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: /Filter saved repositories/i }), { target: { value: 'missing' } });
    expect(screen.getByText(/No saved repositories match/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /Filter saved repositories/i }), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /Select octocat\/Hello-World/i }));
    expect(screen.queryByRole('dialog', { name: /Choose a saved repository/i })).not.toBeInTheDocument();
  });

  it('clears the session and returns the user to login', async () => {
    const fetchMock = vi.fn((url) => Promise.resolve(defaultFetch(url)));
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/v1/auth/logout') return Promise.resolve(jsonResponse({ success: true }));
      return Promise.resolve(defaultFetch(url, options));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard();
    await screen.findByRole('heading', { name: /No analysis snapshot yet/i });
    fireEvent.click(screen.getByRole('button', { name: /Tester/i }));
    fireEvent.click(screen.getByRole('button', { name: /Sign out/i }));

    expect(await screen.findByRole('heading', { name: /Login page/i })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST' })));
  });
});
