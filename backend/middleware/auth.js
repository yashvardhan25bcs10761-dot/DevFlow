import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'devflow_token';

export function authenticate(req, res, next) {
  // Check HttpOnly cookie first, then fall back to Bearer header for flexibility
  let token = req.cookies?.[COOKIE_NAME] || req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. No token provided.',
      },
    });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: error.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token.',
      },
    });
  }
}
