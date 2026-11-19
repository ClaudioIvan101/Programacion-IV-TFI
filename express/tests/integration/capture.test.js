import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app.js';
import { createJwtAuthenticator } from '../../src/infra/jwtAuthenticator.js';
import { DuplicateChannelError, CampaignNotFoundError, FormNotFoundError } from '../../src/domain/capture/errors.js';

const id = 'af24e13f-a33f-4a5d-9e76-cbc3cdd7550a';
// Cada escenario abre un servidor local con datos en memoria y lo cierra al terminar.
async function start(t, authenticate) {
  const channels = [];
  const forms = [];
  const capture = {
    authenticate,
    addCampaignChannel: async (campaignId, channel) => {
      if (channels.includes(channel)) throw new DuplicateChannelError();
      channels.push(channel); return { campaignId, channel };
    },
    listCampaignChannels: async () => channels,
    // El doble no carga campañas: un vínculo informado representa una referencia inexistente.
    createForm: async ({ name, campaignId = null }) => {
      if (campaignId) throw new CampaignNotFoundError();
      const form = { id, name, campaignId }; forms.push(form); return form;
    },
    getFormById: async () => { if (!forms.length) throw new FormNotFoundError(); return forms[0]; },
  };
  const server = createApp({ capture }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('HTTP de captación valida, crea, consulta y traduce conflictos', async (t) => {
  const base = await start(t, async () => ({ role: 'administrador', status: 'active' }));
  // Cubre ambos canales permitidos, la duplicación y las entradas fuera del contrato.
  const channelUrl = `${base}/campaigns/${id}/channels`;
  assert.equal((await post(channelUrl, { channel: 'form' })).status, 201);
  assert.equal((await post(channelUrl, { channel: 'form' })).status, 409);
  assert.equal((await post(channelUrl, { channel: 'simulated_messaging' })).status, 201);
  assert.deepEqual(await (await fetch(channelUrl)).json(), ['form', 'simulated_messaging']);
  assert.equal((await post(channelUrl, { channel: 'other' })).status, 400);
  assert.equal((await post(channelUrl, { channel: 'form', extra: true })).status, 400);
  assert.equal((await fetch(`${base}/campaigns/invalid/channels`)).status, 400);
  // También se consulta un formulario antes y después de crearlo.
  assert.equal((await fetch(`${base}/forms/${id}`)).status, 404);
  assert.equal((await post(`${base}/forms`, { name: 'Nombre', campaignId: id })).status, 404);
  assert.equal((await post(`${base}/forms`, { name: 'Nombre', campaignId: null })).status, 201);
  assert.equal((await fetch(`${base}/forms/${id}`)).status, 200);
  assert.equal((await fetch(`${base}/forms`, { method: 'POST' })).status, 415);
});

test('HTTP de captación deniega por defecto las cuatro operaciones', async (t) => {
  // Sin autenticador inyectado se conserva el cierre por defecto en las cuatro rutas.
  const base = await start(t);
  const response = await post(`${base}/campaigns/${id}/channels`, { channel: 'form' });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal((await fetch(`${base}/campaigns/${id}/channels`)).status, 401);
  assert.equal((await post(`${base}/forms`, { name: 'Nombre' })).status, 401);
  assert.equal((await fetch(`${base}/forms/${id}`)).status, 401);
});

test('captación verifica JWT y consulta el rol y estado actuales', async (t) => {
  const secretHex = 'ab'.repeat(32); // Clave exclusiva de la prueba.
  let user = { role: 'vendedor', status: 'active' };
  let lookupFailed = false;

  const authenticate = createJwtAuthenticator({
    secretHex,
    findUserById: async (userId) => {
      if (lookupFailed) throw new Error('Base no disponible.');
      return userId === id ? user : null;
    },
  });
  const base = await start(t, authenticate);

  // El rol administrativo dentro del JWT no debe prevalecer sobre el rol actual del usuario.
  const sign = (key = secretHex, expires = '5m', audience = 'leadqual-core-api') =>
    new SignJWT({ role: 'administrador' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(id)
      .setIssuer('leadqual')
      .setAudience(audience)
      .setExpirationTime(expires)
      .sign(Buffer.from(key, 'hex'));

  const get = (token) => fetch(`${base}/campaigns/${id}/channels`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Se prueban un token malformado, una firma ajena, un vencimiento y una audiencia incorrecta.
  const rejected = [
    'invalid-token',
    await sign('cd'.repeat(32)),
    await sign(secretHex, 1),
    await sign(secretHex, '5m', 'otro-servicio'),
  ];
  for (const token of rejected) {
    const response = await get(token);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  }

  const token = await sign();
  assert.equal((await get(token)).status, 403);

  // El mismo token se reutiliza para comprobar que los cambios de rol y estado tienen efecto inmediato.
  user = { role: 'administrador', status: 'active' };
  const response = await get(token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);

  user = { ...user, status: 'inactive' };
  assert.equal((await get(token)).status, 403);

  // Una caída del repositorio es un fallo interno, no un rechazo de credenciales.
  lookupFailed = true;
  const failure = await get(token);
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: 'Internal server error' });
});

test('captación deniega sin clave y rechaza una clave inválida', async () => {
  const findUserById = async () => assert.fail('No debe consultar usuarios sin una clave.');
  const authenticate = createJwtAuthenticator({ findUserById });
  assert.equal(await authenticate('Bearer invalid-token'), null);
  assert.throws(() => createJwtAuthenticator({ secretHex: 'abc', findUserById }), /JWT_SECRET_HEX/);
});
