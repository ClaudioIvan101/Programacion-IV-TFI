import { evaluateBudgetRule } from './evaluateLeadBudget.js';

export class InvalidRuleSetError extends Error {}

const maxAmount = 1_000_000_000_000;
const maxPoints = 1_000_000;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (object, allowed) =>
  Object.keys(object).length === allowed.length && allowed.every((key) => Object.hasOwn(object, key));
const onlyKnownKeys = (object, allowed) =>
  Object.keys(object).every((key) => allowed.includes(key));
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{Mark}/gu, '').trim().toLowerCase();
const isNonEmptyText = (value, max = 120) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && value.isWellFormed() && !value.includes('\0');

function validateTiers(tiers, error) {
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 10) throw error();
  const seenKeys = new Set();
  return tiers.map((tier) => {
    if (!isObject(tier) || !onlyKnownKeys(tier, ['key', 'label', 'points']) ||
        !isNonEmptyText(tier.key, 120) || !Number.isInteger(tier.points) || Math.abs(tier.points) > maxPoints) {
      throw error();
    }
    if (tier.label !== undefined && !isNonEmptyText(tier.label, 120)) throw error();
    const normKey = normalize(tier.key);
    if (seenKeys.has(normKey)) throw error();
    seenKeys.add(normKey);
    return {
      key: tier.key.trim(),
      ...(tier.label !== undefined && { label: tier.label.trim() }),
      points: tier.points,
    };
  });
}

