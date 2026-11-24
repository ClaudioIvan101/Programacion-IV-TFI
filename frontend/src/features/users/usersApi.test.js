import assert from 'node:assert/strict';
import test from 'node:test';
import { createUsersApi } from './usersApi.js';

test('users API lists and reads users through the authenticated proxy', async () => {
  const calls = [];
  const record = { id: 'demo-id', name: 'Test User', role: 'supervisor' };
  const api = createUsersApi('token', () => {}, async (path, options) => {
    calls.push([path, options]);
    return Response.json(path === '/api/users' ? [record] : record);
  });

  assert.deepEqual(await api.list(), [record]);
  assert.deepEqual(await api.get(record.id), record);
  assert.deepEqual(calls.map(([path, options]) => [path, options.headers.Authorization]), [
    ['/api/users', 'Bearer token'],
    ['/api/users/demo-id', 'Bearer token'],
  ]);
});

test('creates a user with the exact payload and without changing the password', async () => {
  const input = { name: 'Test User', email: 'test@example.test', password: ' Test password ', role: 'vendedor' };
  const api = createUsersApi('token', () => {}, async (path, options) => {
    assert.equal(path, '/api/users');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), input);
    return Response.json({ id: 'new-id' }, { status: 201 });
  });

  assert.deepEqual(await api.create(input), { id: 'new-id' });
});

test('only a 401 invalidates the session; a 403 or duplicate email stays local', async () => {
  let unauthorized = 0;
  for (const status of [403, 409, 401]) {
    const api = createUsersApi('token', () => { unauthorized += 1; }, async () => Response.json({}, { status }));
    await assert.rejects(api.list(), { status });
    assert.equal(unauthorized, status === 401 ? 1 : 0);
  }
});
