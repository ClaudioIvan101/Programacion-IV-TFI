import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createAiGatewayClient } from '../../src/infra/aiGatewayClient.js';

const load = async (path) => JSON.parse(await readFile(new URL(`../../../contracts/${path}`, import.meta.url), 'utf8'));
const schemas = {
  request: await load('schemas/request.schema.json'),
  response: await load('schemas/response.schema.json'),
  result: await load('schemas/result.schema.json'),
  leadData: await load('schemas/lead-data.schema.json'),
};
const request = await load('examples/valid/request-partial.json');
const validResponse = await load('examples/valid/response-follow-up.json');
const requestId = 'af24e13f-a33f-4a5d-9e76-cbc3cdd7550a';
const token = 'synthetic.header.signature';
const metadata = (ms = 3000) => ({ idempotencyKey: 'operation_01', requestId, deadline: new Date(Date.now() + ms).toISOString() });
async function setup(t, handler, getServiceToken = async () => token) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return createAiGatewayClient({ baseUrl, getServiceToken, schemas, httpAuthorization: { origin: baseUrl, environment: 'test' } });
}
const expectCode = (code) => (error) => error.code === code && !JSON.stringify(error).includes(token) && !error.message.includes('private-data');

test('envía solicitud y cabeceras T4 y acepta la respuesta válida', async (t) => {
  let seen;
  const client = await setup(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    seen = { method: req.method, url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks)) };
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(validResponse));
  });
  const meta = metadata();
  assert.deepEqual(await client.structuredCompletion(request, meta), validResponse);
  assert.equal(seen.url, '/v1/structured-completions');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.headers.authorization, `Bearer ${token}`);
  assert.equal(seen.headers['idempotency-key'], meta.idempotencyKey);
  assert.equal(seen.headers['x-request-id'], meta.requestId);
  assert.equal(seen.headers['x-deadline'], meta.deadline);
  assert.deepEqual(seen.body, request);
});

for (const status of [400, 500]) {
  test(`controla HTTP ${status} sin exponer contenido`, async (t) => {
    const client = await setup(t, (_req, res) => { res.writeHead(status); res.end('private-data'); });
    await assert.rejects(client.structuredCompletion(request, metadata()), (error) => expectCode('HTTP_ERROR')(error) && error.status === status);
  });
}

test('rechaza JSON inválido, datos fuera de esquema y respuesta grande', async (t) => {
  let count = 0;
  const client = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end([ '{invalid', JSON.stringify({ ...validResponse, extra: 1 }), 'x'.repeat(110000) ][count++]);
  });
  for (let i = 0; i < 3; i++) await assert.rejects(client.structuredCompletion(request, metadata()), expectCode('INVALID_RESPONSE'));
});

test('cancela ante timeout y distingue conexión rechazada', async (t) => {
  const client = await setup(t, () => {});
  await assert.rejects(client.structuredCompletion(request, metadata(80)), expectCode('TIMEOUT'));
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const baseUrl = `http://127.0.0.1:${port}`;
  const unavailable = createAiGatewayClient({ baseUrl, getServiceToken: async () => token, schemas, httpAuthorization: { origin: baseUrl, environment: 'test' } });
  await assert.rejects(unavailable.structuredCompletion(request, metadata()), expectCode('TRANSPORT'));
});

test('deniega credenciales ausentes o fallidas y metadatos inválidos', async (t) => {
  let called = false;
  const client = await setup(t, () => { called = true; }, async () => { throw new Error('private-data'); });
  await assert.rejects(client.structuredCompletion(request, metadata()), expectCode('CREDENTIALS'));
  const missing = await setup(t, () => { called = true; }, async () => '');
  await assert.rejects(missing.structuredCompletion(request, metadata()), expectCode('CREDENTIALS'));
  await assert.rejects(client.structuredCompletion(request, { ...metadata(), requestId: 'invalid' }), expectCode('INVALID_REQUEST'));
  assert.equal(called, false);
});

test('el deadline incluye la espera de credenciales', async (t) => {
  let called = false;
  const client = await setup(t, () => { called = true; }, () => new Promise(() => {}));
  await assert.rejects(client.structuredCompletion(request, metadata(80)), expectCode('TIMEOUT'));
  assert.equal(called, false);
});

test('política de transporte exige autorización exacta para HTTP permitido', () => {
  const options = { schemas, getServiceToken: async () => token };
  assert.doesNotThrow(() => createAiGatewayClient({ ...options, baseUrl: 'https://example.com' }));
  for (const baseUrl of ['http://example.com', 'http://127.0.0.1:3100', 'http://localhost:3100', 'http://ai-gateway:3100', 'http://ai-gateway.evil:3100', 'ftp://localhost', 'https://user:password@example.com']) {
    assert.throws(() => createAiGatewayClient({ ...options, baseUrl }), expectCode('CONFIG'));
  }
  assert.doesNotThrow(() => createAiGatewayClient({ ...options, baseUrl: 'http://localhost:3100', httpAuthorization: { origin: 'http://localhost:3100', environment: 'test' } }));
  assert.doesNotThrow(() => createAiGatewayClient({ ...options, baseUrl: 'http://127.0.0.1:3100', httpAuthorization: { origin: 'http://127.0.0.1:3100', environment: 'development' } }));
  assert.doesNotThrow(() => createAiGatewayClient({ ...options, baseUrl: 'http://ai-gateway:3100', httpAuthorization: { origin: 'http://ai-gateway:3100', environment: 'production' } }));
  for (const [baseUrl, authorization] of [
    ['http://127.0.0.1:3100', { origin: 'http://127.0.0.1:3100', environment: 'production' }],
    ['http://ai-gateway:3101', { origin: 'http://ai-gateway:3100', environment: 'development' }],
    ['http://ai-gateway.evil:3100', { origin: 'http://ai-gateway.evil:3100', environment: 'development' }],
    ['http://example.com', { origin: 'http://example.com', environment: 'development' }],
    ['http://localhost:3100', { origin: 'http://localhost:3100' }],
  ]) assert.throws(() => createAiGatewayClient({ ...options, baseUrl, httpAuthorization: authorization }), expectCode('CONFIG'));
});

test('rechaza redirecciones sin enviar credenciales al destino', async (t) => {
  let redirected = false;
  const target = createServer((_req, res) => { redirected = true; res.end(); });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => target.close(resolve)));
  const client = await setup(t, (_req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/` }); res.end(); });
  await assert.rejects(client.structuredCompletion(request, metadata()), expectCode('TRANSPORT'));
  assert.equal(redirected, false);
});
