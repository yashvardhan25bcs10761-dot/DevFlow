import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError, formatError } from '../src/services/api';

describe('API error and slow-response handling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('notifies the caller when a request takes longer than the server wake-up threshold', async () => {
    vi.useFakeTimers();
    let finishRequest;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finishRequest = resolve; })));
    const onSlow = vi.fn();

    const pendingRequest = apiRequest('/slow-endpoint', { onSlow });
    await vi.advanceTimersByTimeAsync(8000);
    expect(onSlow).toHaveBeenCalledOnce();

    finishRequest({ ok: true, status: 200, json: async () => ({ success: true, data: { ready: true } }) });
    await expect(pendingRequest).resolves.toEqual({ ready: true });
  });

  it('preserves a rate-limit reset time for user-facing error messages', () => {
    const error = new ApiError('GitHub API rate limit exceeded.', {
      status: 429,
      code: 'GITHUB_RATE_LIMITED',
      resetAt: '2026-10-27T18:00:00.000Z',
    });

    expect(formatError(error)).toContain('Reset time:');
  });
});
