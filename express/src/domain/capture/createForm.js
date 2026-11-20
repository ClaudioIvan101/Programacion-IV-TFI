import { InvalidCaptureError } from './errors.js';

export function makeCreateForm({ captureRepository }) {
  return async function createForm(input) {
    // Antes de leer los campos, se descartan null, valores primitivos y arreglos.
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InvalidCaptureError('Formulario inválido.');
    // Si no se indica una campaña, el formulario se guarda sin vínculo.
    const { name, campaignId = null } = input;
    // El límite de 200 caracteres también se aplica fuera de HTTP y se mide sin espacios externos.
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200 ||
        (campaignId !== null && typeof campaignId !== 'string')) {
      throw new InvalidCaptureError('Formulario inválido.');
    }
    // Se delega la persistencia con el nombre normalizado; el repositorio valida la referencia.
    return captureRepository.createForm({ name: name.trim(), campaignId });
  };
}
