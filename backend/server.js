import app from './app.js';
import { env, validateEnv } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

// Validate required environment variables on startup
try {
  validateEnv();
} catch {
  process.exit(1);
}

async function startServer() {
  try {
    // Attempt database connection on server start
    await connectDB();

    const server = app.listen(env.PORT, () => {
      console.log(`[DevFlow Backend] Server running in ${env.NODE_ENV} mode on http://localhost:${env.PORT}`);
      console.log(`[DevFlow Backend] Health check available at http://localhost:${env.PORT}/api/v1/health`);
      console.log(`[DevFlow Backend] CORS enabled for ${env.CLIENT_URL}`);
    });

    function handleShutdown(signal) {
      console.log(`\n[DevFlow Backend] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        console.log('[DevFlow Backend] HTTP server and database connection closed.');
        process.exit(0);
      });
    }

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (error) {
    // Startup errors may embed connection strings; keep logs free of credentials.
    console.error(`[DevFlow Backend] Startup failed (${error.name || 'Error'}).`);
    process.exit(1);
  }
}

startServer();
