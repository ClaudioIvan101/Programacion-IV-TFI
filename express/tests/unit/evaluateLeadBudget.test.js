import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvaluateLeadBudget } from '../../src/domain/leads/evaluateLeadBudget.js';

// Umbral y puntos de ejemplo; no definen la política comercial.
const rule = { currency: 'USD', minimumAmount: 1000, points: 5 };

function evaluateBudget(budgetAmount, budgetCurrency) {
  // Simulamos la lectura del lead para probar la regla sin PostgreSQL.
  const evaluate = makeEvaluateLeadBudget({
    leadRepository: {
      getLead: async () => ({ budgetAmount, budgetCurrency }),
    },
  });

  return evaluate('lead-1', rule);
}

test('al alcanzar el umbral, aplica los puntos configurados', async () => {
  assert.deepEqual(await evaluateBudget(1000, 'USD'), {
    status: 'evaluated', points: 5,
  });
});

test('un presupuesto conocido de cero se evalúa y suma cero', async () => {
  assert.deepEqual(await evaluateBudget(0, 'USD'), {
    status: 'evaluated', points: 0,
  });
});

test('si falta el monto o la moneda, deja la regla pendiente', async () => {
  const pending = { status: 'pending', points: null };

  assert.deepEqual(await evaluateBudget(null, 'USD'), pending);
  assert.deepEqual(await evaluateBudget(1000, null), pending);
});

test('no compara presupuestos expresados en monedas distintas', async () => {
  assert.deepEqual(await evaluateBudget(1000, 'ARS'), {
    status: 'not_applicable', points: null,
  });
});