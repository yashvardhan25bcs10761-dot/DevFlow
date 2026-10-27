import express from 'express';
import { getPreferences, updatePreferences } from '../controllers/preferences.controller.js';
import { validatePreferences } from '../validators/preferences.validator.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getPreferences);
router.patch('/', validatePreferences, updatePreferences);

export default router;
