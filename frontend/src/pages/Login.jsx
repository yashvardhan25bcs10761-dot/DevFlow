import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clientErrors, setClientErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  function validate() {
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setServerError(err.message || 'Failed to log in');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: '420px', margin: '4rem auto', padding: '0 1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Activity size={30} color="var(--accent-color)" />
          <span style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em' }}>DevFlow</span>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Sign in to your account</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Monitor repository health and engineering risks
        </p>
      </div>

      <div
        style={{
          background: 'var(--card-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '2rem',
        }}
      >
        {serverError && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--error-color)',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (clientErrors.email) setClientErrors({ ...clientErrors, email: '' });
              }}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                border: clientErrors.email ? '1px solid var(--error-color)' : '1px solid var(--border-color)',
                background: 'var(--elevated-color)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
              placeholder="you@domain.com"
            />
            {clientErrors.email && (
              <span style={{ color: 'var(--error-color)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
                {clientErrors.email}
              </span>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (clientErrors.password) setClientErrors({ ...clientErrors, password: '' });
                }}
                style={{
                  width: '100%',
                  padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                  borderRadius: '6px',
                  border: clientErrors.password ? '1px solid var(--error-color)' : '1px solid var(--border-color)',
                  background: 'var(--elevated-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                }}
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {clientErrors.password && (
              <span style={{ color: 'var(--error-color)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
                {clientErrors.password}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--accent-color)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--accent-color)', fontWeight: 500 }}>
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
