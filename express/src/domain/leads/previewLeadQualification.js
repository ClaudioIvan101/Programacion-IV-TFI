export function makePreviewLeadQualification({ evaluateLeadBudget }) {
  return async function previewLeadQualification(leadId, { budgetRule, threshold }) {
    if (!Number.isSafeInteger(threshold) || threshold <= 0) {
      throw new TypeError('El umbral de calificación debe ser un entero positivo.');
    }

    const budget = await evaluateLeadBudget(leadId, budgetRule);
    if (budget === null) return null;

    // Con una sola regla, si no podemos aplicarla tampoco podemos decidir.
    if (budget.status !== 'evaluated') {
      return { decision: 'pending', score: null, threshold, budget };
    }

    const score = budget.points;
    return {
      decision: score >= threshold ? 'qualified' : 'not_qualified',
      score,
      threshold,
      budget,
    };
  };
}