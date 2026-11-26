export const scoringCriteria = {
  hasNeeds: 'Necesidad registrada',
  hasUrgency: 'Urgencia registrada',
  minimumBudget: 'Presupuesto mínimo',
  urgencyTiers: 'Urgencia / Plazo',
  priorityZones: 'Zonas prioritarias',
  financingTiers: 'Financiación / operación',
  dataCompleteness: 'Completitud de datos',
  customCriteria: 'Criterio personalizado',
};

export const DEFAULT_URGENCY_TIERS = [
  { key: 'Inmediata (0-30 días)', label: 'Inmediato (< 30 días)', points: 25 },
  { key: '1 a 3 meses', label: '1 a 3 meses', points: 15 },
  { key: '3 a 6 meses', label: '3 a 6 meses', points: 8 },
  { key: 'Explorando opciones', label: 'Solo consulta (> 6 meses)', points: 0 },
];

export const DEFAULT_FINANCING_TIERS = [
  { key: 'Contado / Propios', label: 'Compra contado / Fondos propios', points: 15 },
  { key: 'Crédito aprobado', label: 'Crédito hipotecario pre-aprobado', points: 10 },
  { key: 'Alquiler', label: 'Alquiler / Financiación desarrollador', points: 5 },
  { key: 'Sin definir', label: 'Sin definir', points: 0 },
];

export const DEFAULT_ZONES = ['Palermo', 'Belgrano', 'Recoleta', 'Puerto Madero', 'Nordelta', 'Núñez'];

export const DEFAULT_RULE_DRAFT = {
  name: 'Estándar Inmobiliario',
  status: 'draft',
  thresholds: { qualified: 70, discarded: 45 },
  budget: { enabled: true, currency: 'USD', minAmount: 120000, fullPts: 35, partialEnabled: true, partialPts: 15 },
  urgency: { enabled: true, tiers: DEFAULT_URGENCY_TIERS.map((tier) => ({ ...tier })) },
  zones: { enabled: true, list: [...DEFAULT_ZONES], pts: 15 },
  financing: { enabled: true, tiers: DEFAULT_FINANCING_TIERS.map((tier) => ({ ...tier })) },
  completeness: { enabled: true, fullPts: 10, partialPts: 5 },
  customRules: [],
};

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{Mark}/gu, '').trim().toLowerCase();

export function ruleVersion(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const version = Number(value);
  return Number.isInteger(version) && version > 0 && version <= 2_147_483_647 ? version : null;
}

export function mergeRuleSets(fetched = [], published = []) {
  const byVersion = new Map();
  for (const ruleSet of [...(published ?? []), ...(fetched ?? [])]) {
    const version = ruleVersion(ruleSet?.version);
    if (version !== null && !byVersion.has(version)) {
      byVersion.set(version, { ...ruleSet, version });
    }
  }
  return [...byVersion.values()].sort((a, b) => b.version - a.version);
}

export function formatRuleCriterion(rule) {
  if (rule.type === 'minimumBudget') {
    const amount = Number(rule.minimumAmount).toLocaleString('es-AR');
    return `${scoringCriteria.minimumBudget} (${rule.currency} ${amount})`;
  }
  if (rule.type === 'customCriteria') {
    return rule.name || scoringCriteria.customCriteria;
  }
  return scoringCriteria[rule.type] ?? rule.type;
}

export function formatRuleOption(ruleSet) {
  const name = ruleSet.name ? `${ruleSet.name} · ` : '';
  const statusMap = { active: 'Activa', draft: 'Borrador', archived: 'Archivada' };
  const statusTag = ruleSet.status ? ` (${statusMap[ruleSet.status] ?? ruleSet.status})` : '';
  const criteria = (ruleSet.rules ?? []).map((rule) => {
    if (rule.type === 'minimumBudget') {
      const sign = rule.points >= 0 ? `+${rule.points}` : String(rule.points);
      return `${rule.currency} (${sign})`;
    }
    if (rule.type === 'hasNeeds') return `Necesidad (+${rule.points})`;
    if (rule.type === 'hasUrgency') return `Urgencia (+${rule.points})`;
    if (rule.type === 'urgencyTiers') return `Urgencia (+${Math.max(0, ...rule.tiers.map((t) => t.points))})`;
    if (rule.type === 'priorityZones') return `Zonas (+${rule.points})`;
    if (rule.type === 'financingTiers') return `Financiación (+${Math.max(0, ...rule.tiers.map((t) => t.points))})`;
    if (rule.type === 'dataCompleteness') return `Completitud (+${rule.fullPoints})`;
    if (rule.type === 'customCriteria') return `${rule.name} (+${rule.points})`;
    return rule.type;
  }).join(' · ');
  return `v${ruleSet.version} · ${name}Umbral ${ruleSet.threshold} pts${statusTag}${criteria ? ' · ' + criteria : ''}`;
}