// Se valida una vez al publicar la versión, sin confiar en un esquema HTTP específico.
export function validateRuleSet(input) {
  const error = () => new InvalidRuleSetError('Configuración de puntaje inválida.');
  if (!isObject(input) || !onlyKnownKeys(input, ['threshold', 'discardThreshold', 'name', 'status', 'rules']) ||
      !Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > maxPoints ||
      !Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > 25) {
    throw error();
  }

  if (input.name !== undefined && input.name !== null && !isNonEmptyText(input.name, 120)) throw error();
  if (input.status !== undefined && !['active', 'draft', 'archived'].includes(input.status)) throw error();
  if (input.discardThreshold !== undefined && input.discardThreshold !== null) {
    if (!Number.isInteger(input.discardThreshold) || input.discardThreshold < 0 || input.discardThreshold >= input.threshold) {
      throw error();
    }
  }

  const seen = new Set();
  const rules = input.rules.map((rule) => {
    if (!isObject(rule)) throw error();

    let key = rule.type;
    if (rule.type === 'minimumBudget') {
      if (!onlyKnownKeys(rule, ['type', 'currency', 'minimumAmount', 'points', 'partialEnabled', 'partialPoints']) ||
          !Object.hasOwn(rule, 'currency') || !Object.hasOwn(rule, 'minimumAmount') || !Object.hasOwn(rule, 'points') ||
          !['ARS', 'USD'].includes(rule.currency) ||
          !Number.isFinite(rule.minimumAmount) || rule.minimumAmount < 0 || rule.minimumAmount > maxAmount ||
          !Number.isInteger(rule.points) || Math.abs(rule.points) > maxPoints) {
        throw error();
      }
      if (rule.partialEnabled !== undefined && typeof rule.partialEnabled !== 'boolean') throw error();
      if (rule.partialPoints !== undefined && (!Number.isInteger(rule.partialPoints) || Math.abs(rule.partialPoints) > maxPoints)) {
        throw error();
      }
      if (rule.partialEnabled === true && rule.partialPoints === undefined) throw error();
      key = `${rule.type}:${rule.currency}`;
      if (seen.has(key)) throw error();
      seen.add(key);
      return { ...rule };
    }

    if (rule.type === 'hasNeeds' || rule.type === 'hasUrgency') {
      if (!exactKeys(rule, ['type', 'points']) || !Number.isInteger(rule.points) || Math.abs(rule.points) > maxPoints) {
        throw error();
      }
      if (seen.has(key)) throw error();
      seen.add(key);
      return { ...rule };
    }

    if (rule.type === 'urgencyTiers' || rule.type === 'financingTiers') {
      if (!exactKeys(rule, ['type', 'tiers'])) throw error();
      if (seen.has(key)) throw error();
      seen.add(key);
      return { type: rule.type, tiers: validateTiers(rule.tiers, error) };
    }

    if (rule.type === 'priorityZones') {
      if (!exactKeys(rule, ['type', 'zones', 'points']) ||
          !Array.isArray(rule.zones) || rule.zones.length < 1 || rule.zones.length > 50 ||
          !rule.zones.every((zone) => isNonEmptyText(zone, 120)) ||
          !Number.isInteger(rule.points) || Math.abs(rule.points) > maxPoints) {
        throw error();
      }
      if (seen.has(key)) throw error();
      seen.add(key);
      return { type: rule.type, zones: [...new Set(rule.zones.map((zone) => zone.trim()))], points: rule.points };
    }

    if (rule.type === 'dataCompleteness') {
      if (!exactKeys(rule, ['type', 'fullPoints', 'partialPoints']) ||
          !Number.isInteger(rule.fullPoints) || Math.abs(rule.fullPoints) > maxPoints ||
          !Number.isInteger(rule.partialPoints) || Math.abs(rule.partialPoints) > maxPoints) {
        throw error();
      }
      if (seen.has(key)) throw error();
      seen.add(key);
      return { type: rule.type, fullPoints: rule.fullPoints, partialPoints: rule.partialPoints };
    }

    if (rule.type === 'customCriteria') {
      if (!onlyKnownKeys(rule, ['type', 'id', 'name', 'condition', 'points']) ||
          !isNonEmptyText(rule.name, 120) ||
          !Number.isInteger(rule.points) || Math.abs(rule.points) > maxPoints) {
        throw error();
      }
      if (rule.id !== undefined && !isNonEmptyText(rule.id, 80)) throw error();
      if (rule.condition !== undefined && typeof rule.condition !== 'string') throw error();
      if (rule.condition && rule.condition.length > 300) throw error();
      key = `customCriteria:${rule.id ? rule.id.trim() : normalize(rule.name)}`;
      if (seen.has(key)) throw error();
      seen.add(key);
      return {
        type: rule.type,
        ...(rule.id !== undefined && { id: rule.id.trim() }),
        name: rule.name.trim(),
        ...(rule.condition !== undefined && { condition: rule.condition.trim() }),
        points: rule.points,
      };
    }

    throw error();
  });

  const normalized = { threshold: input.threshold, rules };
  if (input.discardThreshold !== undefined) normalized.discardThreshold = input.discardThreshold;
  if (input.name != null) normalized.name = input.name.trim();
  if (input.status !== undefined) normalized.status = input.status;
  return normalized;
}

function matchTier(rawValue, tiers) {
  const value = normalize(rawValue);
  const exact = tiers.find((tier) => normalize(tier.key) === value || normalize(tier.label) === value);
  if (exact) return exact;
  return tiers.find((tier) => {
    const key = normalize(tier.key);
    const label = normalize(tier.label);
    return (key && (value.includes(key) || key.includes(value)))
      || (label && (value.includes(label) || label.includes(value)));
  }) ?? null;
}

