import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../src/app.js';
import { makeCreateLead } from '../../src/domain/leads/createLead.js';
import { createPostgresLeadRepository } from '../../src/infra/leadRepository.js';
import { createPostgresPool } from '../../src/infra/postgres.js';

test('API de leads, conversaciones y mensajes con PostgreSQL', { timeout: 15_000 }, async (t) => {
  const pool = createPostgresPool();
  const schema = `leads_test_${randomUUID().replaceAll('-', '')}`;
  let client;
  let server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } finally {
      client?.release();
      try { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
      finally { await pool.end(); }
    }
  });

  // El esquema temporal aísla los datos HTTP y permite probar errores de FK sin abortar una transacción compartida.
  client = await pool.connect();
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  for (const file of [
    '001_create_campaigns.sql',
    '004_create_capture_sources.sql',
    '005_create_leads_conversations_messages.sql',
    '006_create_lead_qualifications.sql',
    '010_expand_scoring_and_lead_fields.sql',
  ]) {
    await client.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), 'utf8'));
  }

  const { rows: [campaign, otherCampaign, campaignWithoutChannel] } = await client.query(
    `INSERT INTO campaigns (name, objective) VALUES ('A', 'Consulta'), ('B', 'Consulta'), ('C', 'Consulta') RETURNING id`,
  );
  await client.query(
    `INSERT INTO campaign_channels (campaign_id, channel) VALUES ($1, 'form'), ($2, 'form'), ($2, 'simulated_messaging')`,
    [campaign.id, otherCampaign.id],
  );
  const { rows: [form, standaloneForm, formWithoutChannel] } = await client.query(
    `INSERT INTO forms (name, campaign_id) VALUES ('Vinculado', $1), ('Sin campaña', NULL), ('Sin canal', $2) RETURNING id`,
    [campaign.id, campaignWithoutChannel.id],
  );

  const leadRepository = createPostgresLeadRepository(client);
  const createLead = makeCreateLead({ leadRepository });
  let failAfterRegistration;
  const leads = {
    ...leadRepository,
    async createLead(input, registrationId) {
      const lead = await createLead(input, registrationId);
      if (failAfterRegistration && registrationId === failAfterRegistration) {
        failAfterRegistration = undefined;
        throw new Error('Fallo de prueba después de guardar');
      }
      return lead;
    },
  };
  server = createApp({ leads }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, status, body, registrationId) {
    const options = body === undefined ? undefined : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(registrationId && { 'Idempotency-Key': registrationId }) },
      body: JSON.stringify(body),
    };
    const response = await fetch(`${baseUrl}${path}`, options);
    const data = await response.json();
    assert.equal(response.status, status, `${options?.method ?? 'GET'} ${path}: ${JSON.stringify(data)}`);
    return data;
  }

  const unknownId = randomUUID();
  let lead;
  await t.test('registra orígenes completos y parciales y consulta los leads', async () => {
    assert.deepEqual(await request('/leads', 200), []);
    const anonymous = await request('/leads', 201, {});
    assert.equal(anonymous.status, 'nuevo');
    assert.equal(anonymous.campaignId, null);
    assert.equal(anonymous.channel, null);
    assert.equal(anonymous.formId, null);

    const validOrigins = [
      { campaignId: null, channel: null, formId: null },
      { campaignId: campaign.id },
      { channel: 'simulated_messaging' },
      { campaignId: otherCampaign.id, channel: 'simulated_messaging' },
      { channel: 'form', formId: form.id },
      { campaignId: null, channel: 'form', formId: standaloneForm.id },
    ];
    for (const origin of validOrigins) {
      const saved = await request('/leads', 201, origin);
      assert.equal(saved.campaignId, origin.campaignId ?? null);
      assert.equal(saved.channel, origin.channel ?? null);
      assert.equal(saved.formId, origin.formId ?? null);
    }

    const name = '🏠'.repeat(120);
    lead = await request('/leads', 201, {
      name: ` ${name} `, email: 'ana@example.com', phone: '+54 9 11 5555-1234',
      campaignId: campaign.id.toUpperCase(), channel: 'form', formId: form.id,
      needs: 'Casa', zone: 'Palermo', financing: 'Contado / Propios',
      budgetAmount: 100000.50, budgetCurrency: 'USD', urgency: 'Este mes',
    });
    assert.deepEqual(lead, {
      id: lead.id, name, email: 'ana@example.com', phone: '+54 9 11 5555-1234',
      campaignId: campaign.id, channel: 'form', formId: form.id, needs: 'Casa',
      zone: 'Palermo', financing: 'Contado / Propios', customChecks: {},
      budgetAmount: 100000.50, budgetCurrency: 'USD', urgency: 'Este mes', status: 'nuevo', createdAt: lead.createdAt,
    });
    assert.deepEqual(await request(`/leads/${lead.id}`, 200), lead);
    assert.equal((await request('/leads', 200)).length, 8);
  });

  await t.test('rechaza campos y relaciones inválidas sin guardar leads', async () => {
    for (const origin of [
      { formId: form.id },
      { formId: form.id, channel: null },
      { formId: form.id, channel: 'simulated_messaging' },
      { campaignId: otherCampaign.id, channel: 'form', formId: form.id },
      { campaignId: campaign.id, channel: 'form', formId: standaloneForm.id },
      { campaignId: campaignWithoutChannel.id, channel: 'form', formId: formWithoutChannel.id },
      { campaignId: campaign.id, channel: 'simulated_messaging' },
      { campaignId: unknownId },
      { formId: unknownId, channel: 'form' },
      { formId: 'form-externo', channel: 'form' },
      { campaignId: 'campaña-externa' },
      { channel: 'formulario' },
      { budgetCurrency: 'USD' },
      { budgetAmount: -1 },
      { email: 'no-es-correo' },
      { phone: '123' },
      { phone: 'no-es-tel' },
      { name: ' \t ' },
      { name: 'Ana\0' },
      { name: '\uD800' },
      { name: '🏠'.repeat(121) },
      { status: 'calificado' },
    ]) {
      await request('/leads', 400, origin);
    }
    assert.equal((await request('/leads', 200)).length, 8);
    await request('/leads?unknown=1', 400);
    await request('/leads/inválido', 400);
    await request(`/leads/${unknownId}`, 404);

    const response = await fetch(`${baseUrl}/leads`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 415);
  });

  await t.test('registra conversaciones y consulta mensajes dentro de su conversación', async () => {
    const conversationsPath = `/leads/${lead.id}/conversations`;
    assert.deepEqual(await request(conversationsPath, 200), []);
    await request(`/leads/${unknownId}/conversations`, 404, {});
    await request(`/leads/${unknownId}/conversations`, 404);
    await request('/conversations/inválida', 400);
    await request(`/conversations/${unknownId}`, 404);

    const conversation = await request(conversationsPath, 201, {});
    const other = await request(conversationsPath, 201, {});
    assert.equal(conversation.leadId, lead.id);
    assert.notEqual(conversation.id, other.id);
    assert.deepEqual(await request(`/conversations/${conversation.id}`, 200), conversation);
    assert.deepEqual(await request(conversationsPath, 200), [conversation, other]);

    const messagesPath = `/conversations/${conversation.id}/messages`;
    const validMessage = { role: 'lead', content: ` ${'🏠'.repeat(3998)} ` };
    assert.deepEqual(await request(messagesPath, 200), []);
    await request(`/conversations/${unknownId}/messages`, 404, validMessage);
    await request(`/conversations/${unknownId}/messages`, 404);
    await request(messagesPath, 400, { role: 'system', content: 'Hola' });
    await request(messagesPath, 400, { role: 'lead', content: '\t ' });
    await request(messagesPath, 400, { role: 'lead', content: 'a'.repeat(4001) });
    await request(messagesPath, 400, { role: 'lead', content: '\uD800' });

    const incoming = await request(messagesPath, 201, validMessage);
    const reply = await request(messagesPath, 201, { role: 'assistant', content: '¿En qué zona?' });
    assert.equal(incoming.conversationId, conversation.id);
    assert.equal(incoming.content, validMessage.content);
    assert.deepEqual(await request(messagesPath, 200), [incoming, reply]);
    assert.deepEqual(await request(`${messagesPath}/${incoming.id}`, 200), incoming);
    await request(`${messagesPath}/${unknownId}`, 404);
    await request(`${messagesPath}/inválido`, 400);
    await request(`/conversations/${other.id}/messages/${incoming.id}`, 404);
  });

  await t.test('recupera un alta guardada tras un 500 y rechaza reutilizar la clave con otros datos', async () => {
    const registrationId = randomUUID();
    failAfterRegistration = registrationId;
    const body = { name: 'Alta reintentada', campaignId: campaign.id.toUpperCase(), channel: 'form', formId: form.id, budgetAmount: 0 };
    await request('/leads', 500, body, registrationId);
    const saved = await request(`/leads/${registrationId}`, 200);
    const attempts = await Promise.all([
      request('/leads', 201, body, registrationId),
      request('/leads', 201, { ...body, budgetCurrency: null }, registrationId),
    ]);
    assert.deepEqual(attempts, [saved, saved]);
    await request('/leads', 409, { ...body, budgetAmount: 50 }, registrationId);
    await request('/leads', 400, body, 'clave-invalida');
    const stored = await request('/leads', 200);
    assert.equal(stored.filter(({ name }) => name === body.name).length, 1);
  });
});
