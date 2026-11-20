import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidQualificationDataError, makeApplyQualificationData } from '../../src/domain/leads/applyQualificationData.js';

const current = { needs: 'Casa', urgency: 'Este año', budgetAmount: 1000, budgetCurrency: 'USD' };
const apply = makeApplyQualificationData({
  qualificationRepository: {
    updateLeadFromConversation: async (leadId, conversationId, merge) =>
      leadId === 'lead' && conversationId === 'conversation' ? merge(current) : null,
  },
});
const call = (data, conversationId = 'conversation') => apply({ leadId: 'lead', conversationId, data });

test('la conversación aporta solo los datos informados y respeta el par monto/moneda', async () => {
  assert.deepEqual(await call({ needs: null, urgency: 'Pronto' }), { ...current, urgency: 'Pronto' });
  assert.deepEqual(await call({ budgetAmount: 0 }), { ...current, budgetAmount: 0, budgetCurrency: null });
  assert.deepEqual(await call({ budgetAmount: 1000 }), current);
  assert.deepEqual(await call({ budgetAmount: 50, budgetCurrency: 'ARS' }),
    { ...current, budgetAmount: 50, budgetCurrency: 'ARS' });
  await assert.rejects(call({ budgetAmount: null, budgetCurrency: 'ARS' }), InvalidQualificationDataError);
  assert.equal(await call({}, 'other'), null);
});
