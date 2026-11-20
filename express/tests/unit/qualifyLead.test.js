import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidRuleSetError, makeQualificationUseCases, scoreLead, validateRuleSet } from '../../src/domain/leads/qualifyLead.js';

// Datos sintéticos: los valores del ejemplo no son criterios comerciales del proyecto.
const budget = { type: 'minimumBudget', currency: 'USD', minimumAmount: 1000, points: 5 };
const needs = { type: 'hasNeeds', points: 2 };
const urgency = { type: 'hasUrgency', points: -2 };
const config = { threshold: 5, rules: [budget, needs, urgency] };

test('evalúa el límite inclusivo y registra bonificaciones y penalizaciones', () => {
  const result = scoreLead({ budgetAmount: 1000, budgetCurrency: 'USD', needs: 'Casa', urgency: 'Pronto' }, config);
  assert.equal(result.decision, 'qualified');
  assert.equal(result.score, 5);
  assert.deepEqual(result.breakdown.map(({ points }) => points), [5, 2, -2]);
});

test('distingue pendiente, moneda no aplicable y un cero evaluado', () => {
  const justBudget = { threshold: 5, rules: [budget] };
  const missing = scoreLead({ budgetAmount: 0, budgetCurrency: null }, justBudget);
  assert.equal(missing.decision, 'pending');
  assert.equal(missing.score, null);
  assert.equal(missing.breakdown[0].status, 'pending');

  const mismatch = scoreLead({ budgetAmount: 1000, budgetCurrency: 'ARS' }, justBudget);
  assert.equal(mismatch.score, null);
  assert.equal(mismatch.breakdown[0].status, 'not_applicable');
  assert.equal(scoreLead({ budgetAmount: 1000, budgetCurrency: 'ARS', needs: 'Casa' },
    { threshold: 2, rules: [budget, needs] }).score, 2);

  const zero = scoreLead({ budgetAmount: 0, budgetCurrency: 'USD' }, justBudget);
  assert.equal(zero.decision, 'not_qualified');
  assert.equal(zero.score, 0);
  assert.equal(scoreLead({ budgetAmount: 1000, budgetCurrency: 'USD', needs: null },
    { threshold: 5, rules: [budget, needs] }).decision, 'pending');
});

test('valida publicación y versión antes de pedir persistencia', async () => {
  assert.deepEqual(validateRuleSet(config), config);
  for (const input of [
    { threshold: 0, rules: [budget] },
    { threshold: 5, rules: [] },
    { threshold: 5, rules: [budget, budget] },
    { threshold: 5, rules: [{ ...budget, currency: 'EUR' }] },
    { threshold: 5, rules: [{ ...budget, minimumAmount: -1 }] },
    { threshold: 5, rules: [{ type: 'madeUp', points: 1 }] },
    { threshold: 5, rules: [{ ...needs, points: 0.5 }] },
  ]) {
    assert.throws(() => validateRuleSet(input), InvalidRuleSetError);
  }
  const useCases = makeQualificationUseCases({
    qualificationRepository: {
      createRuleSet: async (input) => ({ version: 1, ...input }),
      recordQualification: async (_id, _version, evaluate) => evaluate({ needs: 'Casa' }, { threshold: 2, rules: [needs] }),
      listQualifications: async () => [],
    },
  });
  assert.equal((await useCases.publishRuleSet(config)).version, 1);
  await assert.rejects(useCases.qualifyLead('lead', 0), InvalidRuleSetError);
  assert.equal((await useCases.qualifyLead('lead', 1)).score, 2);
  assert.deepEqual(await useCases.listQualifications('lead'), []);
});
