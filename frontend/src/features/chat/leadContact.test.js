import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidEmail, isValidPhone, leadContact } from './leadContact.js';

test('maps a single contact to the existing email or phone field without losing formatting', () => {
  assert.deepEqual(leadContact(' persona@ejemplo.com '), { email: 'persona@ejemplo.com', phone: null });
  assert.deepEqual(leadContact(' +54 9 (11) 5555-1234 '), { email: null, phone: '+54 9 (11) 5555-1234' });
  assert.deepEqual(leadContact('4321-5678'), { email: null, phone: '4321-5678' });
});

test('rejects empty, non-numeric phones, short numbers, invalid emails and overlong values', () => {
  assert.throws(() => leadContact(''), /correo electrónico o un número de teléfono/i);
  assert.throws(() => leadContact('   '), /correo electrónico o un número de teléfono/i);
  for (const value of ['alguien@', 'a@b', 'a@b.c', 'a'.repeat(247) + '@prueba.com']) {
    assert.throws(() => leadContact(value), /correo electrónico válido/i, value);
  }
  for (const value of ['123', '1234', '123456', 'nombre sin teléfono', '+1 hola', '123'.repeat(14), '1234567890123456']) {
    assert.throws(() => leadContact(value), /teléfono válido/i, value);
  }
  assert.equal(isValidEmail('ana@example.com'), true);
  assert.equal(isValidEmail('ana@localhost'), false);
  assert.equal(isValidPhone('+54 9 11 5555-1234'), true);
  assert.equal(isValidPhone('1234'), false);
});
