export class InvalidQualificationDataError extends Error {}

export function makeApplyQualificationData({ qualificationRepository }) {
  return async function applyQualificationData({ leadId, conversationId, data }) {
    if (data.budgetCurrency != null && data.budgetAmount == null) {
      throw new InvalidQualificationDataError('Una moneda requiere el monto correspondiente.');
    }

    return qualificationRepository.updateLeadFromConversation(leadId, conversationId, (current) => {
      // Los datos que la conversación no aporta conservan el valor anterior.
      const budgetAmount = data.budgetAmount ?? current.budgetAmount;
      const changedAmount = data.budgetAmount != null && data.budgetAmount !== current.budgetAmount;
      return {
        needs: data.needs ?? current.needs,
        urgency: data.urgency ?? current.urgency,
        budgetAmount,
        // Un monto nuevo no puede heredar la moneda del anterior.
        budgetCurrency: data.budgetCurrency ?? (changedAmount ? null : current.budgetCurrency),
      };
    });
  };
}
