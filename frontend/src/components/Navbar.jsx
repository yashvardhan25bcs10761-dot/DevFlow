import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Check, ChevronDown, CircleDot, FolderGit2, GitFork, GitPullRequest, History, LayoutDashboard, LogOut, Menu, RefreshCw, Search, Settings as SettingsIcon, Star, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ThemePicker from './ThemePicker';
import { apiRequest, formatError } from '../services/api';

const RepositoryLayoutContext = createContext(null);

export function useRepositoryLayout() {
  const value = useContext(RepositoryLayoutContext);
  if (!value) throw new Error('useRepositoryLayout must be used inside the authenticated layout');
  return value;
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState([]);
  const [repositoriesLoading, setRepositoriesLoading] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [repositoriesError, setRepositoriesError] = useState('');
  const [selectedRepoId, setSelectedRepoIdState] = useState('');
  const [defaultRepositoryId, setDefaultRepositoryIdState] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const reloadRepositories = useCallback(async () => {
    setRepositoriesLoading(true);
    setRepositoriesError('');
    try {
      const data = await apiRequest('/api/v1/repositories');
      setRepositories(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      setRepositoriesError(formatError(error));
      addToast(formatError(error), 'error');
      return [];
    } finally {
      setRepositoriesLoading(false);
    }
  }, [addToast]);

  useEffect(() => { reloadRepositories(); }, [reloadRepositories]);

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/preferences')
      .then((preferences) => {
        if (active) setDefaultRepositoryIdState(preferences?.defaultRepositoryId || '');
      })
      .catch(() => {
        if (active) setDefaultRepositoryIdState('');
      })
      .finally(() => {
        if (active) setPreferencesLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onReposChanged = () => reloadRepositories();
    const onUnauthorized = () => navigate('/login', { replace: true, state: { from: location.pathname } });
    window.addEventListener('devflow:repositories-changed', onReposChanged);
    window.addEventListener('devflow:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('devflow:repositories-changed', onReposChanged);
      window.removeEventListener('devflow:unauthorized', onUnauthorized);
    };
  }, [location.pathname, navigate, reloadRepositories]);

  useEffect(() => {
    if (repositoriesLoading || preferencesLoading) return;
    const routeMatch = location.pathname.match(/^\/repositories\/([^/]+)(?:\/|$)/);
    const routeRepo = routeMatch && repositories.find((repo) => repo._id === routeMatch[1]);
    const savedId = window.localStorage.getItem('devflow.selectedRepositoryId');
    const savedRepo = repositories.find((repo) => repo._id === savedId);
    const defaultRepo = repositories.find((repo) => repo._id === defaultRepositoryId);
    const nextId = routeRepo?._id || defaultRepo?._id || savedRepo?._id || repositories[0]?._id || '';
    setSelectedRepoIdState(nextId);
    if (nextId) window.localStorage.setItem('devflow.selectedRepositoryId', nextId);
    else window.localStorage.removeItem('devflow.selectedRepositoryId');
  }, [defaultRepositoryId, location.pathname, preferencesLoading, repositories, repositoriesLoading]);

  const selectedRepo = repositories.find((repo) => repo._id === selectedRepoId) || null;
  const setSelectedRepoId = useCallback((id) => {
    setSelectedRepoIdState(id);
    if (id) window.localStorage.setItem('devflow.selectedRepositoryId', id);
    else window.localStorage.removeItem('devflow.selectedRepositoryId');
    if (/^\/repositories\/[^/]+(?:\/|$)/.test(location.pathname) && id) navigate(`/repositories/${id}`);
  }, [location.pathname, navigate]);

  const setDefaultRepositoryId = useCallback((id) => {
    const nextId = id || '';
    setDefaultRepositoryIdState(nextId);
    if (nextId) setSelectedRepoId(nextId);
  }, [setSelectedRepoId]);

  const refreshRepository = async () => {
    if (!selectedRepo) {
      setRefreshTick((value) => value + 1);
      window.dispatchEvent(new Event('devflow:refresh'));
      addToast('Dashboard data refreshed.', 'success');
      return;
    }
    setRefreshing(true);
    try {
      const updated = await apiRequest(`/api/v1/repositories/${selectedRepo._id}/refresh`, {
        method: 'POST',
        onSlow: () => addToast('The server is waking up. This can take up to a minute on an idle service.', 'info'),
      });
      setRepositories((current) => current.map((repo) => repo._id === updated._id ? updated : repo));
      setRefreshTick((value) => value + 1);
      window.dispatchEvent(new Event('devflow:refresh'));
      addToast(`Refreshed metadata for ${updated.fullName}.`, 'success');
    } catch (error) {
      addToast(formatError(error), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const pageTitle = location.pathname === '/dashboard' ? 'Dashboard'
    : location.pathname === '/repositories' ? 'Repositories'
      : location.pathname === '/issues' ? 'Issues'
        : location.pathname === '/pull-requests' ? 'Pull requests'
      : location.pathname === '/settings' ? 'Settings'
        : location.pathname.includes('/history') ? 'Analysis history'
        : location.pathname.startsWith('/analyses/') ? 'Analysis report'
          : 'Repository details';
  const layoutValue = useMemo(() => ({
    repositories, repositoriesLoading, repositoriesError, reloadRepositories, selectedRepo, selectedRepoId,
    setSelectedRepoId, refreshTick, defaultRepositoryId, setDefaultRepositoryId,
  }), [repositories, repositoriesLoading, repositoriesError, reloadRepositories, selectedRepo, selectedRepoId, setSelectedRepoId, refreshTick, defaultRepositoryId, setDefaultRepositoryId]);

  return (
    <RepositoryLayoutContext.Provider value={layoutValue}>
      <div className="app-shell">
        {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
        <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
          <Link className="brand" to="/dashboard" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark"><Activity size={19} /></span><span>DevFlow</span>
          </Link>
          <div className="sidebar-label">Workspace</div>
          <nav className="sidebar-nav" aria-label="Main navigation">
            <NavLink to="/dashboard" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <LayoutDashboard size={17} /> <span>Dashboard</span>
            </NavLink>
            <NavLink to="/repositories" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <FolderGit2 size={17} /> <span>Repositories</span>
            </NavLink>
            <NavLink to="/issues" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <CircleDot size={17} /> <span>Issues</span>
            </NavLink>
            <NavLink to="/pull-requests" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <GitPullRequest size={17} /> <span>Pull requests</span>
            </NavLink>
            <NavLink to={selectedRepo ? `/repositories/${selectedRepo._id}/history` : '/history'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <History size={17} /> <span>Analysis history</span>
            </NavLink>
            <NavLink to="/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <SettingsIcon size={17} /> <span>Settings</span>
            </NavLink>
          </nav>
          <div className="sidebar-bottom">
            <span className="sidebar-caption">Repository health, made explainable.</span>
            <span className="version-label">DevFlow · Public repositories</span>
          </div>
        </aside>

        <div className="main-column">
          <header className="topbar">
            <button className="icon-button mobile-menu-button" type="button" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div className="topbar-title"><span className="eyebrow">DEVFLOW / WORKSPACE</span><h1>{pageTitle}</h1></div>
            <div className="topbar-actions">
              <ThemePicker />
              <RepositorySelector
                repositories={repositories}
                selectedRepo={selectedRepo}
                selectedRepoId={selectedRepoId}
                loading={repositoriesLoading}
                onSelect={setSelectedRepoId}
              />
              <button className="button button-secondary topbar-refresh" type="button" onClick={refreshRepository} disabled={refreshing || repositoriesLoading} title={selectedRepo ? 'Refresh repository metadata from GitHub' : 'Refresh dashboard data'}>
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} /><span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
              </button>
              <div className="user-menu-wrap">
                <button className="user-menu-trigger" type="button" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}>
                  <span className="user-avatar">{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</span>
                  <span className="user-name">{user?.name || user?.email || 'Account'}</span>
                  <ChevronDown size={14} />
                </button>
                {userMenuOpen && <div className="user-menu"><span className="user-email">{user?.email}</span><button type="button" onClick={handleLogout}><LogOut size={15} /> Sign out</button></div>}
              </div>
            </div>
          </header>
          <main className="page-content">
            <Outlet />
          </main>
        </div>
      </div>
    </RepositoryLayoutContext.Provider>
  );
}

function RepositorySelector({ repositories, selectedRepo, selectedRepoId, loading, onSelect }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const filteredRepositories = repositories.filter((repository) => (
    `${repository.fullName || ''} ${repository.description || ''}`.toLowerCase().includes(filter.trim().toLowerCase())
  ));

  function selectRepository(repositoryId) {
    onSelect(repositoryId);
    setOpen(false);
    setFilter('');
    triggerRef.current?.focus();
  }

  return (
    <div className="repo-select-wrap">
      <button
        ref={triggerRef}
        className="repo-select-trigger"
        type="button"
        aria-label="Select repository"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setFilter('');
          setOpen((wasOpen) => !wasOpen);
        }}
        disabled={loading || repositories.length === 0}
      >
        <span className="repo-select-icon"><FolderGit2 size={16} aria-hidden="true" /></span>
        <span className="repo-select-current">{loading ? 'Loading repositories…' : selectedRepo?.fullName || 'No repositories'}</span>
        <ChevronDown className={`repo-select-chevron ${open ? 'repo-select-chevron-open' : ''}`} size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="repo-select-menu" role="dialog" aria-label="Choose a saved repository" ref={menuRef}>
          <div className="repo-select-menu-heading">
            <div><strong>Switch repository</strong><span>{repositories.length} saved {repositories.length === 1 ? 'repository' : 'repositories'}</span></div>
            <button type="button" className="icon-button repo-select-close" onClick={() => setOpen(false)} aria-label="Close repository menu"><X size={15} /></button>
          </div>
          <label className="repo-select-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Filter saved repositories"
              placeholder="Find a repository…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  menuRef.current?.querySelector('.repo-select-option')?.focus();
                }
              }}
              autoFocus
            />
          </label>
          <div className="repo-select-options" role="group" aria-label="Saved repositories">
            {filteredRepositories.map((repository) => {
              const isSelected = repository._id === selectedRepoId;
              return (
                <button
                  className={`repo-select-option ${isSelected ? 'repo-select-option-active' : ''}`}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Select ${repository.fullName}`}
                  key={repository._id}
                  onClick={() => selectRepository(repository._id)}
                >
                  <span className="repo-option-mark"><FolderGit2 size={15} aria-hidden="true" /></span>
                  <span className="repo-option-details">
                    <strong>{repository.fullName}</strong>
                    <small>{repository.description || 'No description available'}</small>
                    <span className="repo-option-stats">
                      {Number.isFinite(repository.stars) && <span><Star size={11} /> {repository.stars.toLocaleString()}</span>}
                      {Number.isFinite(repository.forks) && <span><GitFork size={11} /> {repository.forks.toLocaleString()}</span>}
                    </span>
                  </span>
                  {isSelected && <Check className="repo-option-check" size={15} aria-label="Currently selected" />}
                </button>
              );
            })}
            {filteredRepositories.length === 0 && (
              <p className="repo-select-no-results">No saved repositories match “{filter}”.</p>
            )}
          </div>
          <div className="repo-select-menu-footer">Choose a repository to update your workspace view</div>
        </div>
      )}
    </div>
  );
}
