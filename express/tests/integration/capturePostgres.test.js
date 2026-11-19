import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPostgresPool } from '../../src/infra/postgres.js';
import { createPostgresCaptureRepository } from '../../src/infra/captureRepository.js';
import { CampaignNotFoundError, DuplicateChannelError } from '../../src/domain/capture/errors.js';

// Esta prueba con una base real solo se ejecuta cuando se habilita explícitamente.
test('PostgreSQL: FK, formularios y unicidad concurrente de canales', {
  skip: process.env.RUN_CAPTURE_DB_TESTS !== '1', timeout: 15000,
}, async () => {
  const pool = createPostgresPool();
  // Se usa un esquema único para no tocar las tablas habituales de la base configurada.
  const schema = `capture_test_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  let first;
  let second;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    first = await pool.connect();
    second = await pool.connect();
    // Las dos conexiones ejecutan las consultas en el mismo esquema de prueba.
    await Promise.all([first.query(`SET search_path TO "${schema}"`), second.query(`SET search_path TO "${schema}"`)]);
    // Se aplican únicamente las migraciones que crean las tablas necesarias para este escenario.
    for (const file of ['001_create_campaigns.sql', '004_create_capture_sources.sql']) {
      await first.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const campaign = (await first.query("INSERT INTO campaigns (name, objective) VALUES ('Test', 'Test') RETURNING id")).rows[0];
    const a = createPostgresCaptureRepository(first);
    const b = createPostgresCaptureRepository(second);
    // Dos conexiones intentan guardar el mismo par; solo una inserción debe prosperar.
    const results = await Promise.allSettled([a.addCampaignChannel(campaign.id, 'form'), b.addCampaignChannel(campaign.id, 'form')]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.ok(results.find((result) => result.status === 'rejected').reason instanceof DuplicateChannelError);
    assert.deepEqual(await a.listCampaignChannels(campaign.id), ['form']);
    // El vínculo opcional admite null, pero una campaña indicada debe existir.
    const linked = await a.createForm({ name: 'Vinculado', campaignId: campaign.id });
    assert.equal((await a.getFormById(linked.id)).campaignId, campaign.id);
    assert.equal((await a.createForm({ name: 'Sin campaña', campaignId: null })).campaignId, null);
    await assert.rejects(a.addCampaignChannel(randomUUID(), 'form'), CampaignNotFoundError);
    await assert.rejects(a.createForm({ name: 'Inválido', campaignId: randomUUID() }), CampaignNotFoundError);
  // Al finalizar se liberan las conexiones y se elimina solo el esquema temporal.
  } finally {
    first?.release();
    second?.release();
    try { if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await pool.end(); }
  }
});
