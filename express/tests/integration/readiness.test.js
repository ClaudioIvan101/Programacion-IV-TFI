import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { createPostgresReadiness, REQUIRED_MIGRATIONS } from '../../src/infra/postgresReadiness.js';

test('readiness refleja caída y recuperación sin afectar health ni exponer errores', async (t) => {
  let state = 'ready';
  const pool = { query: async () => {
    if (state === 'down') throw new Error('información sensible');
    if (state === 'missing') return { rows: [{ total: REQUIRED_MIGRATIONS.length - 1 }] };
    if (state === 'timeout') return new Promise(() => {});
    return { rows: [{ total: REQUIRED_MIGRATIONS.length }] };
  } };
  const checkReadiness = createPostgresReadiness(pool, { timeoutMs: 25, cacheMs: 0 });
  const server = createApp({ checkReadiness }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [next, expected] of [['ready', 200], ['down', 503], ['missing', 503], ['timeout', 503], ['ready', 200]]) {
    state = next;
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.doesNotMatch(body, /sensible|pgmigrations|PostgreSQL/);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  }
});

test('sin dependencia inyectada readiness falla de forma segura', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/ready`)).status, 503);
});
