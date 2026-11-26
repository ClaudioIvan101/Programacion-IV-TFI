export class InvalidQualificationDataError extends Error {}

export function makeApplyQualificationData({ qualificationRepository }) {
  return async function applyQualificationData({ leadId, conversationId = null, data }) {
    if (data.budgetCurrency != null && data.budgetAmount == null) {
      throw new InvalidQualificationDataError('Una moneda requiere el monto correspondiente.');
    }

    const merge = (current) => {
      // Los datos que la conversación no aporta conservan el valor anterior.
      const budgetAmount = data.budgetAmount ?? current.budgetAmount;
      const changedAmount = data.budgetAmount != null && data.budgetAmount !== current.budgetAmount;
      const next = {
        needs: data.needs ?? current.needs,
        urgency: data.urgency ?? current.urgency,
        budgetAmount,
        // Un monto nuevo no puede heredar la moneda del anterior.
        budgetCurrency: data.budgetCurrency ?? (changedAmount ? null : current.budgetCurrency),
      };
      if (data.zone !== undefined || Object.hasOwn(current, 'zone')) {
        next.zone = data.zone !== undefined ? data.zone : (current.zone ?? null);
      }
      if (data.financing !== undefined || Object.hasOwn(current, 'financing')) {
        next.financing = data.financing !== undefined ? data.financing : (current.financing ?? null);
      }
      if (data.customChecks !== undefined || Object.hasOwn(current, 'customChecks')) {
        next.customChecks = data.customChecks !== undefined
          ? { ...(current.customChecks ?? {}), ...data.customChecks }
          : (current.customChecks ?? {});
      }
      return next;
    };

    if (conversationId) {
      return qualificationRepository.updateLeadFromConversation(leadId, conversationId, merge);
    }
    return qualificationRepository.updateLead?.(leadId, merge) ?? null;
  };
}
