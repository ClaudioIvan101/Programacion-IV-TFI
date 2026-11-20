import { evaluateBudgetRule } from './evaluateLeadBudget.js';

export class InvalidRuleSetError extends Error {}

const maxAmount = 1_000_000_000_000;
const maxPoints = 1_000_000;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (object, allowed) =>
  Object.keys(object).length === allowed.length && allowed.every((key) => Object.hasOwn(object, key));

// Se valida una vez al publicar la versión, sin confiar en un esquema HTTP específico.
export function validateRuleSet(input) {
  const error = () => new InvalidRuleSetError('Configuración de puntaje inválida.');
  if (!isObject(input) || !exactKeys(input, ['threshold', 'rules']) ||
      !Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > maxPoints ||
      !Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > 4) {
    throw error();
  }

  const seen = new Set();
  const rules = input.rules.map((rule) => {
    if (!isObject(rule) || !Number.isInteger(rule.points) || Math.abs(rule.points) > maxPoints) {
      throw error();
    }

    let key = rule.type;
    if (rule.type === 'minimumBudget') {
      if (!exactKeys(rule, ['type', 'currency', 'minimumAmount', 'points']) ||
          !['ARS', 'USD'].includes(rule.currency) ||
          !Number.isFinite(rule.minimumAmount) || rule.minimumAmount < 0 || rule.minimumAmount > maxAmount) {
        throw error();
      }
      key = `${rule.type}:${rule.currency}`;
    } else if (!['hasNeeds', 'hasUrgency'].includes(rule.type) || !exactKeys(rule, ['type', 'points'])) {
      throw error();
    }

    // No permitimos que un criterio repetido sume o reste dos veces.
    if (seen.has(key)) throw error();
    seen.add(key);
    return { ...rule };
  });

  return { threshold: input.threshold, rules };
}

export function scoreLead(lead, { threshold, rules }) {
  const breakdown = rules.map((rule) => {
    if (rule.type === 'minimumBudget') {
      return { type: rule.type, currency: rule.currency, ...evaluateBudgetRule(lead, rule) };
    }
    const value = lead[rule.type === 'hasNeeds' ? 'needs' : 'urgency'];
    const known = typeof value === 'string' && value.trim().length > 0;
    return { type: rule.type, status: known ? 'evaluated' : 'pending', points: known ? rule.points : null };
  });

  const applicable = breakdown.filter((entry) => entry.status === 'evaluated');
  // No se compara con el umbral mientras falten hechos requeridos o ninguna regla se pueda aplicar.
  if (breakdown.some((entry) => entry.status === 'pending') || applicable.length === 0) {
    return { decision: 'pending', score: null, breakdown };
  }

  const score = applicable.reduce((total, entry) => total + entry.points, 0);
  return { decision: score >= threshold ? 'qualified' : 'not_qualified', score, breakdown };
}

export function makeQualificationUseCases({ qualificationRepository }) {
  return {
    publishRuleSet: async (input) => qualificationRepository.createRuleSet(validateRuleSet(input)),
    qualifyLead: async (leadId, ruleSetVersion) => {
      if (!Number.isInteger(ruleSetVersion) || ruleSetVersion < 1 || ruleSetVersion > 2_147_483_647) {
        throw new InvalidRuleSetError('Versión de reglas inválida.');
      }
      return qualificationRepository.recordQualification(leadId, ruleSetVersion, scoreLead);
    },
    listQualifications: async (leadId) => qualificationRepository.listQualifications(leadId),
  };
}
