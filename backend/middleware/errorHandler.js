import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

export function errorHandler(err, req, res, next) {
  // Handle JSON body limit error
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds 10kb limit',
      },
    });
  }

  // Handle malformed JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body',
      },
    });
  }

  const databaseUnavailable = isDatabaseUnavailable(err);
  const statusCode = databaseUnavailable ? 503 : (err.status || err.statusCode || 500);
  const errorCode = databaseUnavailable
    ? 'DATABASE_UNAVAILABLE'
    : (err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'));
  const message = databaseUnavailable
    ? 'The database is temporarily unavailable. Please retry shortly.'
    : statusCode >= 500
      ? 'An unexpected server error occurred.'
      : (err.message || 'An unexpected error occurred');

  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
  };

  // Stack traces must never appear in production
  if (!env.isProduction && !databaseUnavailable && statusCode >= 500 && err.stack) {
    errorResponse.error.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
}

function isDatabaseUnavailable(err) {
  const databaseErrors = new Set([
    'MongooseServerSelectionError',
    'MongoServerSelectionError',
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoNotConnectedError',
    'MongoTopologyClosedError',
  ]);

  return databaseErrors.has(err.name)
    || (err.name === 'MongooseError' && /buffering timed out/i.test(err.message || ''));
}
