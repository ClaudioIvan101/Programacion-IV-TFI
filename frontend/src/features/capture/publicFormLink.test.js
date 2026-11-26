import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFormLink } from './publicFormLink.js';

test('creates a clean public link with the current deployment origin and base path', () => {
  assert.deepEqual(publicFormLink('https://leads.example.com/leadq/?private=1#/captacion', 'form-id'), {
    href: 'https://leads.example.com/leadq/#/formulario/form-id',
    localOnly: false,
  });
});

test('marks local loopback links without mistaking external hosts for localhost', () => {
  for (const host of ['localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
    assert.equal(publicFormLink(`http://${host}:8080/#/captacion`, 'id').localOnly, true, host);
  }
  for (const host of ['localhost.example.com', '127.0.0.1.example.com', '192.168.1.10']) {
    assert.equal(publicFormLink(`http://${host}:8080/`, 'id').localOnly, false, host);
  }
});
