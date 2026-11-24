const errors = {
  400: 'Revisa los datos del usuario.',
  401: 'La sesión venció. Inicia sesión nuevamente.',
  403: 'Solo un administrador activo puede gestionar usuarios.',
  404: 'El usuario ya no está disponible.',
  409: 'El correo ya está registrado.',
};

export function createUsersApi(accessToken, onUnauthorized, fetchImpl = fetch) {
  async function request(path, { signal, body } = {}) {
    const response = await fetchImpl(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        ...(body && { 'Content-Type': 'application/json' }),
      },
      signal,
      ...(body && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      if (response.status === 401 && !signal?.aborted) onUnauthorized?.();
      const error = new Error(errors[response.status] ?? 'No se pudo completar la operación de usuarios.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  return {
    list: (signal) => request('/api/users', { signal }),
    get: (id, signal) => request('/api/users/' + encodeURIComponent(id), { signal }),
    create: (body, signal) => request('/api/users', { signal, body }),
  };
}
