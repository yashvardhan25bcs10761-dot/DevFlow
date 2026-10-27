const SLOW_REQUEST_MS = 8000;

export class ApiError extends Error {
  constructor(message, { status, code, details, resetAt } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.resetAt = resetAt;
  }
}

export async function apiRequest(path, options = {}) {
  const { onSlow, ...fetchOptions } = options;
  let slowTimer;
  if (onSlow) slowTimer = window.setTimeout(onSlow, SLOW_REQUEST_MS);

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      credentials: 'include',
      headers: {
        ...(fetchOptions.body && !(fetchOptions.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers,
      },
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('devflow:unauthorized'));
    }
    if (!response.ok || payload.success === false) {
      const error = payload.error || {};
      throw new ApiError(error.message || `Request failed (${response.status})`, {
        status: response.status,
        code: error.code,
        details: error.details,
        resetAt: error.details?.resetAt,
      });
    }
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError('Request was cancelled.');
    throw new ApiError('Could not reach the DevFlow server. Check that the backend is running and try again.');
  } finally {
    if (slowTimer) window.clearTimeout(slowTimer);
  }
}

export function dispatchToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('devflow:toast', { detail: { message, type } }));
}

export function formatDate(value) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

export function formatError(error) {
  const message = error?.message || 'Something went wrong. Please try again.';
  if (error?.resetAt) return `${message} Reset time: ${formatDate(error.resetAt)}.`;
  return message;
}
