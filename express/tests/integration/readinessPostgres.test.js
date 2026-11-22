import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresPool } from '../../src/infra/postgres.js';
import { createPostgresReadiness, REQUIRED_MIGRATIONS } from '../../src/infra/postgresReadiness.js';

// Requiere una base de pruebas aislada y migrada; no modifica sus datos.
test('PostgreSQL registra las seis migraciones requeridas para readiness', async () => {
  const pool = createPostgresPool();
  try {
    const { rows } = await pool.query('SELECT name FROM public.pgmigrations WHERE name = ANY($1::text[])', [REQUIRED_MIGRATIONS]);
    assert.deepEqual(rows.map((row) => row.name).sort(), [...REQUIRED_MIGRATIONS].sort());
    assert.equal(await createPostgresReadiness(pool)(), true);
  } finally {
    await pool.end();
  }
});
