process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/spillsense';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('./app');

test('GET /api/health returns service status', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.service, 'spillguard-api');
  assert.ok(response.body.timestamp);
});

test('unknown API routes return consistent 404 errors', async () => {
  const response = await request(app).get('/api/does-not-exist');
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('invalid incident payload returns validation error without database access', async () => {
  const response = await request(app).post('/api/incidents').send({ title: '' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.error.details));
});
