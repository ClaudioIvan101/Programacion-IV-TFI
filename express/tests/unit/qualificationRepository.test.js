import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApplyQualificationData } from '../../src/domain/leads/applyQualificationData.js';
import { createPostgresQualificationRepository } from '../../src/infra/qualificationRepository.js';

test('conserva el NUMERIC original al editar otros datos y permite escribir cero', async () => {
  const updates = [];
  const current = { needs: 'Casa', urgency: null, budgetAmount: 999999999999.1234, budgetCurrency: 'USD' };
  const client = {
    async query(sql, values) {
      if (sql.startsWith('SELECT')) return { rows: [current] };
      if (sql.startsWith('UPDATE')) {
        updates.push({ sql, values });
        return { rows: [{ id: 'lead' }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const qualificationRepository = createPostgresQualificationRepository({ connect: async () => client });
  const apply = makeApplyQualificationData({ qualificationRepository });
  const origin = { leadId: 'lead', conversationId: 'conversation' };

  await apply({ ...origin, data: { urgency: 'Durante el mes' } });
  // El valor leído como Number ya perdió precisión: se conserva la columna NUMERIC, no ese valor.
  assert.match(updates[0].sql, /budget_amount = COALESCE\(\$7, l\.budget_amount\)/);
  assert.deepEqual(updates[0].values, ['lead', 'Casa', 'Durante el mes', null, null, '{}', null, 'USD']);

  await apply({ ...origin, data: { budgetAmount: 0 } });
  assert.deepEqual(updates[1].values, ['lead', 'Casa', null, null, null, '{}', 0, null]);
});
