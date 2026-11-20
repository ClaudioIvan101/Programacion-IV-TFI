import { FormNotFoundError, InvalidCaptureError } from './errors.js';

export function makeGetFormById({ captureRepository }) {
  return async function getFormById(id) {
    // El caso de uso requiere un identificador textual; el router valida el formato UUID.
    if (typeof id !== 'string') throw new InvalidCaptureError('Formulario inválido.');
    const form = await captureRepository.getFormById(id);
    // El repositorio devuelve null cuando no encuentra un formulario con ese ID.
    if (form === null) throw new FormNotFoundError('Formulario no encontrado.');
    return form;
  };
}
