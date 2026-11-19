import { FormNotFoundError, InvalidCaptureError } from './errors.js';

export function makeGetFormById({ captureRepository }) {
  return async function getFormById(id) {
    if (typeof id !== 'string') throw new InvalidCaptureError('Formulario inválido.');
    const form = await captureRepository.getFormById(id);
    if (form === null) throw new FormNotFoundError('Formulario no encontrado.');
    return form;
  };
}
