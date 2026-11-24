export function qualificationData({ needs, urgency, budgetAmount, budgetCurrency }) {
  const hasAmount = budgetAmount !== '' && budgetAmount != null;
  if (!hasAmount && budgetCurrency) throw new Error('Ingrese el monto para indicar una moneda.');
  return {
    ...(needs.trim() && { needs: needs.trim() }),
    ...(urgency.trim() && { urgency: urgency.trim() }),
    ...(hasAmount && { budgetAmount: Number(budgetAmount) }),
    ...(budgetCurrency && { budgetCurrency }),
  };
}

export function hasUnconfirmedFacts(draft, saved) {
  const clean = (value) => String(value ?? '').trim();
  const amount = (value) => clean(value) === '' ? null : Number(value);
  return ['needs', 'urgency', 'budgetCurrency'].some((key) => clean(draft[key]) !== clean(saved[key])) ||
    amount(draft.budgetAmount) !== amount(saved.budgetAmount);
}

export function ruleSetData(threshold, pointsByType, currency, minimumAmount) {
  const config = { threshold: Number(threshold), rules: [] };
  if (!Number.isInteger(config.threshold) || config.threshold < 1 || config.threshold > 1_000_000) {
    throw new Error('Ingrese un umbral entero entre 1 y 1.000.000.');
  }
  for (const type of ['hasNeeds', 'hasUrgency', 'minimumBudget']) {
    const raw = pointsByType[type];
    if (raw === '' || raw == null) continue;
    const points = Number(raw);
    if (!Number.isInteger(points) || Math.abs(points) > 1_000_000) {
      throw new Error('Los puntos deben ser enteros entre −1.000.000 y 1.000.000.');
    }
    const rule = { type, points };
    if (type === 'minimumBudget') {
      const amount = Number(minimumAmount);
      if (minimumAmount === '' || minimumAmount == null || !Number.isFinite(amount) ||
          amount < 0 || amount > 1_000_000_000_000 || !['ARS', 'USD'].includes(currency)) {
        throw new Error('Indique un monto mínimo válido y su moneda.');
      }
      Object.assign(rule, { currency, minimumAmount: amount });
    }
    config.rules.push(rule);
  }
  if (!config.rules.length) throw new Error('Configure al menos un criterio.');
  return config;
}

export function qualificationApi(token, onUnauthorized, fetcher = fetch) {
  async function request(path, { method = 'GET', body, signal } = {}) {
    const response = await fetcher('/api' + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal,
    });
    if (response.ok) return response.json();
    if (response.status === 401) onUnauthorized();
    const messages = {
      400: 'Revise los datos ingresados.',
      401: 'La sesión ya no es válida.',
      403: 'Esta acción requiere una cuenta de administrador.',
      404: 'No se encontró el interesado, la conversación o la versión solicitada.',
    };
    throw new Error(messages[response.status] ?? 'No se pudo completar la operación.');
  }

  const leadPath = (id) => '/leads/' + encodeURIComponent(id);
  return {
    leads: (signal) => request('/leads', { signal }),
    conversations: (id, signal) => request(leadPath(id) + '/conversations', { signal }),
    conversationContext: (id, signal) => request('/conversations/' + encodeURIComponent(id) + '/context', { signal }),
    history: (id, signal) => request(leadPath(id) + '/qualifications', { signal }),
    saveFacts: (id, conversation, data) => request(
      leadPath(id) + '/conversations/' + encodeURIComponent(conversation) + '/qualification-data',
      { method: 'PATCH', body: data },
    ),
    publish: (body) => request('/lead-scoring-rule-sets', { method: 'POST', body }),
    qualify: (id, ruleSetVersion) => request(leadPath(id) + '/qualifications', {
      method: 'POST', body: { ruleSetVersion },
    }),
  };
}
