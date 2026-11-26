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
      listRuleSets: async () => [{ version: 1, ...config }],
      recordQualification: async (_id, _version, evaluate) => evaluate({ needs: 'Casa' }, { threshold: 2, rules: [needs] }),
      listQualifications: async () => [],
    },
  });
  assert.equal((await useCases.publishRuleSet(config)).version, 1);
  assert.equal((await useCases.listRuleSets()).length, 1);
  await assert.rejects(useCases.qualifyLead('lead', 0), InvalidRuleSetError);
  assert.equal((await useCases.qualifyLead('lead', 1)).score, 2);
  assert.deepEqual(await useCases.listQualifications('lead'), []);
});

test('evalúa presupuesto parcial, urgencia, zonas, financiación, completitud, personalizados y estado en revisión', () => {
  const fullConfig = {
    name: 'Estándar Inmobiliario',
    status: 'active',
    threshold: 70,
    discardThreshold: 45,
    rules: [
      { type: 'minimumBudget', currency: 'USD', minimumAmount: 100000, points: 35, partialEnabled: true, partialPoints: 15 },
      { type: 'urgencyTiers', tiers: [{ key: 'Inmediata (0-30 días)', points: 25 }, { key: '1 a 3 meses', points: 15 }] },
      { type: 'priorityZones', zones: ['Palermo', 'Belgrano'], points: 15 },
      { type: 'financingTiers', tiers: [{ key: 'Contado / Propios', points: 15 }, { key: 'Crédito aprobado', points: 10 }] },
      { type: 'dataCompleteness', fullPoints: 10, partialPoints: 5 },
      { type: 'customCriteria', id: 'cr-1', name: 'Sin venta encadenada', condition: 'No vende antes', points: 10 },
    ],
  };

  assert.deepEqual(validateRuleSet(fullConfig), fullConfig);

  const reviewLead = scoreLead({
    email: 'ana@example.com',
    needs: 'Depto 2 ambientes',
    budgetAmount: 85000,
    budgetCurrency: 'USD',
    urgency: '1 a 3 meses',
    zone: 'Almagro',
    financing: 'Crédito aprobado',
    customChecks: { 'cr-1': false },
  }, fullConfig);
  // 15 (parcial 85%) + 15 (1 a 3 meses) + 0 (Almagro) + 10 (Crédito) + 10 (Completo) + 0 = 50 -> En revisión (>=45 y <70)
  assert.equal(reviewLead.score, 50);
  assert.equal(reviewLead.decision, 'review');

  const qualifiedLead = scoreLead({
    email: 'ana@example.com',
    needs: 'Depto 2 ambientes',
    budgetAmount: 120000,
    budgetCurrency: 'USD',
    urgency: 'Inmediata (0-30 días)',
    zone: 'Palermo Soho',
    financing: 'Contado / Propios',
    customChecks: { 'cr-1': true },
  }, fullConfig);
  // 35 + 25 + 15 + 15 + 10 + 10 = 110 -> Calificado
  assert.equal(qualifiedLead.score, 110);
  assert.equal(qualifiedLead.decision, 'qualified');
});
