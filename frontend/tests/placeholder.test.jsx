import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import Placeholder from '../src/pages/Placeholder';

describe('Placeholder Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders title and tagline properly', async () => {
    // Mock health check response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          status: 'ok',
          uptime: 120,
          timestamp: '2026-10-27T00:00:00.000Z',
          db: { readyState: 0, status: 'disconnected' },
        },
      }),
    });

    render(<Placeholder />);

    expect(screen.getByText('DevFlow')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Understand your repositories. Identify risks. Make better engineering decisions.'
      )
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText(/Backend Connected \(Phase 1 Skeleton Active\)/i)
      ).toBeInTheDocument();
    });
  });
});
