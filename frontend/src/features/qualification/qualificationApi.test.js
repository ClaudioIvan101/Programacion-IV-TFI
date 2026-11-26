import assert from 'node:assert/strict';
import test from 'node:test';
import { hasUnconfirmedFacts, qualificationApi, qualificationData, ruleSetData } from './qualificationApi.js';

test('a changed draft requires confirmation without blocking equivalent saved facts', () => {
  const lead = { needs: 'Alquiler', budgetAmount: 0, budgetCurrency: null };
  assert.equal(hasUnconfirmedFacts({ needs: ' Alquiler ', urgency: '', budgetAmount: '0', budgetCurrency: null }, lead), false);
  assert.equal(hasUnconfirmedFacts({ ...lead, needs: 'Compra' }, lead), true);
  assert.equal(hasUnconfirmedFacts({ ...lead, budgetAmount: '' }, lead), true);
});

test('combines optional criteria and rejects an incomplete score configuration', () => {
  assert.deepEqual(ruleSetData('25', { hasNeeds: '15', hasUrgency: 10 }, 'USD', ''), {
    threshold: 25, rules: [{ type: 'hasNeeds', points: 15 }, { type: 'hasUrgency', points: 10 }],
  });
  assert.deepEqual(ruleSetData('5', { minimumBudget: 5 }, 'USD', 0).rules[0],
    { type: 'minimumBudget', currency: 'USD', minimumAmount: 0, points: 5 });
  assert.throws(() => ruleSetData(5, { minimumBudget: 5 }, 'USD', ''), /monto/i);
  assert.throws(() => ruleSetData(5, {}, 'USD', ''), /criterio/i);
});

test('builds qualification data without silently losing a zero budget', () => {
  assert.deepEqual(qualificationData({ needs: ' Rent ', urgency: '', budgetAmount: 0, budgetCurrency: 'USD' }),
    { needs: 'Rent', budgetAmount: 0, budgetCurrency: 'USD' });
  assert.throws(() => qualificationData({ needs: '', urgency: '', budgetAmount: '', budgetCurrency: 'USD' }));
});

test('saves conversation facts and scores the lead with a version', async () => {
  const calls = [];
  const api = qualificationApi('test-token', () => {}, async (url, options) => {
    calls.push([url, options.method, options.body ? JSON.parse(options.body) : null, options.headers.Authorization]);
    return new Response('{}');
  });
  await api.ruleSets();
  await api.messages('conversation');
  await api.saveFacts('lead', 'conversation', { needs: 'Rent' });
  await api.qualify('lead', 2);
  assert.deepEqual(calls, [
    ['/api/lead-scoring-rule-sets', 'GET', null, 'Bearer test-token'],
    ['/api/conversations/conversation/messages', 'GET', null, 'Bearer test-token'],
    ['/api/leads/lead/conversations/conversation/qualification-data', 'PATCH', { needs: 'Rent' }, 'Bearer test-token'],
    ['/api/leads/lead/qualifications', 'POST', { ruleSetVersion: 2 }, 'Bearer test-token'],
  ]);
});
