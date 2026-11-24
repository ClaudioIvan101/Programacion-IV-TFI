import assert from 'node:assert/strict';
import test from 'node:test';
import { qualificationApi, qualificationData } from './qualificationApi.js';

test('builds qualification data without silently losing a zero budget', () => {
  assert.deepEqual(qualificationData({ needs: ' Rent ', urgency: '', budgetAmount: 0, budgetCurrency: 'USD' }),
    { needs: 'Rent', budgetAmount: 0, budgetCurrency: 'USD' });
  assert.throws(() => qualificationData({ needs: '', urgency: '', budgetAmount: '', budgetCurrency: 'USD' }));
});

test('saves conversation facts and scores the lead with a version', async () => {
  const calls = [];
  const api = qualificationApi('test-token', () => {}, async (url, options) => {
    calls.push([url, options.method, JSON.parse(options.body), options.headers.Authorization]);
    return new Response('{}');
  });
  await api.saveFacts('lead', 'conversation', { needs: 'Rent' });
  await api.qualify('lead', 2);
  assert.deepEqual(calls, [
    ['/api/leads/lead/conversations/conversation/qualification-data', 'PATCH', { needs: 'Rent' }, 'Bearer test-token'],
    ['/api/leads/lead/qualifications', 'POST', { ruleSetVersion: 2 }, 'Bearer test-token'],
  ]);
});
