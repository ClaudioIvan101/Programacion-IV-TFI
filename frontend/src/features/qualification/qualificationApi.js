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
