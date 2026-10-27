import express from 'express';
import { register, login, logout, getMe } from '../controllers/auth.controller.js';
import { validate, registerSchema, loginSchema } from '../validators/auth.validator.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

export default router;
