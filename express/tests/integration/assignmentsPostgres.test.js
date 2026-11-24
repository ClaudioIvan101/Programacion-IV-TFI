import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createPostgresPool } from '../../src/infra/postgres.js';
import { createPostgresAssignmentRepository } from '../../src/infra/assignmentRepository.js';

test('PostgreSQL conserva un vendedor, una reserva de aviso y el primer contacto', {
  skip: process.env.RUN_ASSIGNMENT_DB_TESTS !== '1', timeout: 20000,
}, async () => {
  const pool = createPostgresPool();
  const schema = 'assignment_test_' + randomUUID().replaceAll('-', '');
  const db = {
    async connect() {
      const client = await pool.connect();
      try {
        await client.query('SET search_path TO "' + schema + '"');
        return client;
      } catch (error) {
        client.release(true);
        throw error;
      }
    },
    async query(...args) {
      const client = await db.connect();
      try { return await client.query(...args); } finally { client.release(); }
    },
  };
  try {
    await pool.query('CREATE SCHEMA "' + schema + '"');
    const dir = new URL('../../database/migrations/', import.meta.url);
    for (const file of (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()) {
      await db.query((await readFile(new URL(file, dir), 'utf8')).split('-- Down Migration')[0]);
    }

    const account = async (name, role, status = 'active') => (await db.query(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, name + '@example.invalid', 'fixture-hash', role, status],
    )).rows[0].id;
    const operator = await account('operador', 'supervisor');
    const seller = await account('vendedor-a', 'vendedor');
    const other = await account('vendedor-b', 'vendedor');
    const inactive = await account('inactivo', 'vendedor', 'inactive');
    const lead = (await db.query("INSERT INTO leads (name) VALUES ('Interesado') RETURNING id")).rows[0].id;
    const version = (await db.query("INSERT INTO lead_scoring_rule_sets (threshold, rules) VALUES (10, '[{}]') RETURNING version")).rows[0].version;
    const qualified = (await db.query(`INSERT INTO lead_qualifications (lead_id, rule_set_version, decision, score, breakdown, created_at)
      VALUES ($1, $2, 'qualified', 10, '[]', '2026-11-24T00:00:00Z') RETURNING id`, [lead, version])).rows[0].id;
    const downgrade = await db.query(`INSERT INTO lead_qualifications (lead_id, rule_set_version, decision, score, breakdown, created_at)
      VALUES ($1, $2, 'not_qualified', 0, '[]', '2026-11-24T00:01:00Z') RETURNING id`, [lead, version]);

    const repository = createPostgresAssignmentRepository(db);
    const input = { leadId: lead, sellerId: seller, assignedBy: operator };
    assert.equal((await repository.assign(input)).kind, 'not_qualified');
    await db.query('DELETE FROM lead_qualifications WHERE id = $1', [downgrade.rows[0].id]);
    assert.equal((await repository.assign({ ...input, sellerId: inactive })).kind, 'invalid_seller');
    const attempts = await Promise.all([repository.assign(input), repository.assign({ ...input, sellerId: other })]);
    assert.deepEqual(attempts.map(({ kind }) => kind).sort(), ['created', 'existing']);
    const { id } = attempts.find(({ kind }) => kind === 'created').row;
    const record = await repository.get(id);
    assert.equal(record.qualificationId, qualified);
    assert.equal(record.score, 10);
    assert.equal((await repository.list(record.sellerId)).length, 1);
    const notOwner = record.sellerId === seller ? other : seller;
    assert.equal((await repository.list(notOwner)).length, 0);
    assert.equal(await repository.recordFirstContact(id, notOwner), null);
    assert.equal((await Promise.all([repository.claim(id), repository.claim(id)])).filter(Boolean).length, 1);
    await repository.settle(id, 'sent');
    assert.equal(await repository.claim(id), null);
    const first = await repository.recordFirstContact(id, record.sellerId);
    const repeat = await repository.recordFirstContact(id, record.sellerId);
    assert.deepEqual(first.firstContactAt, repeat.firstContactAt);
    assert.ok(first.responseSeconds >= 0);
    assert.equal((await db.query('SELECT status FROM leads WHERE id = $1', [lead])).rows[0].status, 'asignado');
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await pool.end();
  }
});