export function ruleSetToEditorState(ruleSet) {
  if (!ruleSet) {
    return structuredClone(DEFAULT_RULE_DRAFT);
  }
  const byType = new Map();
  const customRules = [];
  for (const rule of ruleSet.rules ?? []) {
    if (rule.type === 'customCriteria') {
      customRules.push({
        id: rule.id ?? `cr-${customRules.length + 1}`,
        name: rule.name,
        condition: rule.condition ?? '',
        pts: rule.points ?? 10,
        enabled: true,
      });
    } else {
      byType.set(rule.type, rule);
    }
  }

  const budgetRule = byType.get('minimumBudget');
  const urgencyRule = byType.get('urgencyTiers');
  const zonesRule = byType.get('priorityZones');
  const financingRule = byType.get('financingTiers');
  const completenessRule = byType.get('dataCompleteness');

  return {
    name: ruleSet.name || `Estándar v${ruleSet.version}`,
    status: ruleSet.status || 'archived',
    thresholds: {
      qualified: Number(ruleSet.threshold) || 70,
      discarded: ruleSet.discardThreshold != null
        ? Number(ruleSet.discardThreshold)
        : Math.max(0, Math.min((Number(ruleSet.threshold) || 70) - 1, 45)),
    },
    budget: budgetRule
      ? {
          enabled: true,
          currency: budgetRule.currency ?? 'USD',
          minAmount: Number(budgetRule.minimumAmount) || 0,
          fullPts: Number(budgetRule.points) || 0,
          partialEnabled: Boolean(budgetRule.partialEnabled),
          partialPts: Number(budgetRule.partialPoints ?? 15),
        }
      : { ...DEFAULT_RULE_DRAFT.budget, enabled: false },
    urgency: urgencyRule
      ? {
          enabled: true,
          tiers: urgencyRule.tiers.map((tier) => ({
            key: tier.key,
            label: tier.label ?? tier.key,
            points: Number(tier.points) || 0,
          })),
        }
      : {
          enabled: Boolean(byType.get('hasUrgency')),
          tiers: DEFAULT_URGENCY_TIERS.map((tier, idx) => ({
            ...tier,
            points: byType.get('hasUrgency') ? (idx === 0 ? byType.get('hasUrgency').points : 0) : tier.points,
          })),
        },
    zones: zonesRule
      ? { enabled: true, list: [...zonesRule.zones], pts: Number(zonesRule.points) || 0 }
      : { ...DEFAULT_RULE_DRAFT.zones, enabled: false },
    financing: financingRule
      ? {
          enabled: true,
          tiers: financingRule.tiers.map((tier) => ({
            key: tier.key,
            label: tier.label ?? tier.key,
            points: Number(tier.points) || 0,
          })),
        }
      : { ...DEFAULT_RULE_DRAFT.financing, enabled: false },
    completeness: completenessRule
      ? { enabled: true, fullPts: Number(completenessRule.fullPoints) || 0, partialPts: Number(completenessRule.partialPoints) || 0 }
      : {
          enabled: Boolean(byType.get('hasNeeds')),
          fullPts: byType.get('hasNeeds')?.points ?? DEFAULT_RULE_DRAFT.completeness.fullPts,
          partialPts: Math.round((byType.get('hasNeeds')?.points ?? DEFAULT_RULE_DRAFT.completeness.fullPts) / 2),
        },
    customRules,
  };
}

