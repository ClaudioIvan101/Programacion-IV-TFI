export const campaignPageSize = 20;

export function createCaptureApi(accessToken, onUnauthorized, fetchImpl = fetch) {
  async function request(path, { body, signal } = {}) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(`/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401) onUnauthorized?.();
    if (!response.ok) throw new Error(data?.error || 'No se pudo completar la solicitud.');
    if (data === null) throw new Error('La API devolvió una respuesta inesperada.');
    return data;
  }

  const campaignPath = (id) => `/campaigns/${encodeURIComponent(id)}`;
  return {
    // El backend responde { data, pagination }; la interfaz trabaja con una forma estable.
    listCampaigns: async (page, signal) => {
      const result = await request(`/campaigns?page=${page}&limit=${campaignPageSize}`, { signal });
      return { items: result.data ?? [], total: result.pagination?.total ?? 0 };
    },
    createCampaign: (body) => request('/campaigns', { body }),
    listChannels: (id, signal) => request(`${campaignPath(id)}/channels`, { signal }),
    addChannel: (id, channel) => request(`${campaignPath(id)}/channels`, { body: { channel } }),
    listForms: (id, signal) => request(`${campaignPath(id)}/forms`, { signal }),
    createForm: (id, name) => request('/forms', { body: { campaignId: id, name } }),
  };
}
