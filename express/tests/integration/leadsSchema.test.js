import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPool } from "../../src/infra/postgres.js";

test("La migración de leads admite origen opcional y protege el historial", async () => {
  const pool = createPostgresPool();
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const { rows: [anonymous] } = await client.query(
      "INSERT INTO leads DEFAULT VALUES RETURNING name, campaign_id, channel, form_id, status",
    );
    assert.deepEqual(anonymous, {
      name: null,
      campaign_id: null,
      channel: null,
      form_id: null,
      status: "nuevo",
    });

    const { rows: [campaign] } = await client.query(
      "INSERT INTO campaigns (name, objective) VALUES ($1, $2) RETURNING id",
      ["Campaña de prueba", "Consultar por una vivienda"],
    );
    await client.query("INSERT INTO campaign_channels (campaign_id, channel) VALUES ($1, 'form')", [campaign.id]);
    const { rows: [form] } = await client.query(
      "INSERT INTO forms (name, campaign_id) VALUES ('Consulta', $1) RETURNING id",
      [campaign.id],
    );

    // Un formulario puede identificar el origen con campaign_id vacío.
    const { rows: [partialOrigin] } = await client.query(
      "INSERT INTO leads (channel, form_id) VALUES ('form', $1) RETURNING campaign_id, channel, form_id",
      [form.id],
    );
    assert.deepEqual(partialOrigin, { campaign_id: null, channel: "form", form_id: form.id });

    const { rows: [lead] } = await client.query(
      `INSERT INTO leads (campaign_id, channel, form_id, budget_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING id, campaign_id, channel, form_id, budget_amount, budget_currency`,
      [campaign.id, "form", form.id, "100000.50"],
    );
    assert.equal(lead.campaign_id, campaign.id);
    assert.equal(lead.channel, "form");
    assert.equal(lead.form_id, form.id);
    assert.equal(lead.budget_amount, "100000.50");
    assert.equal(lead.budget_currency, null);

    const { rows: conversations } = await client.query(
      "INSERT INTO conversations (lead_id) VALUES ($1), ($1) RETURNING id",
      [lead.id],
    );
    assert.equal(conversations.length, 2);
    const conversationId = conversations[0].id;

    const { rowCount } = await client.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'lead', $2), ($1, 'assistant', $3)",
      [conversationId, "Busco una vivienda", "¿En qué zona?"],
    );
    assert.equal(rowCount, 2);

    const missingId = randomUUID();
    const invalid = [
      ["INSERT INTO leads (campaign_id) VALUES ($1)", [missingId], "23503"],
      ["INSERT INTO leads (channel, form_id) VALUES ('form', $1)", [missingId], "23503"],
      ["INSERT INTO leads (channel, form_id) VALUES ('form', 'form-externo')", [], "22P02"],
      ["INSERT INTO leads (channel) VALUES ('formulario')", [], "23514"],
      ["INSERT INTO leads (form_id) VALUES ($1)", [form.id], "23514"],
      ["INSERT INTO leads (channel, form_id) VALUES ('simulated_messaging', $1)", [form.id], "23514"],
      ["INSERT INTO leads (campaign_id, channel) VALUES ($1, 'simulated_messaging')", [campaign.id], "23503"],
      ["INSERT INTO leads (budget_amount, budget_currency) VALUES (100, 'EUR')", [], "23514"],
      ["INSERT INTO leads (budget_currency) VALUES ('USD')", [], "23514"],
      ["INSERT INTO conversations (lead_id) VALUES ($1)", [missingId], "23503"],
      ["INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'lead', 'Hola')", [missingId], "23503"],
      ["INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'system', 'Hola')", [conversationId], "23514"],
      ["INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'lead', $2)", [conversationId, " \t "], "23514"],
      ["DELETE FROM leads WHERE id = $1", [lead.id], "23503"],
      ["DELETE FROM conversations WHERE id = $1", [conversationId], "23503"],
    ];
    // Cada error se revierte al savepoint para seguir probando dentro de la misma transacción.
    for (const [sql, params, code] of invalid) {
      await client.query("SAVEPOINT invalid_row");
      await assert.rejects(client.query(sql, params), { code }, sql);
      await client.query("ROLLBACK TO SAVEPOINT invalid_row");
      await client.query("RELEASE SAVEPOINT invalid_row");
    }
  } finally {
    try {
      if (client) await client.query("ROLLBACK");
    } finally {
      client?.release();
      await pool.end();
    }
  }
});