export function scoreLead(lead, { threshold, discardThreshold = null, rules }) {
  const breakdown = rules.map((rule) => {
    if (rule.type === 'minimumBudget') {
      return { type: rule.type, currency: rule.currency, ...evaluateBudgetRule(lead, rule) };
    }
    if (rule.type === 'hasNeeds' || rule.type === 'hasUrgency') {
      const value = lead[rule.type === 'hasNeeds' ? 'needs' : 'urgency'];
      const known = typeof value === 'string' && value.trim().length > 0;
      return { type: rule.type, status: known ? 'evaluated' : 'pending', points: known ? rule.points : null };
    }
    if (rule.type === 'urgencyTiers') {
      if (typeof lead.urgency !== 'string' || !lead.urgency.trim()) {
        return { type: rule.type, status: 'pending', points: null };
      }
      const matched = matchTier(lead.urgency, rule.tiers);
      return {
        type: rule.type,
        status: 'evaluated',
        points: matched ? matched.points : 0,
        ...(matched && { matched: matched.label ?? matched.key }),
      };
    }
    if (rule.type === 'priorityZones') {
      if (typeof lead.zone !== 'string' || !lead.zone.trim()) {
        return { type: rule.type, status: 'pending', points: null };
      }
      const leadZone = normalize(lead.zone);
      const matched = rule.zones.find((zone) => {
        const candidate = normalize(zone);
        return candidate && (leadZone.includes(candidate) || candidate.includes(leadZone));
      });
      return {
        type: rule.type,
        status: 'evaluated',
        points: matched ? rule.points : 0,
        ...(matched && { matched }),
      };
    }
    if (rule.type === 'financingTiers') {
      if (typeof lead.financing !== 'string' || !lead.financing.trim()) {
        return { type: rule.type, status: 'pending', points: null };
      }
      const matched = matchTier(lead.financing, rule.tiers);
      return {
        type: rule.type,
        status: 'evaluated',
        points: matched ? matched.points : 0,
        ...(matched && { matched: matched.label ?? matched.key }),
      };
    }
    if (rule.type === 'dataCompleteness') {
      const hasContact = Boolean((typeof lead.email === 'string' && lead.email.trim()) ||
        (typeof lead.phone === 'string' && lead.phone.trim()));
      const hasNeeds = Boolean(typeof lead.needs === 'string' && lead.needs.trim());
      const points = hasContact && hasNeeds ? rule.fullPoints : (hasContact || hasNeeds ? rule.partialPoints : 0);
      return { type: rule.type, status: 'evaluated', points };
    }
    if (rule.type === 'customCriteria') {
      const checks = lead.customChecks && typeof lead.customChecks === 'object' ? lead.customChecks : {};
      const key = rule.id ?? rule.name;
      const met = Boolean(checks[key] ?? checks[rule.name]);
      return {
        type: rule.type,
        ...(rule.id && { id: rule.id }),
        name: rule.name,
        status: 'evaluated',
        points: met ? rule.points : 0,
      };
    }
    return { type: rule.type, status: 'not_applicable', points: null };
  });

  const applicable = breakdown.filter((entry) => entry.status === 'evaluated');
  // No se compara con el umbral mientras falten hechos requeridos o ninguna regla se pueda aplicar.
  if (breakdown.some((entry) => entry.status === 'pending') || applicable.length === 0) {
    return { decision: 'pending', score: null, breakdown };
  }

  const score = applicable.reduce((total, entry) => total + entry.points, 0);
  let decision = 'not_qualified';
  if (score >= threshold) {
    decision = 'qualified';
  } else if (discardThreshold != null && discardThreshold < threshold && score >= discardThreshold) {
    decision = 'review';
  }
  return { decision, score, breakdown };
}

export function makeQualificationUseCases({ qualificationRepository }) {
  return {
    publishRuleSet: async (input) => qualificationRepository.createRuleSet(validateRuleSet(input)),
    listRuleSets: async () => qualificationRepository.listRuleSets(),
    activateRuleSet: async (version) => {
      if (!Number.isInteger(version) || version < 1 || version > 2_147_483_647) {
        throw new InvalidRuleSetError('Versión de reglas inválida.');
      }
      return qualificationRepository.activateRuleSet?.(version) ?? null;
    },
    qualifyLead: async (leadId, ruleSetVersion) => {
      if (!Number.isInteger(ruleSetVersion) || ruleSetVersion < 1 || ruleSetVersion > 2_147_483_647) {
        throw new InvalidRuleSetError('Versión de reglas inválida.');
      }
      return qualificationRepository.recordQualification(leadId, ruleSetVersion, scoreLead);
    },
    listQualifications: async (leadId) => qualificationRepository.listQualifications(leadId),
  };
}
