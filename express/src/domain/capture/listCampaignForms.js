import { CampaignNotFoundError, InvalidCaptureError } from './errors.js';

export function makeListCampaignForms({ captureRepository }) {
  return async function listCampaignForms(campaignId) {
    if (typeof campaignId !== 'string') throw new InvalidCaptureError('Campaña inválida.');
    const forms = await captureRepository.listCampaignForms(campaignId);
    if (forms === null) throw new CampaignNotFoundError('Campaña no encontrada.');
    return forms;
  };
}
