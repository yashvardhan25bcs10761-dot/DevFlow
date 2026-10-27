import { describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';

describe('Backend Smoke & Health Test', () => {
  it('GET /api/v1/health returns 200 and healthy status payload', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('status', 'ok');
    expect(response.body.data).toHaveProperty('db');
    expect(response.body.data.db).toHaveProperty('readyState');
  });

  it('reports database disconnection as degraded instead of healthy', async () => {
    const originalState = mongoose.connection.readyState;
    mongoose.connection.readyState = 0;

    try {
      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(503);
      expect(response.body.data).toMatchObject({
        status: 'degraded',
        db: { readyState: 0, status: 'disconnected' },
      });
    } finally {
      mongoose.connection.readyState = originalState;
    }
  });

  it('GET /api/v1/non-existent-route returns 404 with structured error', async () => {
    const response = await request(app).get('/api/v1/non-existent-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found: GET /api/v1/non-existent-route',
      },
    });
  });
});
