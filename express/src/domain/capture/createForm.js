import { InvalidCaptureError } from './errors.js';

export function makeCreateForm({ captureRepository }) {
  return async function createForm(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InvalidCaptureError('Formulario inválido.');
    const { name, campaignId = null } = input;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200 ||
        (campaignId !== null && typeof campaignId !== 'string')) {
      throw new InvalidCaptureError('Formulario inválido.');
    }
    return captureRepository.createForm({ name: name.trim(), campaignId });
  };
}
