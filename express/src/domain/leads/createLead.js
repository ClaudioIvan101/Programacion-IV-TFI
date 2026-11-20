export class InvalidLeadError extends Error {}

export function makeCreateLead({ leadRepository }) {
  return async function createLead(input) {
    const { formId, channel, budgetAmount, budgetCurrency } = input;
    if (formId != null && channel !== 'form') {
      throw new InvalidLeadError('Origen del lead inválido.');
    }
    if (budgetCurrency != null && budgetAmount == null) {
      throw new InvalidLeadError('Datos inválidos.');
    }

    // La persistencia comprueba las relaciones en la misma operación que registra el lead.
    const lead = await leadRepository.createLead(input);
    if (!lead) throw new InvalidLeadError('Origen del lead inválido.');
    return lead;
  };
}
