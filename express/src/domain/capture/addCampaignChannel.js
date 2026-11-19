import { InvalidCaptureError } from './errors.js';

export function makeAddCampaignChannel({ captureRepository }) {
  return async function addCampaignChannel(campaignId, channel) {
    if (typeof campaignId !== 'string' || !['form', 'simulated_messaging'].includes(channel)) {
      throw new InvalidCaptureError('Datos de captación inválidos.');
    }
    return captureRepository.addCampaignChannel(campaignId, channel);
  };
}
