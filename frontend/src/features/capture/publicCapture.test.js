import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCapture } from './publicCapture.js';

test('public browser sends only contact fields and never supplies an operator token', async () => {
  const requests = [];
  const api = publicCapture('form-id', async (path, options) => {
    requests.push({ path, ...options });
    return new Response(JSON.stringify(options.method === 'POST' ? { received: true } : { name: 'Alquileres' }));
  });
  assert.deepEqual(await api.load(), { name: 'Alquileres' });
  await api.submit({ name: ' Ana ', email: ' ana@example.invalid ', phone: '', needs: ' ', campaignId: 'other' });
  assert.equal(requests[1].path, '/api/public/forms/form-id');
  assert.deepEqual(JSON.parse(requests[1].body), { name: 'Ana', email: 'ana@example.invalid' });
  assert.deepEqual(requests[1].headers, { 'Content-Type': 'application/json' });
  await assert.rejects(api.submit({ name: 'Ana', email: '', phone: '' }), /correo o teléfono/i);
  assert.equal(requests.length, 2);
});
