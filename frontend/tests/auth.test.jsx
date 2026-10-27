import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import Login from '../src/pages/Login';
import Register from '../src/pages/Register';

function renderWithAuth(ui) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe('Frontend Authentication UI & Validation (SPEC Section 11 & 12)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: { code: 'UNAUTHORIZED' } }),
    });
  });

  describe('Login Page', () => {
    it('validates required fields on empty submit', async () => {
      renderWithAuth(<Login />);

      const submitBtn = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/Email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    });

    it('validates invalid email format', async () => {
      renderWithAuth(<Login />);

      const emailInput = screen.getByLabelText(/Email address/i);
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });

      const submitBtn = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/Please enter a valid email address/i)).toBeInTheDocument();
    });

    it('toggles password visibility', () => {
      renderWithAuth(<Login />);

      const passwordInput = screen.getByLabelText(/^Password$/i);
      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleBtn = screen.getByRole('button', { name: /Show password/i });
      fireEvent.click(toggleBtn);
      expect(passwordInput).toHaveAttribute('type', 'text');

      fireEvent.click(toggleBtn);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('Register Page', () => {
    it('validates empty inputs on submit', async () => {
      renderWithAuth(<Register />);

      const submitBtn = screen.getByRole('button', { name: /Create Account/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/Name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Confirm your password/i)).toBeInTheDocument();
    });

    it('validates password requirements (length and character rules) and confirm mismatch', async () => {
      renderWithAuth(<Register />);

      const nameInput = screen.getByLabelText(/^Full name$/i);
      const emailInput = screen.getByLabelText(/^Email address$/i);
      const passwordInput = screen.getByLabelText(/^Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm password$/i);
      const submitBtn = screen.getByRole('button', { name: /Create Account/i });

      fireEvent.change(nameInput, { target: { value: 'A' } }); // Short name
      fireEvent.change(emailInput, { target: { value: 'ada@devflow.io' } });
      fireEvent.change(passwordInput, { target: { value: 'pass1' } }); // Short password
      fireEvent.change(confirmInput, { target: { value: 'different' } });

      fireEvent.click(submitBtn);

      expect(await screen.findByText(/Name must be at least 2 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/Password must be at least 8 characters long/i)).toBeInTheDocument();
      expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();

      // Password without number
      fireEvent.change(passwordInput, { target: { value: 'onlyletterslong' } });
      fireEvent.change(confirmInput, { target: { value: 'onlyletterslong' } });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/Password must contain at least one number/i)).toBeInTheDocument();
    });

    it('toggles password and confirm password visibility', () => {
      renderWithAuth(<Register />);

      const passwordInput = screen.getByLabelText(/^Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm password$/i);

      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(confirmInput).toHaveAttribute('type', 'password');

      const showPassBtn = screen.getByRole('button', { name: /Show password/i });
      fireEvent.click(showPassBtn);
      expect(passwordInput).toHaveAttribute('type', 'text');

      const showConfirmBtn = screen.getByRole('button', { name: /Show confirm password/i });
      fireEvent.click(showConfirmBtn);
      expect(confirmInput).toHaveAttribute('type', 'text');
    });
  });
});
