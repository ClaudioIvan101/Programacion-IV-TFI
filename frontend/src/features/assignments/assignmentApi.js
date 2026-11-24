export function assignmentApi(accessToken, onUnauthorized, fetchImpl = fetch) {
  async function request(path = '', { method = 'GET', body, signal } = {}) {
    const response = await fetchImpl('/api/assignments' + path, {
      method, signal,
      headers: { Authorization: 'Bearer ' + accessToken, ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401) onUnauthorized?.();
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || 'No se pudo acceder a las derivaciones.');
    return data;
  }

  return {
    list: (signal) => request('', { signal }),
    options: (signal) => request('/options', { signal }),
    create: (body) => request('', { method: 'POST', body }),
    retry: (id) => request('/' + encodeURIComponent(id) + '/retry', { method: 'POST' }),
    firstContact: (id) => request('/' + encodeURIComponent(id) + '/first-contact', { method: 'POST' }),
  };
}

export const notificationLabels = {
  pending: ['Pendiente', 'yellow'],
  sending: ['En proceso', 'blue'],
  sent: ['Aceptado por el servidor de correo', 'green'],
  failed: ['No enviado', 'red'],
  uncertain: ['Entrega no confirmada', 'orange'],
};

export function formatResponseTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Sin contacto registrado';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return [days && days + ' d', hours && hours + ' h', minutes && minutes + ' min', (seconds % 60) + ' s']
    .filter(Boolean).join(' ');
}
