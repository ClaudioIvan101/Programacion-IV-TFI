import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { InvalidUserError } from '../../src/domain/users/createUser.js';
import { createFirstAdmin } from '../../src/infra/createFirstAdmin.js';
import { verifyPassword } from '../../src/infra/passwordHasher.js';
import { createPostgresPool } from '../../src/infra/postgres.js';

// Solo en una base de pruebas explícitamente autorizada; usa un esquema propio.
test('PostgreSQL aplica migración y garantiza unicidad con concurrencia', {
  skip: process.env.RUN_USERS_DB_TESTS !== '1', timeout: 15000,
}, async () => {
  const pool = createPostgresPool();
  const schema = `users_test_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  let first;
  let second;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    first = await pool.connect();
    second = await pool.connect();
    await Promise.all([first.query(`SET search_path TO "${schema}"`), second.query(`SET search_path TO "${schema}"`)]);
    const sql = await readFile(new URL('../../database/migrations/003_create_users.sql', import.meta.url), 'utf8');
    await first.query(sql);
    const insert = 'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING email';
    const values = (email) => ['Ana', email, 'test-hash', 'vendedor'];
    const results = await Promise.allSettled([
      first.query(insert, values('Ana@example.com')),
      second.query(insert, values('ana@EXAMPLE.com')),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.code, '23505');
    assert.equal(rejected.reason.constraint, 'users_email_unique');
    assert.equal(Number((await first.query('SELECT count(*) AS count FROM users')).rows[0].count), 1);
  } finally {
    first?.release();
    second?.release();
    try {
      if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end();
    }
  }
});

test('El alta inicial permite una sola ejecución concurrente y cuenta a los administradores inactivos', {
  skip: process.env.RUN_USERS_DB_TESTS !== '1', timeout: 15000,
}, async () => {
  const pool = createPostgresPool();
  const schema = `admin_test_${randomUUID().replaceAll('-', '')}`;
  let setup;
  try {
    setup = await pool.connect();
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`SET search_path TO "${schema}"`);
    const sql = await readFile(new URL('../../database/migrations/003_create_users.sql', import.meta.url), 'utf8');
    await setup.query(sql);

    // Cada llamada obtiene su propia conexión, con las tablas aisladas de esta prueba.
    const testPool = {
      async connect() {
        const client = await pool.connect();
        try {
          await client.query(`SET search_path TO "${schema}"`);
          return client;
        } catch (error) {
          client.release(true);
          throw error;
        }
      },
    };
    const input = { name: ' Ana ', email: 'ANA@example.com', password: 'contraseña de prueba' };
    await assert.rejects(createFirstAdmin(testPool, { ...input, password: 'corta' }), InvalidUserError);

    const results = await Promise.all([
      createFirstAdmin(testPool, input),
      createFirstAdmin(testPool, { ...input, email: 'otra@example.com' }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const admin = results.find(Boolean);
    assert.equal(admin.role, 'administrador');
    assert.equal(admin.name, 'Ana');
    assert.equal(admin.passwordHash, undefined);
    const { rows } = await setup.query('SELECT email, password_hash FROM users');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, admin.email);
    assert.equal(await verifyPassword(input.password, rows[0].password_hash), true);

    await setup.query("UPDATE users SET status = 'inactive' WHERE id = $1", [admin.id]);
    assert.equal(await createFirstAdmin(testPool, { ...input, email: 'tercera@example.com' }), null);
  } finally {
    try {
      await setup?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      setup?.release();
      await pool.end();
    }
  }
});
