import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app.js';
import { makeApplyQualificationData } from '../../src/domain/leads/applyQualificationData.js';
import { makeQualificationUseCases } from '../../src/domain/leads/qualifyLead.js';
import { createJwtAuthenticator } from '../../src/infra/jwtAuthenticator.js';

const leadId = 'af24e13f-a33f-4a5d-9e76-cbc3cdd7550a';
const conversationId = '0e90e39a-e5cb-4273-90ef-8fdc87e437ae';
async function start(t, dependencies) {
  const server = createApp({ qualification: dependencies }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('PATCH verifica identidad, rol, vínculo y datos antes de aplicar la actualización', async (t) => {
  let calls = 0;
  const applyQualificationData = makeApplyQualificationData({
    qualificationRepository: {
      updateLeadFromConversation: async (storedLeadId, storedConversationId, merge) => {
        calls++;
        if (storedLeadId !== leadId || storedConversationId !== conversationId) return null;
        return { id: leadId, ...merge({ needs: 'Casa', urgency: null, budgetAmount: 75, budgetCurrency: 'USD' }) };
      },
    },
  });
  // El autenticador real se prueba en captación; este doble separa el control de rol del JWT.
  const authenticate = async (header) => ({
    'Bearer admin': { status: 'active', role: 'administrador' },
    'Bearer seller': { status: 'active', role: 'vendedor' },
    'Bearer disabled': { status: 'inactive', role: 'administrador' },
  })[header] ?? null;
  const base = await start(t, { authenticate, applyQualificationData });
  const patch = (data, token, conversation = conversationId) =>
    fetch(`${base}/leads/${leadId}/conversations/${conversation}/qualification-data`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(data),
    });

  const unauthorized = await patch({});
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal((await patch({}, 'seller')).status, 403);
  assert.equal((await patch({}, 'disabled')).status, 403);
  assert.equal((await patch({ status: 'calificado' }, 'admin')).status, 400);
  assert.equal((await patch({ budgetCurrency: 'ARS' }, 'admin')).status, 400);
  assert.equal(calls, 0);
  assert.equal((await patch({}, 'admin', leadId)).status, 404);
  const result = await patch({ needs: null, urgency: '  Este mes  ', budgetAmount: 0 }, 'admin');
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { id: leadId, needs: 'Casa', urgency: 'Este mes', budgetAmount: 0, budgetCurrency: null });
});

test('publicación e historial exigen JWT válido y rol actual de administrador', async (t) => {
  const key = Buffer.alloc(32, 7); // Solo para este escenario local.
  let role = 'administrador';
  const authenticate = createJwtAuthenticator({
    secretHex: key.toString('hex'),
    findUserById: async () => ({ role, status: 'active' }),
  });
  function token(expires = '5m') {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('leadqual')
      .setAudience('leadqual-core-api')
      .setSubject(leadId)
      .setExpirationTime(expires)
      .sign(key);
  }

  const rules = new Map();
  const history = [];
  const qualificationRepository = {
    createRuleSet: async (config) => {
      const version = rules.size + 1;
      rules.set(version, config);
      return { version, ...config };
    },
    recordQualification: async (id, version, evaluate) => {
      if (id !== leadId || !rules.has(version)) return null;
      const result = {
        leadId: id, ruleSetVersion: version,
        ...evaluate({ budgetAmount: 0, budgetCurrency: 'USD' }, rules.get(version)),
      };
      history.unshift(result);
      return result;
    },
    listQualifications: async (id) => id === leadId ? history : null,
  };
  const base = await start(t, { authenticate, ...makeQualificationUseCases({ qualificationRepository }) });
  const submit = (path, body, credential) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(credential && { Authorization: `Bearer ${credential}` }) },
    body: JSON.stringify(body),
  });
  const publishPath = '/lead-scoring-rule-sets';
  const historyPath = `/leads/${leadId}/qualifications`;
  const config = { threshold: 2, rules: [{ type: 'minimumBudget', currency: 'USD', minimumAmount: 0, points: 2 }] };
  const getHistory = (credential) => fetch(`${base}${historyPath}`, { headers: { Authorization: `Bearer ${credential}` } });

  assert.equal((await submit(publishPath, config)).status, 401);
  const expired = await token(1);
  assert.equal((await submit(historyPath, { ruleSetVersion: 1 }, expired)).status, 401);
  const admin = await token();
  role = 'supervisor';
  assert.equal((await submit(publishPath, config, admin)).status, 403);
  assert.equal((await getHistory(admin)).status, 403);
  role = 'administrador';
  assert.equal((await getHistory(admin)).status, 200);
  assert.deepEqual(await (await getHistory(admin)).json(), []);
  assert.equal((await submit(publishPath, { ...config, unexpected: 1 }, admin)).status, 400);

  const first = await submit(publishPath, config, admin);
  assert.equal(first.status, 201);
  assert.equal((await first.json()).version, 1);
  const second = await submit(publishPath, { ...config, threshold: 3 }, admin);
  assert.equal(second.status, 201);
  assert.equal((await second.json()).version, 2);
  assert.equal((await submit(historyPath, { ruleSetVersion: 1, score: 99 }, admin)).status, 400);
  assert.equal((await submit(historyPath, { ruleSetVersion: 3 }, admin)).status, 404);

  for (const version of [1, 2]) {
    const result = await submit(historyPath, { ruleSetVersion: version }, admin);
    assert.equal(result.status, 201);
    assert.equal((await result.json()).decision, version === 1 ? 'qualified' : 'not_qualified');
  }
  const saved = await (await getHistory(admin)).json();
  assert.deepEqual(saved.map(({ ruleSetVersion, score }) => [ruleSetVersion, score]), [[2, 2], [1, 2]]);
});
