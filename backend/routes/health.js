import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

const DB_STATUS_MAP = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

router.get('/health', (req, res) => {
  const readyState = mongoose.connection ? mongoose.connection.readyState : 0;
  const dbStatus = DB_STATUS_MAP[readyState] || 'unknown';
  const databaseReady = readyState === 1;

  res.status(databaseReady ? 200 : 503).json({
    success: true,
    data: {
      status: databaseReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      db: {
        readyState,
        status: dbStatus,
      },
    },
    message: databaseReady ? 'DevFlow API is healthy' : 'DevFlow API is running but the database is unavailable',
  });
});

export default router;