export function editorStateToPayload(draft, status = 'active') {
  const threshold = Number(draft.thresholds.qualified);
  const discardedRaw = draft.thresholds.discarded;
  const discardThreshold = discardedRaw === '' || discardedRaw == null ? null : Number(discardedRaw);

  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1_000_000) {
    throw new Error('El umbral de Calificado debe ser un entero entre 1 y 1.000.000.');
  }
  if (discardThreshold !== null && (!Number.isInteger(discardThreshold) || discardThreshold < 0 || discardThreshold >= threshold)) {
    throw new Error('El umbral de Descartado debe ser entero, mayor o igual a 0 y menor que el umbral Calificado.');
  }

  const rules = [];
  if (draft.budget.enabled) {
    const minimumAmount = Number(draft.budget.minAmount);
    const points = Number(draft.budget.fullPts);
    const partialPoints = Number(draft.budget.partialPts);
    if (!Number.isFinite(minimumAmount) || minimumAmount < 0) throw new Error('Ingresá un monto mínimo válido.');
    if (!Number.isInteger(points)) throw new Error('Los puntos de presupuesto deben ser enteros.');
    const budgetRule = {
      type: 'minimumBudget',
      currency: draft.budget.currency || 'USD',
      minimumAmount,
      points,
    };
    if (draft.budget.partialEnabled) {
      if (!Number.isInteger(partialPoints)) throw new Error('Los puntos parciales de presupuesto deben ser enteros.');
      budgetRule.partialEnabled = true;
      budgetRule.partialPoints = partialPoints;
    }
    rules.push(budgetRule);
  }

  if (draft.urgency.enabled) {
    rules.push({
      type: 'urgencyTiers',
      tiers: draft.urgency.tiers.map((tier) => ({
        key: tier.key,
        label: tier.label,
        points: Number(tier.points) || 0,
      })),
    });
  }

  if (draft.zones.enabled) {
    if (!draft.zones.list.length) throw new Error('Agregá al menos una zona prioritaria o desactivá el criterio.');
    rules.push({
      type: 'priorityZones',
      zones: [...draft.zones.list],
      points: Number(draft.zones.pts) || 0,
    });
  }

  if (draft.financing.enabled) {
    rules.push({
      type: 'financingTiers',
      tiers: draft.financing.tiers.map((tier) => ({
        key: tier.key,
        label: tier.label,
        points: Number(tier.points) || 0,
      })),
    });
  }

  if (draft.completeness.enabled) {
    rules.push({
      type: 'dataCompleteness',
      fullPoints: Number(draft.completeness.fullPts) || 0,
      partialPoints: Number(draft.completeness.partialPts) || 0,
    });
  }

  for (const custom of draft.customRules ?? []) {
    if (!custom.enabled) continue;
    rules.push({
      type: 'customCriteria',
      id: custom.id,
      name: custom.name.trim(),
      ...(custom.condition?.trim() && { condition: custom.condition.trim() }),
      points: Number(custom.pts) || 0,
    });
  }

  if (!rules.length) {
    throw new Error('Activá al menos un criterio para publicar la versión.');
  }

  return {
    name: draft.name?.trim() || 'Estándar Comercial',
    status,
    threshold,
    discardThreshold,
    rules,
  };
}

