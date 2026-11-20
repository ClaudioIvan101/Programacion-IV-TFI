import { CampaignNotFoundError, InvalidCaptureError } from './errors.js';

export function makeListCampaignChannels({ captureRepository }) {
  return async function listCampaignChannels(campaignId) {
    // El caso de uso requiere un identificador textual; el router valida el formato UUID.
    if (typeof campaignId !== 'string') throw new InvalidCaptureError('Campaña inválida.');
    const channels = await captureRepository.listCampaignChannels(campaignId);
    // Una campaña existente sin canales devuelve []; null indica que la campaña no existe.
    if (channels === null) throw new CampaignNotFoundError('Campaña no encontrada.');
    return channels;
  };
}
