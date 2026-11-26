import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRuleOption,
  knownRuleVersions,
  mergeRuleSets,
  previewQualification,
  ruleVersion,
} from './ruleSelection.js';

test('offers only confirmed versions from this session or this interested person’s history', () => {
  assert.deepEqual(knownRuleVersions(
    [{ version: 12 }, { version: 10 }],
    [{ ruleSetVersion: 10 }, { ruleSetVersion: 8 }, { ruleSetVersion: 8 }, { ruleSetVersion: null }],
  ), [
    { value: '12', label: 'Versión 12 · Publicada en esta sesión' },
    { value: '10', label: 'Versión 10 · Publicada en esta sesión' },
    { value: '8', label: 'Versión 8 · Usada con este interesado' },
  ]);
  assert.deepEqual(knownRuleVersions([], null), []);
});

test('merges persisted rule sets with session publications without duplicates', () => {
  const merged = mergeRuleSets(
    [{ version: 2, threshold: 20, rules: [] }, { version: 1, threshold: 10, rules: [] }],
    [{ version: 3, threshold: 30, rules: [] }, { version: 2, threshold: 20, rules: [] }],
  );
  assert.deepEqual(merged.map((r) => r.version), [3, 2, 1]);
  assert.equal(
    formatRuleOption({
      version: 2,
      threshold: 25,
      rules: [
        { type: 'hasNeeds', points: 10 },
        { type: 'minimumBudget', currency: 'USD', minimumAmount: 50000, points: 20 },
      ],
    }),
    'v2 · Umbral 25 pts · Necesidad (+10) · USD (+20)',
  );
});

test('computes deterministic live qualification preview matching backend rules', () => {
  const ruleSet = {
    version: 4,
    threshold: 25,
    rules: [
      { type: 'hasNeeds', points: 10 },
      { type: 'minimumBudget', currency: 'USD', minimumAmount: 100000, points: 20 },
    ],
  };

  assert.equal(previewQualification({ needs: 'Casa', budgetAmount: '', budgetCurrency: null }, ruleSet).decision, 'pending');
  assert.equal(previewQualification({ needs: 'Casa', budgetAmount: 100000, budgetCurrency: null }, ruleSet).decision, 'pending');

  const qualified = previewQualification({ needs: 'Casa', budgetAmount: 120000, budgetCurrency: 'USD' }, ruleSet);
  assert.equal(qualified.decision, 'qualified');
  assert.equal(qualified.score, 30);

  const notQualified = previewQualification({ needs: 'Casa', budgetAmount: 50000, budgetCurrency: 'USD' }, ruleSet);
  assert.equal(notQualified.decision, 'not_qualified');
  assert.equal(notQualified.score, 10);

  const otherCurrency = previewQualification({ needs: 'Casa', budgetAmount: 50000, budgetCurrency: 'ARS' }, ruleSet);
  assert.equal(otherCurrency.decision, 'not_qualified');
  assert.equal(otherCurrency.score, 10);
  assert.equal(otherCurrency.breakdown[1].status, 'not_applicable');
});

test('computes partial budget, zones, financing, completeness, custom criteria and review band', () => {
  const richRule = {
    version: 5,
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
      { type: 'customCriteria', id: 'cr-1', name: 'Sin venta encadenada', points: 10 },
    ],
  };

  const review = previewQualification({
    email: 'ana@example.com',
    needs: 'Depto',
    budgetAmount: 85000,
    budgetCurrency: 'USD',
    urgency: '1 a 3 meses',
    zone: 'Caballito',
    financing: 'Crédito aprobado',
    customChecks: { 'cr-1': false },
  }, richRule);
  assert.equal(review.score, 50);
  assert.equal(review.decision, 'review');

  const qualified = previewQualification({
    email: 'ana@example.com',
    needs: 'Depto',
    budgetAmount: 120000,
    budgetCurrency: 'USD',
    urgency: 'Inmediata (0-30 días)',
    zone: 'Palermo',
    financing: 'Contado / Propios',
    customChecks: { 'cr-1': true },
  }, richRule);
  assert.equal(qualified.score, 110);
  assert.equal(qualified.decision, 'qualified');
});

test('only accepts valid positive published-version numbers', () => {
  assert.equal(ruleVersion('12'), 12);
  assert.equal(ruleVersion(1), 1);
  for (const value of ['', null, -1, 2.5, '2e2', '2.0', '2147483648']) {
    assert.equal(ruleVersion(value), null);
  }
});
