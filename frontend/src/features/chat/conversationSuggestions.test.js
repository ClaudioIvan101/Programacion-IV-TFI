import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationSuggestions } from './conversationSuggestions.js';

test('maps only available facts and does not invent a currency', () => {
  assert.deepEqual(conversationSuggestions(null), {});
  assert.deepEqual(conversationSuggestions({
    contacto: { nombre: 'Ana' }, necesidades: 'Alquiler', presupuesto: { monto: 0, moneda: null },
  }), { needs: 'Alquiler', budgetAmount: 0, budgetCurrency: null });
});
