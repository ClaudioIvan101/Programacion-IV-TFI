import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPostgresPool } from '../../src/infra/postgres.js';
import { createPostgresCaptureRepository } from '../../src/infra/captureRepository.js';
import { CampaignNotFoundError, DuplicateChannelError } from '../../src/domain/capture/errors.js';

test('PostgreSQL: FK, formularios y unicidad concurrente de canales', {
  skip: process.env.RUN_CAPTURE_DB_TESTS !== '1', timeout: 15000,
}, async () => {
  const pool = createPostgresPool();
  const schema = `capture_test_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  let first;
  let second;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    first = await pool.connect();
    second = await pool.connect();
    await Promise.all([first.query(`SET search_path TO "${schema}"`), second.query(`SET search_path TO "${schema}"`)]);
    for (const file of ['001_create_campaigns.sql', '004_create_capture_sources.sql']) {
      await first.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const campaign = (await first.query("INSERT INTO campaigns (name, objective) VALUES ('Test', 'Test') RETURNING id")).rows[0];
    const a = createPostgresCaptureRepository(first);
    const b = createPostgresCaptureRepository(second);
    const results = await Promise.allSettled([a.addCampaignChannel(campaign.id, 'form'), b.addCampaignChannel(campaign.id, 'form')]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.ok(results.find((result) => result.status === 'rejected').reason instanceof DuplicateChannelError);
    assert.deepEqual(await a.listCampaignChannels(campaign.id), ['form']);
    const linked = await a.createForm({ name: 'Vinculado', campaignId: campaign.id });
    assert.equal((await a.getFormById(linked.id)).campaignId, campaign.id);
    assert.equal((await a.createForm({ name: 'Sin campaña', campaignId: null })).campaignId, null);
    await assert.rejects(a.addCampaignChannel(randomUUID(), 'form'), CampaignNotFoundError);
    await assert.rejects(a.createForm({ name: 'Inválido', campaignId: randomUUID() }), CampaignNotFoundError);
  } finally {
    first?.release();
    second?.release();
    try { if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await pool.end(); }
  }
});
