import assert from 'node:assert/strict';
import test from 'node:test';
import { leadContact } from './leadContact.js';

test('maps a single contact to the existing email or phone field without losing formatting', () => {
  assert.deepEqual(leadContact(' persona@ejemplo.com '), { email: 'persona@ejemplo.com', phone: null });
  assert.deepEqual(leadContact(' +54 9 (11) 5555-1234 '), { email: null, phone: '+54 9 (11) 5555-1234' });
  assert.deepEqual(leadContact('  '), { email: null, phone: null });
});

test('rejects invalid mixed contact strings as well as overlong values', () => {
  for (const value of ['alguien@', 'nombre sin teléfono', '+1 hola', '123'.repeat(14), 'a'.repeat(247) + '@prueba.com']) {
    assert.throws(() => leadContact(value), /correo o teléfono válido/i, value);
  }
});
