import { InvalidCaptureError } from './errors.js';

export function makeAddCampaignChannel({ captureRepository }) {
  return async function addCampaignChannel(campaignId, channel) {
    // El caso de uso acepta solo los canales del catálogo de captación.
    if (typeof campaignId !== 'string' || !['form', 'simulated_messaging'].includes(channel)) {
      throw new InvalidCaptureError('Datos de captación inválidos.');
    }
    // El repositorio comprueba que la campaña exista y que el canal no esté asociado.
    return captureRepository.addCampaignChannel(campaignId, channel);
  };
}
