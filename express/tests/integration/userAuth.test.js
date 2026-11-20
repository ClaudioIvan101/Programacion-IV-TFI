import assert from 'node:assert/strict';
import { once } from 'node:events';
import { SignJWT, jwtVerify } from 'jose';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';
import { makeLogin } from '../../src/domain/users/login.js';
import { createJwtAuthenticator, createJwtIssuer } from '../../src/infra/jwtAuthenticator.js';
import { hashPassword, verifyPassword } from '../../src/infra/passwordHasher.js';

const id = 'af24e13f-a33f-4a5d-9e76-cbc3cdd7550a';
const credentials = { email: 'ANA@example.com', password: ' frase secreta de prueba ' };
const secretHex = 'af'.repeat(32);

async function setup(t, options = {}) {
  const user = {
    id,
    email: credentials.email.toLowerCase(),
    passwordHash: await hashPassword(credentials.password),
    role: 'administrador',
    status: 'active',
  };
  const userRepository = {
    findCredentialsByEmail: async (email) => email === user.email ? user : null,
    findById: async (userId) => userId === id ? user : null,
  };
  const issueToken = createJwtIssuer({ secretHex });
  const login = options.disabled ? null : makeLogin({ userRepository, verifyPassword, issueToken });
  const authenticate = createJwtAuthenticator({ secretHex, findUserById: userRepository.findById });
  const users = { authenticate, listUsers: async () => [], getUserById: async () => ({ id }) };
  const server = createApp({ auth: { login }, users }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    user,
    login: (body = credentials) => fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    listUsers: (token) => fetch(`${base}/users`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  };
}

test('login válido devuelve un JWT HS256 con vencimiento y permite el acceso de administración', async (t) => {
  const app = await setup(t);
  const response = await app.login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['accessToken', 'expiresIn', 'tokenType']);
  assert.equal(body.tokenType, 'Bearer');
  assert.equal(body.expiresIn, 900);
  const { payload } = await jwtVerify(body.accessToken, Buffer.from(secretHex, 'hex'), {
    algorithms: ['HS256'], issuer: 'leadqual', audience: 'leadqual-core-api',
  });
  assert.equal(payload.sub, id);
  assert.equal(payload.exp - payload.iat, 900);
  assert.equal(payload.role, undefined);
  assert.equal((await app.listUsers(body.accessToken)).status, 200);

  for (const role of ['supervisor', 'vendedor']) {
    app.user.role = role;
    assert.equal((await app.login()).status, 200);
    assert.equal((await app.listUsers(body.accessToken)).status, 403);
  }
  app.user.role = 'administrador';
  app.user.status = 'inactive';
  assert.equal((await app.listUsers(body.accessToken)).status, 403);
});

test('login rechaza datos inválidos y usa el mismo error para credenciales incorrectas o cuenta inactiva', async (t) => {
  const app = await setup(t);
  assert.equal((await app.login({ ...credentials, role: 'administrador' })).status, 400);
  for (const body of [
    { ...credentials, email: 'desconocido@example.com' },
    { ...credentials, password: credentials.password.trim() },
  ]) {
    const response = await app.login(body);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Credenciales inválidas.' });
  }
  app.user.status = 'inactive';
  const inactive = await app.login();
  assert.equal(inactive.status, 401);
  assert.deepEqual(await inactive.json(), { error: 'Credenciales inválidas.' });
});

test('el middleware rechaza tokens vencidos o con identidad de otro servicio', async (t) => {
  const app = await setup(t);
  const tokens = [
    undefined,
    await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id)
      .setIssuer('leadqual').setAudience('leadqual-core-api').setExpirationTime('1s ago')
      .sign(Buffer.from(secretHex, 'hex')),
    await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id)
      .setIssuer('core-api').setAudience('ai-gateway').setExpirationTime('1m')
      .sign(Buffer.from(secretHex, 'hex')),
  ];
  for (const token of tokens) {
    const response = await app.listUsers(token);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  }
});

test('el login queda cerrado sin clave de usuario', async (t) => {
  const app = await setup(t, { disabled: true });
  assert.equal(createJwtIssuer({}), null);
  assert.equal((await app.login()).status, 503);
});
