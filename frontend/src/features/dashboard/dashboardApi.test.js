import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardApi, leadLabel, loadLeadOverview } from './dashboardApi.js';

test('lead label works for leads without a name', () => {
  assert.equal(leadLabel({ name: 'Camila', email: 'camila@example.com' }), 'Camila');
  assert.equal(leadLabel({ name: null, email: 'camila@example.com', phone: '555123' }), 'camila@example.com');
  assert.equal(leadLabel({ name: null, email: null, phone: '555123' }), '555123');
  assert.equal(leadLabel({ name: null, email: null, phone: null }), 'Interesado sin nombre');
});

test('uses latest persisted decision and leaves missing history pending', async () => {
  const leads = ['a', 'b', 'c', 'd'].map((id) => ({ id, status: 'new' }));
  const history = {
    a: [{ decision: 'qualified' }, { decision: 'pending' }],
    b: [],
    c: [{ decision: 'not_qualified' }],
    d: [{ decision: 'pending' }],
  };
  const overview = await loadLeadOverview({
    listLeads: async () => leads,
    listQualifications: async (id) => history[id],
  });
  assert.deepEqual(overview.counts, { total: 4, qualified: 1, pending: 2 });
});

test('keeps total but does not invent counts when history cannot be read', async () => {
  const overview = await loadLeadOverview({
    listLeads: async () => [{ id: 'a' }],
    listQualifications: async () => { throw new Error('unavailable'); },
  });
  assert.equal(overview.leads[0].decision, null);
  assert.deepEqual(overview.counts, { total: 1, qualified: null, pending: null });
});

test('registers leads and returns the original chat turn response', async () => {
  const requests = [];
  const turn = { context: { presupuesto: { monto: 0, moneda: null } }, missingFields: ['presupuesto'] };
  const api = dashboardApi('demo-token', () => {}, async (path, options) => {
    requests.push([path, options.method, options.headers.Authorization, JSON.parse(options.body)]);
    return Response.json(path.endsWith('/turn') ? turn : {});
  });
  const lead = { name: 'Ana', budgetAmount: 0, budgetCurrency: null, channel: 'form', formId: 'form-id' };
  await api.createLead(lead);
  assert.deepEqual(await api.sendMessage('conversation-id', 'Hola'), turn);
  await api.createForm(' Alquileres ');
  assert.deepEqual(requests, [
    ['/api/leads', 'POST', 'Bearer demo-token', lead],
    ['/api/conversations/conversation-id/turn', 'POST', 'Bearer demo-token', { content: 'Hola' }],
    ['/api/forms', 'POST', 'Bearer demo-token', { name: 'Alquileres' }],
  ]);
});

test('401 ends the session, while a 503 in chat explains the assistant dependency', async () => {
  let expired = 0;
  const api = dashboardApi('demo-token', () => { expired += 1; },
    async () => new Response(null, { status: 401 }));
  await assert.rejects(() => api.listLeads(), { status: 401 });
  assert.equal(expired, 1);
  const offline = dashboardApi('demo-token', () => {}, async () => new Response(null, { status: 503 }));
  await assert.rejects(() => offline.sendMessage('conversation-id', 'Hola'), /asistente.*no está disponible/i);
});
