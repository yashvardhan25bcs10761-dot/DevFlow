import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut, Save, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRepositoryLayout } from '../components/Navbar';
import { useToast } from '../contexts/ToastContext';
import { apiRequest, formatError } from '../services/api';
import ThemePicker from '../components/ThemePicker';

const defaults = { staleIssueDays: 14, stalePullRequestDays: 7, defaultRepositoryId: '' };

export default function Settings() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { repositories, repositoriesLoading, repositoriesError, setDefaultRepositoryId } = useRepositoryLayout();
  const [values, setValues] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState({});

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/preferences')
      .then((preferences) => {
        if (active) setValues({
          staleIssueDays: preferences.staleIssueDays,
          stalePullRequestDays: preferences.stalePullRequestDays,
          defaultRepositoryId: preferences.defaultRepositoryId || '',
        });
      })
      .catch((requestError) => { if (active) setError(formatError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateValue(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setValidation((current) => ({ ...current, [name]: '' }));
  }

  async function savePreferences(event) {
    event.preventDefault();
    const nextErrors = {};
    for (const field of ['staleIssueDays', 'stalePullRequestDays']) {
      const parsed = Number(values[field]);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) nextErrors[field] = 'Enter a whole number from 1 to 365.';
    }
    setValidation(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setError('');
    try {
      const updated = await apiRequest('/api/v1/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          staleIssueDays: Number(values.staleIssueDays),
          stalePullRequestDays: Number(values.stalePullRequestDays),
          defaultRepositoryId: values.defaultRepositoryId || null,
        }),
      });
      setValues({
        staleIssueDays: updated.staleIssueDays,
        stalePullRequestDays: updated.stalePullRequestDays,
        defaultRepositoryId: updated.defaultRepositoryId || '',
      });
      setDefaultRepositoryId(updated.defaultRepositoryId || '');
      addToast('Settings saved.', 'success');
    } catch (requestError) {
      setError(formatError(requestError));
      addToast(formatError(requestError), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (loading) return <div className="loading-panel" role="status"><span className="spinner" /> Loading settings…</div>;

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div><p className="eyebrow">YOUR WORKSPACE</p><h2>Settings</h2><p className="page-description">Choose how DevFlow marks inactivity and which repository opens by default. If none is set, DevFlow uses your last selected repository.</p></div>
      </div>
      {error && <div className="data-warning" role="alert"><AlertTriangle size={16} />{error}</div>}
      {repositoriesError && <div className="data-warning" role="status"><AlertTriangle size={16} />Saved repository choices could not be loaded: {repositoriesError}</div>}

      <section className="surface-card settings-theme-card">
        <div><p className="eyebrow">APPEARANCE</p><h3>Website theme</h3><p>Choose a color palette for the whole site. Your choice is saved on this device.</p></div>
        <ThemePicker variant="settings" />
      </section>

      <form className="surface-card settings-card" onSubmit={savePreferences} noValidate>
        <div className="section-heading"><div><p className="eyebrow">ANALYSIS PREFERENCES</p><h3>Inactivity thresholds</h3></div><SettingsIcon size={18} /></div>
        <p className="settings-description">An open issue or pull request is marked stale when it has had no activity for at least the selected number of full days. These values are saved with each new analysis snapshot.</p>
        <div className="settings-fields">
          <label className="settings-field" htmlFor="stale-issue-days">
            <span>Issue stale threshold</span><small>How many inactive days before an open issue is flagged.</small>
            <div className="settings-number-input"><input id="stale-issue-days" aria-describedby="stale-issue-days-error" type="number" min="1" max="365" step="1" value={values.staleIssueDays} onChange={(event) => updateValue('staleIssueDays', event.target.value)} /><span>days</span></div>
            {validation.staleIssueDays && <span id="stale-issue-days-error" className="field-error" role="alert">{validation.staleIssueDays}</span>}
          </label>
          <label className="settings-field" htmlFor="stale-pr-days">
            <span>Pull request stale threshold</span><small>How many inactive days before an open pull request is flagged.</small>
            <div className="settings-number-input"><input id="stale-pr-days" aria-describedby="stale-pr-days-error" type="number" min="1" max="365" step="1" value={values.stalePullRequestDays} onChange={(event) => updateValue('stalePullRequestDays', event.target.value)} /><span>days</span></div>
            {validation.stalePullRequestDays && <span id="stale-pr-days-error" className="field-error" role="alert">{validation.stalePullRequestDays}</span>}
          </label>
        </div>

        <div className="settings-field settings-repository-field">
          <label htmlFor="default-repository">Default repository</label>
          <small>Used when you open DevFlow on this account. You can still switch repositories from the top bar.</small>
          <select id="default-repository" value={values.defaultRepositoryId} onChange={(event) => updateValue('defaultRepositoryId', event.target.value)} disabled={repositoriesLoading}>
            <option value="">No default repository</option>
            {repositories.map((repo) => <option value={repo._id} key={repo._id}>{repo.fullName}</option>)}
          </select>
        </div>
        <div className="settings-actions"><span>Thresholds must be whole days from 1 to 365.</span><button className="button button-primary" type="submit" disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save settings'}</button></div>
      </form>

      <section className="surface-card settings-logout-card">
        <div><h3>Sign out</h3><p>End your DevFlow session on this device.</p></div>
        <button className="button button-secondary" type="button" onClick={handleLogout}><LogOut size={15} /> Sign out</button>
      </section>
    </div>
  );
}
