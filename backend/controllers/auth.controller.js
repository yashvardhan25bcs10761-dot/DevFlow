import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { COOKIE_NAME } from '../middleware/auth.js';

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days per SPEC section 6
  });
}

function generateToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function register(req, res, next) {
  try {
    const { name, email, password } = req.validatedBody;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists',
        },
      });
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    const user = await User.create({
      name,
      email,
      passwordHash,
    });

    const token = generateToken(user);
    setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      message: 'Account registered successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.validatedBody;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      message: 'Logged in successfully',
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}

export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
