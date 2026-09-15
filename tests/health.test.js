'use strict';

const request = require('supertest');
const app = require('../app');

describe('GET /health', () => {
  it('returns 200 { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 error shape for unknown routes (behind auth)', async () => {
    const res = await request(app)
      .get('/nope')
      .set('Authorization', `Bearer ${process.env.SERVICE_API_KEY}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
