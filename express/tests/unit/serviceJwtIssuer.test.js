import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { exportPKCS8, generateKeyPair, jwtVerify, decodeProtectedHeader } from 'jose';
import { createServiceTokenProvider } from '../../src/infra/serviceJwtIssuer.js';
import { createAiGatewayClient } from '../../src/infra/aiGatewayClient.js';

const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const privateKeyPem = await exportPKCS8(privateKey);
const verify = (token, options = {}) => jwtVerify(token, publicKey, {
  algorithms: ['RS256'], issuer: 'core-api', audience: 'ai-gateway', subject: 'core-api', ...options,
});

test('firma RS256 con claims T4 y vencimiento corto', async () => {
  const token = await (await createServiceTokenProvider({ privateKeyPem, lifetimeSeconds: 30 }))();
  assert.equal(decodeProtectedHeader(token).alg, 'RS256');
  const { payload } = await verify(token);
  assert.equal(payload.iss, 'core-api');
  assert.equal(payload.aud, 'ai-gateway');
  assert.equal(payload.sub, 'core-api');
  assert.equal(payload.scope, 'ai:structured-completions');
  assert.equal(payload.nbf, payload.iat);
  assert.equal(payload.exp - payload.iat, 30);
  assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'nbf', 'scope', 'sub']);
  await assert.rejects(verify(token, { currentDate: new Date((payload.exp + 1) * 1000) }), { code: 'ERR_JWT_EXPIRED' });
});

test('rechaza clave y configuración inválidas sin filtrar secretos', async () => {
  for (const config of [{}, { privateKeyPem: 'secreto-invalido' }, { privateKeyPem, lifetimeSeconds: 0 }, { privateKeyPem, lifetimeSeconds: 61 }]) {
    await assert.rejects(createServiceTokenProvider(config), (error) => !error.message.includes('secreto-invalido') && !error.message.includes(privateKeyPem));
  }
  const other = await generateKeyPair('RS256', { modulusLength: 2048 });
  const token = await (await createServiceTokenProvider({ privateKeyPem }))();
  await assert.rejects(jwtVerify(token, other.publicKey, { algorithms: ['RS256'] }));
});

test('proveedor funciona con aiGatewayClient sin exponer claves', async (t) => {
  const load = async (path) => JSON.parse(await readFile(new URL(`../../../contracts/${path}`, import.meta.url), 'utf8'));
  const schemas = { request: await load('schemas/request.schema.json'), response: await load('schemas/response.schema.json'), result: await load('schemas/result.schema.json'), leadData: await load('schemas/lead-data.schema.json') };
  const request = await load('examples/valid/request-partial.json');
  const response = await load('examples/valid/response-follow-up.json');
  let verified = false;
  const server = createServer(async (req, res) => {
    try {
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
      const { payload } = await verify(bearer?.[1]);
      verified = payload.scope === 'ai:structured-completions';
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response));
    } catch { res.writeHead(401); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const client = createAiGatewayClient({ baseUrl, schemas, getServiceToken: await createServiceTokenProvider({ privateKeyPem }), httpAuthorization: { origin: baseUrl, environment: 'test' } });
  assert.deepEqual(await client.structuredCompletion(request, { idempotencyKey: 'test_1', requestId: 'af24e13f-a33f-4a5d-9e76-cbc3cdd7550a', deadline: new Date(Date.now() + 3000).toISOString() }), response);
  assert.equal(verified, true);
});
