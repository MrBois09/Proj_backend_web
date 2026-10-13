import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import { app } from '../src/app.js';
import vercelHandler from '../api/index.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { ReviewVote } from '../src/models/ReviewVote.js';
import { createToken, hashToken, isImageBuffer } from '../src/utils/security.js';

describe('Gamer Review API security and health', () => {
  it('reports database degradation without exposing configuration', async () => {
    const response = await request(app).get('/api/health').expect(503);
    assert.deepEqual(response.body.data, { status: 'degraded' });
    assert.equal(JSON.stringify(response.body).includes('MONGODB_URI'), false);
  });

  it('issues a CSRF token for the cookie-based API client', async () => {
    const response = await request(app).get('/api/auth/csrf').expect(200);
    assert.equal(response.body.success, true);
    assert.equal(typeof response.body.data.csrfToken, 'string');
    assert.equal(response.headers['set-cookie'].filter((cookie) => cookie.startsWith('gr_csrf=')).length, 1);
  });

  it('serves Swagger UI and an OpenAPI document without exposing configuration', async () => {
    const uiResponse = await request(app).get('/api-docs/').expect(200);
    assert.match(uiResponse.headers['content-type'], /text\/html/);
    assert.match(uiResponse.text, /Swagger UI/);

    const specResponse = await request(app).get('/api-docs/openapi.json').expect(200);
    assert.equal(specResponse.body.openapi, '3.0.3');
    assert.equal(specResponse.body.servers[0].url, '/api');
    assert.ok(specResponse.body.paths['/auth/login'].post);
    assert.ok(specResponse.body.paths['/uploads/review-images'].post);
    assert.equal(JSON.stringify(specResponse.body).includes('MONGODB_URI'), false);
  });

  it('rejects unsafe requests without a CSRF token', async () => {
    const response = await request(app).post('/api/auth/refresh').expect(403);
    assert.equal(response.body.code, 'CSRF_INVALID');
  });

  it('checks CSRF before processing refresh requests', async () => {
    const agent = request.agent(app);
    const csrfResponse = await agent.get('/api/auth/csrf').expect(200);
    const response = await agent.post('/api/auth/refresh')
      .set('X-CSRF-Token', csrfResponse.body.data.csrfToken)
      .expect(401);
    assert.equal(response.body.message, 'Refresh session is invalid or expired');
  });

  it('rejects disallowed browser origins', async () => {
    const response = await request(app)
      .get('/api/auth/csrf')
      .set('Origin', 'https://attacker.invalid')
      .expect(403);
    assert.equal(response.body.message, 'Request origin is not allowed');
  });

  it('requires authentication on the current-user endpoint', async () => {
    const response = await request(app).get('/api/auth/me').expect(401);
    assert.equal(response.body.message, 'Authentication required');
  });

  it('validates review identifiers before querying MongoDB', async () => {
    const response = await request(app).get('/api/reviews/not-an-id').expect(400);
    assert.equal(response.body.message, 'Invalid id');
  });

  it('validates authentication form input before touching the database', async () => {
    const response = await request(app).post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'weak' })
      .expect(422);
    assert.equal(response.body.success, false);
    assert.ok(Array.isArray(response.body.errors));
  });

  it('rejects image uploads from unauthenticated users', async () => {
    const agent = request.agent(app);
    const csrfResponse = await agent.get('/api/auth/csrf').expect(200);
    const response = await agent.post('/api/uploads/game-cover')
      .set('X-CSRF-Token', csrfResponse.body.data.csrfToken)
      .expect(401);
    assert.equal(response.body.message, 'Authentication required');
  });

  it('returns a consistent API not-found response', async () => {
    const response = await request(app).get('/api/not-a-route').expect(404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, 'Route not found');
  });

  it('enforces per-instance request rate limits', async () => {
    const testApp = express();
    testApp.get('/limited', createRateLimiter(1, 60_000), (_req, res) => res.sendStatus(200));
    await request(testApp).get('/limited').expect(200);
    const response = await request(testApp).get('/limited').expect(429);
    assert.equal(response.body.success, false);
  });

  it('exports the health endpoint through a Vercel-compatible function handler', async () => {
    const response = await request(vercelHandler).get('/api/health').expect(503);
    assert.deepEqual(response.body.data, { status: 'degraded' });
  });
});

describe('Security utilities', () => {
  it('creates random tokens and stores them as one-way hashes', () => {
    const first = createToken();
    const second = createToken();
    assert.equal(first.length, 64);
    assert.notEqual(first, second);
    assert.equal(hashToken(first), hashToken(first));
    assert.notEqual(hashToken(first), first);
  });

  it('accepts image signatures rather than trusting file extensions', () => {
    assert.equal(isImageBuffer(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])), true);
    assert.equal(isImageBuffer(Buffer.from('not an image file')), false);
  });

  it('hashes and verifies passwords with BCrypt', async () => {
    const password = 'SafePassword!2026';
    const digest = await bcrypt.hash(password, 4);
    assert.notEqual(digest, password);
    assert.equal(await bcrypt.compare(password, digest), true);
    assert.equal(await bcrypt.compare('another-password', digest), false);
  });

  it('allows independent likes and helpfulness votes while preventing duplicate vote types', () => {
    const voteIndex = ReviewVote.schema.indexes().find(([keys, options]) =>
      options.unique && keys.userId === 1 && keys.reviewId === 1 && keys.type === 1);
    assert.ok(voteIndex);
  });
});
