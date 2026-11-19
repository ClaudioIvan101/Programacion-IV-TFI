import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAddCampaignChannel } from '../../src/domain/capture/addCampaignChannel.js';
import { makeListCampaignChannels } from '../../src/domain/capture/listCampaignChannels.js';
import { makeCreateForm } from '../../src/domain/capture/createForm.js';
import { makeGetFormById } from '../../src/domain/capture/getFormById.js';
import { CampaignNotFoundError, FormNotFoundError, InvalidCaptureError, DuplicateChannelError } from '../../src/domain/capture/errors.js';
import { createPostgresCaptureRepository } from '../../src/infra/captureRepository.js';

test('casos de uso validan y delegan sin dependencias externas', async () => {
  const repo = {
    addCampaignChannel: async (id, channel) => ({ id, channel }),
    listCampaignChannels: async (id) => id === 'missing' ? null : ['form'],
    createForm: async (form) => form,
    getFormById: async () => null,
  };
  assert.deepEqual(await makeAddCampaignChannel({ captureRepository: repo })('id', 'form'), { id: 'id', channel: 'form' });
  await assert.rejects(makeAddCampaignChannel({ captureRepository: repo })('id', 'invalid'), InvalidCaptureError);
  assert.deepEqual(await makeListCampaignChannels({ captureRepository: repo })('id'), ['form']);
  await assert.rejects(makeListCampaignChannels({ captureRepository: repo })('missing'), CampaignNotFoundError);
  assert.deepEqual(await makeCreateForm({ captureRepository: repo })({ name: ' Nombre ' }), { name: 'Nombre', campaignId: null });
  await assert.rejects(makeCreateForm({ captureRepository: repo })({ name: ' ' }), InvalidCaptureError);
  await assert.rejects(makeGetFormById({ captureRepository: repo })('missing'), FormNotFoundError);
});

test('repositorio parametriza y traduce exclusivamente errores conocidos', async () => {
  const calls = [];
  const repo = createPostgresCaptureRepository({ query: async (sql, values) => { calls.push({ sql, values }); return { rows: [{ channel: 'form' }] }; } });
  await repo.addCampaignChannel('id', 'form');
  await repo.createForm({ name: 'Nombre', campaignId: null });
  await repo.listCampaignChannels('id');
  await repo.getFormById('id');
  assert.deepEqual(calls[0].values, ['id', 'form']);
  assert.deepEqual(calls[1].values, ['Nombre', null]);
  assert.ok(calls.every((call) => call.sql.includes('$1')));
  const duplicate = createPostgresCaptureRepository({ query: async () => { throw Object.assign(new Error(), { code: '23505', constraint: 'campaign_channels_unique' }); } });
  await assert.rejects(duplicate.addCampaignChannel('id', 'form'), DuplicateChannelError);
});
