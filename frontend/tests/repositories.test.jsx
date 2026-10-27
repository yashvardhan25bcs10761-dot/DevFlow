import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import Repositories from '../src/pages/Repositories';

describe('Repositories Page UI (SPEC Section 11 & 12)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders search input, search button, and empty saved repositories state', async () => {
    // Mock fetch for /api/v1/repositories (empty saved repos list)
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { user: { id: 'u1', name: 'Tester', email: 'test@devflow.io' } },
          }),
        });
      }
      if (url.includes('/api/v1/repositories')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Repositories />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Repository Management')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Owner, repository name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Search$/i })).toBeInTheDocument();

    // Verify empty state appears once loaded
    await waitFor(() => {
      expect(screen.getByText(/No repositories saved yet/i)).toBeInTheDocument();
    });
  });

  it('searches for a repository and shows result card with Save button', async () => {
    const mockRepo = {
      githubId: 101,
      fullName: 'octocat/hello-world',
      description: 'The famous test repository',
      stars: 3500,
      forks: 1200,
      openIssuesCount: 45,
      visibility: 'public',
      htmlUrl: 'https://github.com/octocat/hello-world',
    };

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { user: { id: 'u1', name: 'Tester', email: 'test@devflow.io' } },
          }),
        });
      }
      if (url.includes('/api/v1/repositories/search?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { repository: mockRepo, source: 'live' },
          }),
        });
      }
      if (url.includes('/api/v1/repositories')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Repositories />
        </AuthProvider>
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Owner, repository name/i);
    fireEvent.change(input, { target: { value: 'octocat/hello-world' } });

    const searchBtn = screen.getByRole('button', { name: /^Search$/i });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(screen.getByText('octocat/hello-world')).toBeInTheDocument();
      expect(screen.getByText('The famous test repository')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save Repository/i })).toBeInTheDocument();
    });
  });

  it('shows saving state only on the repository whose save request is pending', async () => {
    const matches = [
      { githubId: 401, fullName: 'example/first', visibility: 'public', description: 'First repo', stars: 3, forks: 1, openIssuesCount: 0, htmlUrl: 'https://github.com/example/first' },
      { githubId: 402, fullName: 'example/second', visibility: 'public', description: 'Second repo', stars: 2, forks: 1, openIssuesCount: 0, htmlUrl: 'https://github.com/example/second' },
    ];
    let finishSave;
    const pendingSave = new Promise((resolve) => { finishSave = resolve; });

    global.fetch = vi.fn((url, options = {}) => {
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { user: { id: 'u1', name: 'Tester', email: 'test@devflow.io' } } }) });
      }
      if (url.includes('/api/v1/repositories/search?q=')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { repositories: matches } }) });
      }
      if (url === '/api/v1/repositories' && options.method === 'POST') return pendingSave;
      if (url === '/api/v1/repositories') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<MemoryRouter><AuthProvider><Repositories /></AuthProvider></MemoryRouter>);
    const input = screen.getByPlaceholderText(/Owner, repository name/i);
    fireEvent.change(input, { target: { value: 'example' } });
    fireEvent.submit(input.closest('form'));

    const saveButtons = await screen.findAllByRole('button', { name: /Save Repository/i });
    expect(saveButtons).toHaveLength(2);
    fireEvent.click(saveButtons[0]);

    expect(await screen.findByRole('button', { name: /Saving\.\.\./i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save Repository/i })).toBeEnabled();

    finishSave({
      ok: true,
      json: async () => ({ success: true, data: { _id: 'repo-401', fullName: 'example/first' } }),
    });
    expect(await screen.findByText('Saved in Dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Repository/i })).toBeEnabled();
  });

  it('searches by a repository name and renders selectable GitHub matches', async () => {
    const matches = [
      { githubId: 201, fullName: 'facebook/react', visibility: 'public', description: 'UI library', stars: 200, forks: 20, openIssuesCount: 5, htmlUrl: 'https://github.com/facebook/react' },
      { githubId: 202, fullName: 'react/react-native', visibility: 'public', description: 'Native apps', stars: 100, forks: 10, openIssuesCount: 3, htmlUrl: 'https://github.com/react/react-native' },
    ];
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { user: { id: 'u1', name: 'Tester', email: 'test@devflow.io' } } }) });
      }
      if (url.includes('/api/v1/repositories/search?q=')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { repositories: matches, source: 'live', fetchedAt: '2026-10-27T10:00:00.000Z' } }) });
      }
      if (url === '/api/v1/repositories') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<MemoryRouter><AuthProvider><Repositories /></AuthProvider></MemoryRouter>);
    const searchInput = screen.getByPlaceholderText(/Owner, repository name/i);
    fireEvent.change(searchInput, { target: { value: 'react' } });
    fireEvent.submit(searchInput.closest('form'));

    expect(await screen.findByText('facebook/react')).toBeInTheDocument();
    expect(screen.getByText('react/react-native')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Save Repository/i })).toHaveLength(2);
    expect(screen.getByText(/live/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear repository search/i }));
    expect(screen.getByPlaceholderText(/Owner, repository name/i)).toHaveValue('');
    expect(screen.queryByText('facebook/react')).not.toBeInTheDocument();
  });

  it('loads more matching repositories without replacing the first result page', async () => {
    const firstRepo = { githubId: 301, fullName: 'example/rea-first', description: 'First match', visibility: 'public', stars: 3, forks: 1, openIssuesCount: 0, htmlUrl: 'https://github.com/example/rea-first' };
    const secondRepo = { githubId: 302, fullName: 'example/rea-second', description: 'Second match', visibility: 'public', stars: 2, forks: 1, openIssuesCount: 0, htmlUrl: 'https://github.com/example/rea-second' };
    global.fetch = vi.fn((url) => {
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { user: { id: 'u1', name: 'Tester', email: 'test@devflow.io' } } }) });
      }
      if (url.includes('/api/v1/repositories/search?q=')) {
        const secondPage = url.includes('page=2');
        return Promise.resolve({ ok: true, json: async () => ({
          success: true,
          data: { repositories: [secondPage ? secondRepo : firstRepo], source: 'live', fetchedAt: '2026-10-27T10:00:00.000Z', page: secondPage ? 2 : 1, totalCount: 2, hasMore: !secondPage },
        }) });
      }
      if (url === '/api/v1/repositories') return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<MemoryRouter><AuthProvider><Repositories /></AuthProvider></MemoryRouter>);
    const input = screen.getByPlaceholderText(/Owner, repository name/i);
    fireEvent.change(input, { target: { value: 'rea' } });
    fireEvent.submit(input.closest('form'));

    expect(await screen.findByText('example/rea-first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Load more matching repositories/i }));

    expect(await screen.findByText('example/rea-second')).toBeInTheDocument();
    expect(screen.getByText('example/rea-first')).toBeInTheDocument();
    expect(screen.getByText(/2 public repositories loaded/)).toBeInTheDocument();
  });

  it('confirms removal, calls the owned repository endpoint, and updates the saved list', async () => {
    const savedRepository = {
      _id: 'repo-123',
      fullName: 'octocat/Hello-World',
      description: 'A saved test repository',
      stars: 10,
      forks: 2,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/octocat/Hello-World',
    };
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: { user: { id: 'u1', name: 'Tester', email: 'test@devflow.io' } } }),
        });
      }
      if (url === '/api/v1/repositories' && !options.method) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [savedRepository] }) });
      }
      if (url === `/api/v1/repositories/${savedRepository._id}` && options.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    global.fetch = fetchMock;
    const browserConfirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <AuthProvider><Repositories /></AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('A saved test repository')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('octocat/Hello-World');
    expect(browserConfirmSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep repository' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      `/api/v1/repositories/${savedRepository._id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/repositories/${savedRepository._id}`,
        expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
      );
    });
    expect(await screen.findByText(/No repositories saved yet/i)).toBeInTheDocument();
  });
});
