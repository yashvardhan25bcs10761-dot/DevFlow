import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 300000, // 5 min — allows mongodb-memory-server binary download on first run
    setupFiles: ['./tests/setup.js'],
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/devflow_test',
      JWT_SECRET: 'test_jwt_secret_must_be_at_least_32_characters_long',
      GITHUB_TOKEN: 'ghp_test_token_for_vitest_runs',
      CLIENT_URL: 'http://localhost:5173',
      PORT: '5001',
      // Pin mongodb-memory-server to version already cached from Phase 2
      MONGOMS_VERSION: '7.0.24',
    },
  },
});