export function getRuleDistribution(draft) {
  const segs = [];
  if (draft.budget.enabled) {
    segs.push({ label: 'Presupuesto', max: Number(draft.budget.fullPts) || 0, color: '#F4F4F5' });
  }
  if (draft.urgency.enabled) {
    const maxU = Math.max(0, ...draft.urgency.tiers.map((t) => Number(t.points) || 0));
    segs.push({ label: 'Urgencia', max: maxU, color: '#D6D3D1' });
  }
  if (draft.zones.enabled) {
    segs.push({ label: 'Zonas', max: Number(draft.zones.pts) || 0, color: '#A1A1AA' });
  }
  if (draft.financing.enabled) {
    const maxF = Math.max(0, ...draft.financing.tiers.map((t) => Number(t.points) || 0));
    segs.push({ label: 'Financiación', max: maxF, color: '#71717A' });
  }
  if (draft.completeness.enabled) {
    segs.push({ label: 'Completitud', max: Number(draft.completeness.fullPts) || 0, color: '#52525B' });
  }
  (draft.customRules ?? []).forEach((cr, idx) => {
    if (cr.enabled) {
      segs.push({ label: cr.name, max: Number(cr.pts) || 0, color: idx % 2 === 0 ? '#D6B884' : '#8E8E93' });
    }
  });
  const totalMax = segs.reduce((sum, item) => sum + item.max, 0);
  return { segs, totalMax };
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

export function ruleMaxPoints(rule) {
  if (rule.type === 'urgencyTiers' || rule.type === 'financingTiers') {
    return Math.max(0, ...(rule.tiers ?? []).map((tier) => Number(tier.points) || 0));
  }
  if (rule.type === 'dataCompleteness') {
    return Number(rule.fullPoints) || 0;
  }
  return Number(rule.points) || 0;
}

export function previewQualification(facts, ruleSet) {
  if (!ruleSet) return null;
  const rawAmount = facts?.budgetAmount;
  const budgetAmount = rawAmount === '' || rawAmount == null ? Number.NaN : Number(rawAmount);
  const budgetCurrency = facts?.budgetCurrency || null;

  const breakdown = (ruleSet.rules ?? []).map((rule) => {
    if (rule.type === 'minimumBudget') {
      if (!Number.isFinite(budgetAmount) || budgetCurrency == null) {
        return { ...rule, status: 'pending', points: null };
      }
      if (budgetCurrency !== rule.currency) {
        return { ...rule, status: 'not_applicable', points: null };
      }
      if (budgetAmount >= rule.minimumAmount) {
        return { ...rule, status: 'evaluated', points: rule.points };
      }
      if (rule.partialEnabled && Number.isInteger(rule.partialPoints) && rule.minimumAmount > 0
          && budgetAmount >= rule.minimumAmount * 0.8) {
        return { ...rule, status: 'evaluated', points: rule.partialPoints };
      }
      return { ...rule, status: 'evaluated', points: 0 };
    }

    if (rule.type === 'hasNeeds' || rule.type === 'hasUrgency') {
      const value = facts?.[rule.type === 'hasNeeds' ? 'needs' : 'urgency'];
      const known = typeof value === 'string' && value.trim().length > 0;
      return { ...rule, status: known ? 'evaluated' : 'pending', points: known ? rule.points : null };
    }

    if (rule.type === 'urgencyTiers') {
      if (typeof facts?.urgency !== 'string' || !facts.urgency.trim()) {
        return { ...rule, status: 'pending', points: null };
      }
      const matched = matchTier(facts.urgency, rule.tiers ?? []);
      return { ...rule, status: 'evaluated', points: matched ? matched.points : 0 };
    }

    if (rule.type === 'priorityZones') {
      if (typeof facts?.zone !== 'string' || !facts.zone.trim()) {
        return { ...rule, status: 'pending', points: null };
      }
      const leadZone = normalize(facts.zone);
      const matched = (rule.zones ?? []).find((zone) => {
        const candidate = normalize(zone);
        return candidate && (leadZone.includes(candidate) || candidate.includes(leadZone));
      });
      return { ...rule, status: 'evaluated', points: matched ? rule.points : 0 };
    }

    if (rule.type === 'financingTiers') {
      if (typeof facts?.financing !== 'string' || !facts.financing.trim()) {
        return { ...rule, status: 'pending', points: null };
      }
      const matched = matchTier(facts.financing, rule.tiers ?? []);
      return { ...rule, status: 'evaluated', points: matched ? matched.points : 0 };
    }

    if (rule.type === 'dataCompleteness') {
      const hasContact = Boolean((typeof facts?.email === 'string' && facts.email.trim())
        || (typeof facts?.phone === 'string' && facts.phone.trim()));
      const hasNeeds = Boolean(typeof facts?.needs === 'string' && facts.needs.trim());
      const points = hasContact && hasNeeds ? rule.fullPoints : (hasContact || hasNeeds ? rule.partialPoints : 0);
      return { ...rule, status: 'evaluated', points };
    }

    if (rule.type === 'customCriteria') {
      const checks = facts?.customChecks && typeof facts.customChecks === 'object' ? facts.customChecks : {};
      const key = rule.id ?? rule.name;
      const met = Boolean(checks[key] ?? checks[rule.name]);
      return { ...rule, status: 'evaluated', points: met ? rule.points : 0 };
    }

    return { ...rule, status: 'not_applicable', points: null };
  });

  const applicable = breakdown.filter((entry) => entry.status === 'evaluated');
  if (breakdown.some((entry) => entry.status === 'pending') || applicable.length === 0) {
    return { decision: 'pending', score: null, breakdown, threshold: ruleSet.threshold, discardThreshold: ruleSet.discardThreshold ?? null };
  }

  const score = applicable.reduce((total, entry) => total + entry.points, 0);
  let decision = 'not_qualified';
  if (score >= ruleSet.threshold) {
    decision = 'qualified';
  } else if (ruleSet.discardThreshold != null && ruleSet.discardThreshold < ruleSet.threshold && score >= ruleSet.discardThreshold) {
    decision = 'review';
  }
  return {
    decision,
    score,
    breakdown,
    threshold: ruleSet.threshold,
    discardThreshold: ruleSet.discardThreshold ?? null,
  };
}

export function knownRuleVersions(published, history) {
  const versions = new Map();
  const add = (input, source) => {
    const version = ruleVersion(input);
    if (version !== null && !versions.has(version)) {
      versions.set(version, { value: String(version), label: 'Versión ' + version + ' · ' + source });
    }
  };
  for (const { version } of published) add(version, 'Publicada en esta sesión');
  for (const { ruleSetVersion } of history ?? []) add(ruleSetVersion, 'Usada con este interesado');
  return [...versions.values()];
}
