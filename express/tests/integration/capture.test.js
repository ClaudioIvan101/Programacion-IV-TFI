import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { DuplicateChannelError, CampaignNotFoundError, FormNotFoundError } from '../../src/domain/capture/errors.js';

const id = 'af24e13f-a33f-4a5d-9e76-cbc3cdd7550a';
async function start(t, authorize) {
  const channels = [];
  const forms = [];
  const capture = {
    ...(authorize ? { authorize: async () => true } : {}),
    addCampaignChannel: async (campaignId, channel) => {
      if (channels.includes(channel)) throw new DuplicateChannelError();
      channels.push(channel); return { campaignId, channel };
    },
    listCampaignChannels: async () => channels,
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
  const base = await start(t, true);
  const channelUrl = `${base}/campaigns/${id}/channels`;
  assert.equal((await post(channelUrl, { channel: 'form' })).status, 201);
  assert.equal((await post(channelUrl, { channel: 'form' })).status, 409);
  assert.deepEqual(await (await fetch(channelUrl)).json(), ['form']);
  assert.equal((await post(channelUrl, { channel: 'other' })).status, 400);
  assert.equal((await post(channelUrl, { channel: 'form', extra: true })).status, 400);
  assert.equal((await fetch(`${base}/campaigns/invalid/channels`)).status, 400);
  assert.equal((await fetch(`${base}/forms/${id}`)).status, 404);
  assert.equal((await post(`${base}/forms`, { name: 'Nombre', campaignId: id })).status, 404);
  assert.equal((await post(`${base}/forms`, { name: 'Nombre', campaignId: null })).status, 201);
  assert.equal((await fetch(`${base}/forms/${id}`)).status, 200);
  assert.equal((await fetch(`${base}/forms`, { method: 'POST' })).status, 415);
});

test('HTTP de captación deniega por defecto las cuatro operaciones', async (t) => {
  const base = await start(t, false);
  assert.equal((await post(`${base}/campaigns/${id}/channels`, { channel: 'form' })).status, 403);
  assert.equal((await fetch(`${base}/campaigns/${id}/channels`)).status, 403);
  assert.equal((await post(`${base}/forms`, { name: 'Nombre' })).status, 403);
  assert.equal((await fetch(`${base}/forms/${id}`)).status, 403);
});
