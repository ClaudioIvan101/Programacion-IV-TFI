export function leadLabel({ name, email, phone }) {
  return name || email || phone || 'Interesado sin nombre';
}

export function dashboardApi(token, onUnauthorized, fetcher = fetch) {
  async function request(path, { body, signal, unavailable, registrationId } = {}) {
    const response = await fetcher('/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body && { 'Content-Type': 'application/json' }),
        ...(registrationId && { 'Idempotency-Key': registrationId }),
      },
      body: body && JSON.stringify(body),
      signal,
    }).catch((error) => {
      if (error.name === 'AbortError') throw error;
      throw new Error('No se pudo conectar con el servidor.');
    });
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const messages = {
        400: 'Revise los datos ingresados.',
        401: 'La sesión ya no es válida.',
        403: 'Esta acción requiere una cuenta de administrador.',
        404: 'El recurso ya no está disponible.',
        409: registrationId
          ? 'La clave de registro ya fue usada con otros datos.'
          : 'La conversación cambió. Actualice el historial antes de volver a enviar.',
        503: unavailable ?? 'El servicio no está disponible.',
      };
      throw Object.assign(new Error(messages[response.status] ?? 'No se pudo completar la operación.'), {
        status: response.status,
      });
    }
    return response.json();
  }

  const leadPath = (id) => '/leads/' + encodeURIComponent(id);
  const conversationPath = (id) => '/conversations/' + encodeURIComponent(id);
  return {
    listLeads: (signal) => request('/leads', { signal }),
    async createLead(body, registrationId = crypto.randomUUID()) {
      const options = { body, registrationId };
      try {
        return await request('/leads', options);
      } catch (error) {
        if (error.status && error.status < 500) throw error;
        return request('/leads', options);
      }
    },
    listQualifications: (id, signal) => request(leadPath(id) + '/qualifications', { signal }),
    listConversations: (id, signal) => request(leadPath(id) + '/conversations', { signal }),
    createConversation: (id, signal) => request(leadPath(id) + '/conversations', { body: {}, signal }),
    listMessages: (id, signal) => request(conversationPath(id) + '/messages', { signal }),
    conversationContext: (id, signal) => request(conversationPath(id) + '/context', { signal }),
    sendMessage: (id, content, signal) => request(conversationPath(id) + '/turn', {
      body: { content },
      signal,
      unavailable: 'El asistente no está disponible. Verifique que la integración T4 esté activa.',
    }),
    createForm: (name, signal) => request('/forms', { body: { name: name.trim() }, signal }),
  };
}

export async function loadLeadOverview(api, signal) {
  const leads = await api.listLeads(signal);
  const rows = [];
  for (let start = 0; start < leads.length; start += 6) {
    signal?.throwIfAborted();
    rows.push(...await Promise.all(leads.slice(start, start + 6).map(async (lead) => {
      try {
        const history = await api.listQualifications(lead.id, signal);
        const latest = history[0];
        return { ...lead, decision: latest?.decision ?? 'pending', score: latest?.score ?? null,
          ruleSetVersion: latest?.ruleSetVersion ?? null };
      } catch (error) {
        if (error.status === 401 || error.name === 'AbortError') throw error;
        return { ...lead, decision: null };
      }
    })));
  }
  const complete = rows.every((lead) => ['qualified', 'pending', 'not_qualified'].includes(lead.decision));
  return {
    leads: rows,
    counts: {
      total: rows.length,
      qualified: complete ? rows.filter((lead) => lead.decision === 'qualified').length : null,
      pending: complete ? rows.filter((lead) => lead.decision === 'pending').length : null,
    },
  };
}
