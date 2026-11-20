export function makeEvaluateLeadBudget({ leadRepository }) {
  return async function evaluateLeadBudget(leadId, rule) {
    // La regla se recibe como configuración: el caso de uso no fija umbrales ni puntos.
    if (
      !rule ||
      !['ARS', 'USD'].includes(rule.currency) ||
      !Number.isFinite(rule.minimumAmount) ||
      rule.minimumAmount < 0 ||
      !Number.isSafeInteger(rule.points)
    ) {
      throw new TypeError('Regla de presupuesto inválida.');
    }

    const lead = await leadRepository.getLead(leadId);
    if (!lead) return null;

    return evaluateBudgetRule(lead, rule);
  };
}

// La misma regla pura se usa en la vista previa y en el historial persistido.
export function evaluateBudgetRule(lead, rule) {
  const { budgetAmount, budgetCurrency } = lead;

  // Un importe incompleto deja la regla pendiente, no le asigna cero puntos.
  if (!Number.isFinite(budgetAmount) || budgetCurrency == null) {
    return { status: 'pending', points: null };
  }

  // No se comparan importes en monedas distintas ni se inventa una conversión.
  if (budgetCurrency !== rule.currency) {
    return { status: 'not_applicable', points: null };
  }

  return {
    status: 'evaluated',
    points: budgetAmount >= rule.minimumAmount ? rule.points : 0,
  };
}
