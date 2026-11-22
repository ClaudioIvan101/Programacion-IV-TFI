import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresReadiness, REQUIRED_MIGRATIONS } from '../../src/infra/postgresReadiness.js';

test('comprueba los seis nombres en el historial con SQL parametrizado', async () => {
  let query;
  const check = createPostgresReadiness({ query: async (value) => { query = value; return { rows: [{ total: 6 }] }; } });
  assert.equal(await check(), true);
  assert.deepEqual(query.values, [REQUIRED_MIGRATIONS]);
  assert.match(query.text, /public\.pgmigrations/);
  assert.equal(query.query_timeout, 1500);
});

test('devuelve false ante migración faltante, tabla ausente o fallo de conexión', async () => {
  for (const query of [
    async () => ({ rows: [{ total: 5 }] }),
    async () => { throw Object.assign(new Error('detalle sensible'), { code: '42P01' }); },
    async () => { throw new Error('conexión caída'); },
  ]) assert.equal(await createPostgresReadiness({ query })(), false);
});

test('acota el tiempo, evita duplicar consultas simultáneas y recupera', async () => {
  let calls = 0;
  const pool = { query: () => { calls++; return calls === 1 ? new Promise(() => {}) : Promise.resolve({ rows: [{ total: 6 }] }); } };
  const check = createPostgresReadiness(pool, { timeoutMs: 25, cacheMs: 0 });
  assert.deepEqual(await Promise.all([check(), check()]), [false, false]);
  assert.equal(calls, 1);
  assert.equal(await check(), true);
  assert.equal(calls, 2);
});

test('reutiliza el resultado durante el intervalo corto de caché', async () => {
  let calls = 0;
  const check = createPostgresReadiness({ query: async () => { calls++; return { rows: [{ total: 6 }] }; } }, { cacheMs: 1000 });
  assert.equal(await check(), true);
  assert.equal(await check(), true);
  assert.equal(calls, 1);
});
