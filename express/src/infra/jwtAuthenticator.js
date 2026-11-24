import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

const userIdSchema = z.uuid();
const algorithm = 'HS256';
const issuer = 'leadqual';
const audience = 'leadqual-core-api';
const expiresIn = 15 * 60;

function userJwtKey(secretHex) {
  // Si falta la clave, la autenticación queda deshabilitada. Si tiene un formato inválido, falla el arranque.
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
    // Genera un JWT con el ID del usuario, válido por 15 minutos y firmado con HS256.
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
    // Lee el token Bearer del encabezado Authorization. Si falta el token o la clave, devuelve null.
    const token = /^Bearer +([^\s,]+)$/i.exec(authorization ?? '')?.[1];
    if (!key || !token) return null;

    // Comprueba la firma, el vencimiento, quién emitió el token y para qué API se emitió.
    let payload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: [algorithm],
        issuer,
        audience,
        requiredClaims: ['sub', 'exp'],
      }));
    } catch (error) {
      // Si la verificación rechaza el token, devuelve null. Los demás errores se propagan.
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }

    // Lee el ID del usuario del token y comprueba que tenga formato UUID.
    const userId = userIdSchema.safeParse(payload.sub);
    if (!userId.success) return null;

    // Busca al usuario en PostgreSQL para que el middleware revise su rol y estado actuales.
    // La consulta queda fuera del try para que un error de la base llegue al manejador de errores.
    return findUserById(userId.data);
  };
}
