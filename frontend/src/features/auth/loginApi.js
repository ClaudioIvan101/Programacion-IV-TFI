export async function requestLogin({ email = '', password }, fetcher = fetch) {
  let response;
  try {
    response = await fetcher('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Inténtelo de nuevo.');
  }

  if (response.status === 401) throw new Error('Credenciales incorrectas.');
  if (response.status === 400) throw new Error('Revise el correo electrónico y la contraseña.');
  if (!response.ok) throw new Error('El inicio de sesión no está disponible en este momento.');

  const session = await response.json().catch(() => null);
  if (!session?.accessToken || typeof session.accessToken !== 'string' ||
      session.tokenType !== 'Bearer' || !Number.isSafeInteger(session.expiresIn) ||
      session.expiresIn <= 0) {
    throw new Error('El servidor devolvió una respuesta de inicio de sesión inválida.');
  }
  return { accessToken: session.accessToken, expiresAt: Date.now() + session.expiresIn * 1000 };
}
