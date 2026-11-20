import { importPKCS8, SignJWT } from 'jose';

// El perfil T4 es independiente de los JWT de usuario.
export async function createServiceTokenProvider({ privateKeyPem, lifetimeSeconds = 60 } = {}) {
  if (typeof privateKeyPem !== 'string' || !privateKeyPem.trim() ||
      !Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > 60) {
    throw new Error('Configuración de JWT de servicio inválida.');
  }

  let key;
  try {
    key = await importPKCS8(privateKeyPem, 'RS256');
    if (key.type !== 'private' || key.algorithm?.name !== 'RSASSA-PKCS1-v1_5' || key.algorithm.modulusLength < 2048) {
      throw new Error('Clave inválida.');
    }
  } catch {
    // No propagar errores criptográficos que puedan incluir material sensible.
    throw new Error('Configuración de JWT de servicio inválida.');
  }

  // Devuelve solamente el token: aiGatewayClient añade el prefijo Bearer.
  return async function getServiceToken() {
    try {
      const now = Math.floor(Date.now() / 1000);
      return await new SignJWT({ scope: 'ai:structured-completions' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer('core-api')
        .setAudience('ai-gateway')
        .setSubject('core-api')
        .setIssuedAt(now)
        .setNotBefore(now)
        .setExpirationTime(now + lifetimeSeconds)
        .sign(key);
    } catch {
      throw new Error('No se pudo emitir el JWT de servicio.');
    }
  };
}
