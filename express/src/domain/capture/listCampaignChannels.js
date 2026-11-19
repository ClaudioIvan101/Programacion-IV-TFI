import { CampaignNotFoundError, InvalidCaptureError } from './errors.js';

export function makeListCampaignChannels({ captureRepository }) {
  return async function listCampaignChannels(campaignId) {
    if (typeof campaignId !== 'string') throw new InvalidCaptureError('Campaña inválida.');
    const channels = await captureRepository.listCampaignChannels(campaignId);
    if (channels === null) throw new CampaignNotFoundError('Campaña no encontrada.');
    return channels;
  };
}
