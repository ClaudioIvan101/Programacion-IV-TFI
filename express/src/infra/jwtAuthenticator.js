import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

const userIdSchema = z.uuid();
const algorithm = 'HS256';
const issuer = 'leadqual';
const audience = 'leadqual-core-api';
const expiresIn = 15 * 60;

function userJwtKey(secretHex) {
  // Una clave ausente mantiene el acceso cerrado; una clave configurada con formato inválido impide el arranque.
  if (secretHex !== undefined && secretHex !== '' &&
      (typeof secretHex !== 'string' || secretHex.length !== 64 || !/^[0-9a-f]+$/i.test(secretHex))) {
    throw new Error('JWT_SECRET_HEX debe contener 32 bytes en hexadecimal.');
  }

  return secretHex ? Buffer.from(secretHex, 'hex') : null;
}

export function createJwtIssuer({ secretHex }) {
  const key = userJwtKey(secretHex);
  if (!key) return null;

  return async function issueToken(userId) {
    // El JWT de usuario lleva la identidad. El rol se vuelve a consultar en PostgreSQL.
    const issuedAt = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: algorithm })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + expiresIn)
      .sign(key);
    return { accessToken, tokenType: 'Bearer', expiresIn };
  };
}

export function createJwtAuthenticator({ secretHex, findUserById }) {
  const key = userJwtKey(secretHex);
  return async function authenticate(authorization) {
    // La falta de credenciales válidas se representa con null; el router decide la respuesta HTTP.
    const token = /^Bearer +([^\s,]+)$/i.exec(authorization ?? '')?.[1];
    if (!key || !token) return null;

    // La firma, el destinatario y la vigencia se verifican antes de confiar en el identificador.
    let payload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: [algorithm],
        issuer,
        audience,
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
