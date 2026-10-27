import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET', 'GITHUB_TOKEN'];

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key].trim() === ''
  );

  if (missing.length > 0) {
    const errorMsg =
      `\n[FATAL CONFIG ERROR] Missing required environment variable(s): ${missing.join(', ')}.\n` +
      `Please define them in backend/.env (refer to backend/.env.example).\n`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

export const env = {
  get NODE_ENV() {
    return process.env.NODE_ENV || 'development';
  },
  get PORT() {
    return parseInt(process.env.PORT, 10) || 5000;
  },
  get MONGODB_URI() {
    return process.env.MONGODB_URI || '';
  },
  get JWT_SECRET() {
    return process.env.JWT_SECRET || '';
  },
  get CLIENT_URL() {
    return process.env.CLIENT_URL || 'http://localhost:5173';
  },
  get GITHUB_TOKEN() {
    return process.env.GITHUB_TOKEN || '';
  },
  get BCRYPT_ROUNDS() {
    return parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
  },
  get isProduction() {
    return (process.env.NODE_ENV || 'development') === 'production';
  },
  get isTest() {
    return (process.env.NODE_ENV || 'development') === 'test';
  },
};
