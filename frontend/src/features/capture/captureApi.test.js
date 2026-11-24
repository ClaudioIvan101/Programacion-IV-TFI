import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureApi } from './captureApi.js';

test('requests campaign pages and campaign-scoped forms with the bearer token', async () => {
  const calls = [];
  const api = createCaptureApi('example-token', undefined, async (url, options) => {
    calls.push([url, options.headers.Authorization]);
    if (url.startsWith('/api/campaigns?')) {
      return Response.json({ data: [{ id: 'campaign' }], pagination: { page: 2, limit: 20, total: 21 } });
    }
    return Response.json([]);
  });
  const campaigns = await api.listCampaigns(2);
  await api.listForms('campaign');
  assert.deepEqual(campaigns, { items: [{ id: 'campaign' }], total: 21 });
  assert.deepEqual(calls, [
    ['/api/campaigns?page=2&limit=20', 'Bearer example-token'],
    ['/api/campaigns/campaign/forms', 'Bearer example-token'],
  ]);
});

test('posts a channel and a campaign form with the exact backend payload', async () => {
  const calls = [];
  const api = createCaptureApi('example-token', undefined, async (url, options) => {
    calls.push([url, options.method, options.headers['Content-Type'], options.body]);
    return Response.json({}, { status: 201 });
  });
  await api.addChannel('campaign', 'simulated_messaging');
  await api.createForm('campaign', 'Consulta web');
  assert.deepEqual(calls, [
    ['/api/campaigns/campaign/channels', 'POST', 'application/json', '{"channel":"simulated_messaging"}'],
    ['/api/forms', 'POST', 'application/json', '{"campaignId":"campaign","name":"Consulta web"}'],
  ]);
});

test('forwards unauthorized sessions and preserves the server error', async () => {
  let ended = 0;
  const api = createCaptureApi('expired', () => ended++, async () =>
    Response.json({ error: 'Autenticación requerida.' }, { status: 401 }));
  await assert.rejects(api.listChannels('campaign'), /Autenticación requerida/);
  assert.equal(ended, 1);
});
