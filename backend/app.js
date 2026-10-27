import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.routes.js';
import preferencesRouter from './routes/preferences.routes.js';
import repositoryRouter from './routes/repository.routes.js';
import analysisRouter from './routes/analysis.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security headers
app.use(helmet());

// CORS configured for CLIENT_URL with credentials
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

// Body parsers with 10kb limit
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parsing
app.use(cookieParser());

// API Routes
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/preferences', preferencesRouter);
app.use('/api/v1/repositories', repositoryRouter);
app.use('/api/v1/analyses', analysisRouter);

// 404 Not Found Middleware
app.use(notFoundHandler);

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
