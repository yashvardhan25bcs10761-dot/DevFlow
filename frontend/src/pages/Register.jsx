import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [clientErrors, setClientErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  function validate() {
    const errors = {};
    if (!name.trim()) {
      errors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    } else if (!/[A-Za-z]/.test(password)) {
      errors.password = 'Password must contain at least one letter';
    } else if (!/[0-9]/.test(password)) {
      errors.password = 'Password must contain at least one number';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm your password';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match';
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
      await register(name.trim(), email.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setServerError(err.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: '440px', margin: '3rem auto', padding: '0 1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Activity size={30} color="var(--accent-color)" />
          <span style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em' }}>DevFlow</span>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Create an account</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Start tracking public GitHub repository health
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
              htmlFor="name"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}
            >
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (clientErrors.name) setClientErrors({ ...clientErrors, name: '' });
              }}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                border: clientErrors.name ? '1px solid var(--error-color)' : '1px solid var(--border-color)',
                background: 'var(--elevated-color)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
              placeholder="Ada Lovelace"
            />
            {clientErrors.name && (
              <span style={{ color: 'var(--error-color)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
                {clientErrors.name}
              </span>
            )}
          </div>

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

          <div style={{ marginBottom: '1.25rem' }}>
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
                placeholder="Min 8 chars, letter + number"
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

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="confirmPassword"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}
            >
              Confirm password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (clientErrors.confirmPassword) setClientErrors({ ...clientErrors, confirmPassword: '' });
                }}
                style={{
                  width: '100%',
                  padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                  borderRadius: '6px',
                  border: clientErrors.confirmPassword ? '1px solid var(--error-color)' : '1px solid var(--border-color)',
                  background: 'var(--elevated-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                }}
                placeholder="Confirm your password"
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {clientErrors.confirmPassword && (
              <span style={{ color: 'var(--error-color)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
                {clientErrors.confirmPassword}
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
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent-color)', fontWeight: 500 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
