import { errors, jwtVerify } from 'jose';
import { z } from 'zod';

const userIdSchema = z.uuid();

export function createJwtAuthenticator({ secretHex, findUserById }) {
  // Una clave ausente mantiene el acceso cerrado; una clave configurada con formato inválido impide el arranque.
  if (secretHex !== undefined && secretHex !== '' &&
      (typeof secretHex !== 'string' || secretHex.length !== 64 || !/^[0-9a-f]+$/i.test(secretHex))) {
    throw new Error('JWT_SECRET_HEX debe contener 32 bytes en hexadecimal.');
  }

  // Se decodifican los 32 bytes de la clave una sola vez al configurar el autenticador.
  const key = secretHex ? Buffer.from(secretHex, 'hex') : null;

  return async function authenticate(authorization) {
    // La falta de credenciales válidas se representa con null; el router decide la respuesta HTTP.
    const token = /^Bearer +([^\s,]+)$/i.exec(authorization ?? '')?.[1];
    if (!key || !token) return null;

    // La firma, el destinatario y la vigencia se verifican antes de confiar en el identificador.
    let payload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        issuer: 'leadqual',
        audience: 'leadqual-core-api',
        requiredClaims: ['sub', 'exp'],
      }));
    } catch (error) {
      // Los errores de token se tratan como credenciales inválidas, no como fallos internos.
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }

    // El identificador verificado debe tener el formato UUID que espera el repositorio.
    const userId = userIdSchema.safeParse(payload.sub);
    if (!userId.success) return null;

    // Consultar el rol actual evita conservar permisos revocados en un token válido.
    // La consulta queda fuera del bloque de verificación: un fallo de base no se confunde con un token inválido.
    return findUserById(userId.data);
  };
}
