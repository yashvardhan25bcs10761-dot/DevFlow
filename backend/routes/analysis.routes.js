import express from 'express';
import {
  runAnalysis,
  getLatestAnalysis,
  getAnalysisHistory,
  getAnalysisById,
} from '../controllers/analysis.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

// ---- Standalone analysis router — mounted at /api/v1/analyses ----
const router = express.Router();
router.use(authenticate);

// GET /api/v1/analyses/:id — get a specific analysis snapshot (owned only)
router.get('/:id', validateObjectId('id'), getAnalysisById);

export default router;

// ---- Per-repository analysis sub-router ----
// Mounted under /api/v1/repositories/:id in repository.routes.js.
// mergeParams: true lets us read req.params.id from the parent route.
// The parent router already runs authenticate, so we don't add it again.
export const repositoryAnalysisRouter = express.Router({ mergeParams: true });

// POST /api/v1/repositories/:id/analyze
repositoryAnalysisRouter.post('/analyze', validateObjectId('id'), runAnalysis);

// GET /api/v1/repositories/:id/latest-analysis
repositoryAnalysisRouter.get('/latest-analysis', validateObjectId('id'), getLatestAnalysis);

// GET /api/v1/repositories/:id/analysis-history?page&limit
repositoryAnalysisRouter.get('/analysis-history', validateObjectId('id'), getAnalysisHistory);
