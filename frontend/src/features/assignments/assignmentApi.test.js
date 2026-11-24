import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentApi, formatResponseTime } from './assignmentApi.js';

test('uses the authenticated assignment routes without repeating a notification', async () => {
  const calls = [];
  const api = assignmentApi('actor', () => {}, async (...args) => {
    calls.push(args);
    return Response.json({ ok: true });
  });
  await api.list();
  await api.create({ leadId: 'lead', sellerId: 'seller' });
  await api.retry('assignment');
  await api.firstContact('assignment');
  assert.deepEqual(calls.map(([path, init]) => [path, init.method, init.headers.Authorization]), [
    ['/api/assignments', 'GET', 'Bearer actor'],
    ['/api/assignments', 'POST', 'Bearer actor'],
    ['/api/assignments/assignment/retry', 'POST', 'Bearer actor'],
    ['/api/assignments/assignment/first-contact', 'POST', 'Bearer actor'],
  ]);
  assert.deepEqual(JSON.parse(calls[1][1].body), { leadId: 'lead', sellerId: 'seller' });
});

test('shows duration only after the first contact is recorded', () => {
  assert.equal(formatResponseTime(null), 'Sin contacto registrado');
  assert.equal(formatResponseTime(0), '0 s');
  assert.equal(formatResponseTime(3672), '1 h 1 min 12 s');
});
