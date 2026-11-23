export class InvalidLeadError extends Error {}

export function makeCreateLead({ leadRepository }) {
  // En input llegan los datos que la ruta POST /leads ya validó.
  return async function createLead(input) {
    const { formId, channel, budgetAmount, budgetCurrency } = input;
    // Si llega un formId y el canal es distinto de 'form', se corta el alta.
    if (formId != null && channel !== 'form') {
      throw new InvalidLeadError('Origen del lead inválido.');
    }
    // Si llega una moneda sin monto, se corta el alta por datos inválidos.
    if (budgetCurrency != null && budgetAmount == null) {
      throw new InvalidLeadError('Datos inválidos.');
    }

    // La persistencia comprueba las relaciones en la misma operación que registra el lead.
    const lead = await leadRepository.createLead(input);
    if (!lead) throw new InvalidLeadError('Origen del lead inválido.');
    return lead;
  };
}
