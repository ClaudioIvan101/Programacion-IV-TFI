import assert from 'node:assert/strict';
import test from 'node:test';
import { requestLogin } from './loginApi.js';

test('login posts credentials through the API proxy and returns a timed session', async () => {
  const session = await requestLogin({ email: ' lead@example.com ', password: ' password ' }, async (path, options) => {
    assert.equal(path, '/api/auth/login');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { email: 'lead@example.com', password: ' password ' });
    return Response.json({ accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 900 });
  });
  assert.equal(session.accessToken, 'test-token');
  assert.ok(session.expiresAt > Date.now() + 899_000);
});

test('rejected credentials produce a specific message', async () => {
  await assert.rejects(requestLogin({}, async () => new Response(null, { status: 401 })), /credenciales/i);
});

test('unavailable backend produces a safe, actionable message', async () => {
  await assert.rejects(requestLogin({}, async () => { throw new Error('Internal secret'); }), /conectar/i);
});

test('unexpected success payload does not create a session', async () => {
  await assert.rejects(requestLogin({}, async () => Response.json({ accessToken: 'test-token' })), /respuesta/i);
});
