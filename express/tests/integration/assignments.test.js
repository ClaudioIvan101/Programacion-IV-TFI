import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { makeAssignmentUseCases } from '../../src/domain/assignments/assignmentUseCases.js';

const lead = 'c9774fbb-2af4-4d91-91d0-c4c1afaf8bac';
const vendor = '8a959eb1-2994-480a-a589-8fd28a647cc1';
const other = '8a959eb1-2994-480a-a589-8fd28a647cc2';
const admin = '8a959eb1-2994-480a-a589-8fd28a647cc3';
const assignment = '8a959eb1-2994-480a-a589-8fd28a647cc4';
const actors = { admin: [admin, 'administrador'], supervisor: [admin, 'supervisor'], vendor: [vendor, 'vendedor'], other: [other, 'vendedor'] };

async function fixture(t, send) {
  let row = null;
  const repository = {
    list: async (sellerId) => row && (sellerId == null || sellerId === row.sellerId) ? [row] : [],
    eligible: async () => ({ leads: [{ id: lead }], sellers: [{ id: vendor }] }),
    assign: async ({ leadId, sellerId, assignedBy }) => {
      if (leadId !== lead) return { kind: 'not_qualified' };
      if (sellerId !== vendor) return { kind: 'invalid_seller' };
      if (row) return { kind: 'existing', row };
      row = { id: assignment, leadId, sellerId, assignedBy, attempts: 0, notificationStatus: 'pending' };
      return { kind: 'created', row };
    },
    get: async (id) => row?.id === id ? row : null,
    claim: async (id) => {
      if (row?.id !== id || row.attempts >= 3 || !['pending', 'failed'].includes(row.notificationStatus)) return null;
      row = { ...row, notificationStatus: 'sending', attempts: row.attempts + 1 };
      return { ...row, sellerEmail: 'seller@example.invalid' };
    },
    settle: async (_, status) => { row = { ...row, notificationStatus: status }; },
    recordFirstContact: async (id, sellerId) => {
      if (row?.id !== id || row.sellerId !== sellerId) return null;
      row = row.firstContactAt ? row : { ...row, firstContactAt: '2026-11-24T00:10:00Z', responseSeconds: 600 };
      return row;
    },
  };
  const server = createApp({ assignments: {
    authenticate: async (value) => {
      const actor = actors[value?.split(' ')[1]];
      return actor ? { id: actor[0], role: actor[1], status: 'active' } : null;
    },
    ...makeAssignmentUseCases({ repository, notify: send }),
  } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (path, actor, body, method = body === undefined ? 'GET' : 'POST') =>
    fetch('http://127.0.0.1:' + server.address().port + path, {
      method, headers: { ...(actor && { Authorization: 'Bearer ' + actor }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
}

test('derivación restringe lectura y operaciones por rol y vendedor asignado', async t => {
  let sends = 0;
  const request = await fixture(t, async () => { sends++; return 'sent'; });
  assert.equal((await request('/assignments')).status, 401);
  assert.equal((await request('/assignments/options', 'vendor')).status, 403);
  assert.equal((await request('/assignments', 'vendor', { leadId: lead, sellerId: vendor })).status, 403);
  assert.equal((await request('/assignments', 'admin', { leadId: other, sellerId: vendor })).status, 409);
  assert.equal((await request('/assignments', 'admin', { leadId: lead, sellerId: other })).status, 409);
  const created = await request('/assignments', 'supervisor', { leadId: lead, sellerId: vendor });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).notificationStatus, 'sent');
  assert.equal((await request('/assignments', 'admin', { leadId: lead, sellerId: vendor })).status, 200);
  assert.equal(sends, 1);
  assert.equal((await (await request('/assignments', 'vendor')).json()).assignments.length, 1);
  assert.equal((await (await request('/assignments', 'other')).json()).assignments.length, 0);
  assert.equal((await request('/assignments/' + assignment + '/first-contact', 'admin', undefined, 'POST')).status, 403);
  assert.equal((await request('/assignments/' + assignment + '/first-contact', 'other', undefined, 'POST')).status, 404);
  const recorded = await (await request('/assignments/' + assignment + '/first-contact', 'vendor', undefined, 'POST')).json();
  assert.equal(recorded.responseSeconds, 600);
  const repeat = await (await request('/assignments/' + assignment + '/first-contact', 'vendor', undefined, 'POST')).json();
  assert.equal(repeat.firstContactAt, recorded.firstContactAt);
});

test('el fallo del aviso conserva la derivación y limita los reintentos', async t => {
  let sends = 0;
  const request = await fixture(t, async () => { sends++; return 'failed'; });
  const result = await request('/assignments', 'admin', { leadId: lead, sellerId: vendor });
  assert.equal(result.status, 201);
  assert.equal((await result.json()).notificationStatus, 'failed');
  const path = '/assignments/' + assignment + '/retry';
  assert.equal((await request(path, 'vendor', undefined, 'POST')).status, 403);
  assert.equal((await request(path, 'admin', undefined, 'POST')).status, 200);
  assert.equal((await request(path, 'admin', undefined, 'POST')).status, 200);
  assert.equal((await request(path, 'admin', undefined, 'POST')).status, 409);
  assert.equal(sends, 3);
});

test('un aviso de resultado incierto no vuelve a enviarse', async t => {
  const request = await fixture(t, async () => { throw new Error('Sin confirmación SMTP'); });
  const result = await request('/assignments', 'admin', { leadId: lead, sellerId: vendor });
  assert.equal((await result.json()).notificationStatus, 'uncertain');
  assert.equal((await request('/assignments/' + assignment + '/retry', 'admin', undefined, 'POST')).status, 409);
});
