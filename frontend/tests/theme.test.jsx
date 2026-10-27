import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemePicker from '../src/components/ThemePicker';
import { ThemeProvider } from '../src/contexts/ThemeContext';

describe('site-wide theme selector', () => {
  afterEach(() => {
    window.localStorage.removeItem('devflow.theme');
    delete document.documentElement.dataset.theme;
  });

  it('switches the site theme and persists the choice on this device', () => {
    render(<ThemeProvider><ThemePicker /></ThemeProvider>);

    fireEvent.click(screen.getByText('Theme', { exact: true }));
    expect(screen.getByRole('group', { name: /Website themes/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /GitHub Dark/i }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'github');
    expect(window.localStorage.getItem('devflow.theme')).toBe('github');
  });

  it('restores a previously selected theme', () => {
    window.localStorage.setItem('devflow.theme', 'midnight-blue');
    render(<ThemeProvider><ThemePicker /></ThemeProvider>);
    expect(document.documentElement).toHaveAttribute('data-theme', 'midnight-blue');
  });
});
