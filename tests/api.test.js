import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import { app } from '../src/app.js';
import vercelHandler from '../api/index.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { ReviewVote } from '../src/models/ReviewVote.js';
import { Game } from '../src/models/Game.js';
import { GamePlatform } from '../src/models/GamePlatform.js';
import { GameTag } from '../src/models/GameTag.js';
import { PopularTag } from '../src/models/PopularTag.js';
import { GAME_GENRES } from '../src/constants/gameGenres.js';
import { GAME_PLATFORMS } from '../src/constants/gamePlatforms.js';
import { POPULAR_TAGS } from '../src/constants/popularTags.js';
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
    assert.ok(specResponse.body.paths['/games/{gameId}/reviews'].post.requestBody.content['multipart/form-data']);
    assert.ok(!specResponse.body.paths['/games/pending']);
    assert.ok(!specResponse.body.paths['/games/{id}/moderate']);
    assert.ok(!specResponse.body.paths['/auth/verify-email']);
    assert.ok(specResponse.body.paths['/games/genres'].get);
    assert.ok(specResponse.body.paths['/games/tags'].get);
    assert.ok(specResponse.body.paths['/games/platforms'].get);
    assert.ok(specResponse.body.paths['/games/popular-tags'].get);
    assert.equal(specResponse.body.components.schemas.RegisterInput.required.includes('username'), false);
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

  it('accepts the frontend registration field names and its eight-character password minimum', async () => {
    const response = await request(app).post('/api/auth/register')
      .send({ name: 'Postman Tester', email: 'not-an-email', password: 'password' })
      .expect(422);
    const invalidFields = response.body.errors.map((error) => error.field);
    assert.ok(invalidFields.includes('email'));
    assert.ok(!invalidFields.includes('displayName'));
    assert.ok(!invalidFields.includes('password'));
  });

  it('rejects image uploads from unauthenticated users', async () => {
    const agent = request.agent(app);
    const csrfResponse = await agent.get('/api/auth/csrf').expect(200);
    const response = await agent.post('/api/uploads/game-cover')
      .set('X-CSRF-Token', csrfResponse.body.data.csrfToken)
      .expect(401);
    assert.equal(response.body.message, 'Authentication required');
  });

  it('protects direct multipart review creation with authentication', async () => {
    const agent = request.agent(app);
    const csrfResponse = await agent.get('/api/auth/csrf').expect(200);
    const response = await agent.post('/api/games/507f1f77bcf86cd799439011/reviews')
      .set('X-CSRF-Token', csrfResponse.body.data.csrfToken)
      .field('title', 'Test review')
      .field('content', 'Review text')
      .field('rating', '8')
      .attach('images', Buffer.from('fake image'), 'review.png')
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

  it('stores game tag, platform, and popular tag catalogs in dedicated unique collections', async () => {
    assert.deepEqual(GAME_GENRES, ['Action', 'RPG', 'Adventure', 'FPS', 'Strategy', 'Horror', 'Indie']);
    assert.deepEqual(GAME_PLATFORMS, ['PC', 'Console', 'Smartphone']);
    assert.deepEqual(POPULAR_TAGS, ['Gameplay', 'Story', 'Graphics', 'Performance', 'Multiplayer']);
    assert.equal(GameTag.collection.collectionName, 'gametags');
    assert.equal(GamePlatform.collection.collectionName, 'gameplatforms');
    assert.equal(PopularTag.collection.collectionName, 'populartags');
    assert.ok(GameTag.schema.path('name').options.unique);
    assert.ok(GamePlatform.schema.path('name').options.unique);
    assert.ok(PopularTag.schema.path('name').options.unique);
    assert.equal(Game.schema.path('genres').caster.enumValues.length, 0);
    assert.equal(Game.schema.path('platforms').caster.enumValues.length, 0);
    const publishedGame = new Game({ title: 'Published game', slug: 'published-game', description: 'A published game' });
    assert.equal(publishedGame.approvalStatus, 'approved');
  });
});
