export function conversationSuggestions(context) {
  const facts = {};
  if (context?.necesidades) facts.needs = context.necesidades;
  if (context?.urgencia) facts.urgency = context.urgencia;
  const budget = context?.presupuesto;
  if (Number.isFinite(budget?.monto)) {
    facts.budgetAmount = budget.monto;
    facts.budgetCurrency = ['ARS', 'USD'].includes(budget.moneda) ? budget.moneda : null;
  }
  return facts;
}
