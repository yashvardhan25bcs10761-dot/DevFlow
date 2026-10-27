import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler.js';

function responseDouble() {
  return {
    status: vi.fn(function setStatus(statusCode) {
      this.statusCode = statusCode;
      return this;
    }),
    json: vi.fn(function send(body) {
      this.body = body;
      return this;
    }),
  };
}

describe('central error handling', () => {
  it('returns a safe retryable response for database connection failures', () => {
    const response = responseDouble();
    const secretBearingError = Object.assign(new Error('private connection detail'), {
      name: 'MongooseServerSelectionError',
    });

    errorHandler(secretBearingError, {}, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is temporarily unavailable. Please retry shortly.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('private connection detail');
  });

  it('does not send internal server error messages to clients', () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const response = responseDouble();

    try {
      errorHandler(new Error('sensitive internal detail'), {}, response, vi.fn());
      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.body.error.message).toBe('An unexpected server error occurred.');
      expect(response.body.error).not.toHaveProperty('stack');
    } finally {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  });
});
