import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword } from '../../src/infra/passwordHasher.js';
import { createPostgresUserRepository } from '../../src/infra/userRepository.js';
import { DuplicateEmailError } from '../../src/domain/users/createUser.js';

test('scrypt utiliza salts diferentes y verifica contraseñas', async () => {
  const first = await hashPassword('una contraseña segura');
  const second = await hashPassword('una contraseña segura');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('una contraseña segura', first), true);
  assert.equal(await verifyPassword('contraseña equivocada', first), false);
  assert.equal(await verifyPassword('una contraseña segura', 'invalid'), false);
});

test('repositorio parametriza valores y no selecciona hashes', async () => {
  const calls = [];
  const repo = createPostgresUserRepository({ async query(sql, values) { calls.push({ sql, values }); return { rows: [{}] }; } });
  await repo.create({ name: 'Ana', email: 'ana@example.com', passwordHash: 'hash', role: 'vendedor' });
  await repo.list();
  await repo.findById('id');
  await repo.findCredentialsByEmail('ana@example.com');
  assert.deepEqual(calls[0].values, ['Ana', 'ana@example.com', 'hash', 'vendedor']);
  assert.match(calls[0].sql, /\$1/);
  assert.deepEqual(calls[2].values, ['id']);
  assert.doesNotMatch(calls[1].sql, /password_hash/);
  assert.doesNotMatch(calls[2].sql, /password_hash/);
  assert.deepEqual(calls[3].values, ['ana@example.com']);
  assert.match(calls[3].sql, /password_hash AS "passwordHash".*lower\(email\) = \$1/);
});

test('solo el índice único de email se traduce a conflicto', async () => {
  const repo = createPostgresUserRepository({ async query() { throw Object.assign(new Error(), { code: '23505', constraint: 'users_email_unique' }); } });
  await assert.rejects(repo.create({}), DuplicateEmailError);
});

test('el comando de alta inicial exige una terminal interactiva', () => {
  const script = fileURLToPath(new URL('../../scripts/create-first-admin.js', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    input: 'Ana\nana@example.com\nsecreto-de-prueba\n',
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'Ejecutá el comando en una terminal interactiva.');
});
