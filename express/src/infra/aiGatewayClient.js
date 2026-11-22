import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { z } from 'zod';
import { T4_MAX_BODY_BYTES as maxBody } from '../domain/ai/t4Limits.js';

// No se incluyen cuerpos ni errores externos en los mensajes o propiedades.
export class AiGatewayError extends Error {
  constructor(code, status) {
    super(`AI gateway: ${code}`);
    this.name = 'AiGatewayError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const uuid = z.string().uuid();

// Los esquemas se suministran desde una fuente confiable en composición.
// No se descargan referencias ni se mantiene una copia paralela en Zod.
export function createAiGatewayClient({ baseUrl, getServiceToken, schemas, fetchImpl = fetch, httpAuthorization }) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new AiGatewayError('CONFIG'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new AiGatewayError('CONFIG');
  }
  if (url.protocol === 'http:') {
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const internal = url.hostname === 'ai-gateway';
    const environment = httpAuthorization?.environment;
    // HTTP interno no cifra: requiere red controlada y autorización de despliegue.
    if ((!local && !internal) || httpAuthorization?.origin !== url.origin ||
        !['development', 'test', 'production'].includes(environment) ||
        (local && !['development', 'test'].includes(environment))) {
      throw new AiGatewayError('CONFIG');
    }
  }
  if (typeof getServiceToken !== 'function' || typeof fetchImpl !== 'function' || !schemas) throw new AiGatewayError('CONFIG');
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  let validateRequest;
  let validateResponse;
  try {
    ajv.addSchema(schemas.leadData, 'lead-data.schema.json');
    ajv.addSchema(schemas.result, 'result.schema.json');
    validateRequest = ajv.compile(schemas.request);
    validateResponse = ajv.compile(schemas.response);
  } catch { throw new AiGatewayError('CONFIG'); }
  const endpoint = new URL('/v1/structured-completions', url);

  return {
    async structuredCompletion(request, { idempotencyKey, requestId, deadline } = {}) {
      if (!validateRequest(request) || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey) ||
          !uuid.safeParse(requestId).success || typeof deadline !== 'string' ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(deadline)) {
        throw new AiGatewayError('INVALID_REQUEST');
      }
      const remaining = Date.parse(deadline) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 15000) throw new AiGatewayError('INVALID_DEADLINE');
      let body;
      try { body = JSON.stringify(request); } catch { throw new AiGatewayError('INVALID_REQUEST'); }
      if (Buffer.byteLength(body, 'utf8') > maxBody) throw new AiGatewayError('INVALID_REQUEST');
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new AiGatewayError('TIMEOUT')); }, remaining);
      });
      const operation = async () => {
        let token;
        try { token = await getServiceToken(); } catch { throw new AiGatewayError('CREDENTIALS'); }
        if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new AiGatewayError('CREDENTIALS');
        if (controller.signal.aborted) throw new AiGatewayError('TIMEOUT');
        let response;
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey, 'X-Request-Id': requestId, 'X-Deadline': deadline },
            body,
          });
        } catch { throw new AiGatewayError(controller.signal.aborted ? 'TIMEOUT' : 'TRANSPORT'); }
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new AiGatewayError('HTTP_ERROR', response.status);
        }
        if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          await response.body?.cancel().catch(() => {});
          throw new AiGatewayError('INVALID_RESPONSE');
        }
        const length = response.headers.get('content-length');
        if (length && (!/^\d+$/.test(length) || Number(length) > maxBody)) {
          await response.body?.cancel().catch(() => {});
          throw new AiGatewayError('INVALID_RESPONSE');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new AiGatewayError('INVALID_RESPONSE');
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBody) { await reader.cancel(); throw new AiGatewayError('INVALID_RESPONSE'); }
            chunks.push(value);
          }
        } catch (error) {
          if (error instanceof AiGatewayError) throw error;
          throw new AiGatewayError(controller.signal.aborted ? 'TIMEOUT' : 'TRANSPORT');
        } finally { reader.releaseLock(); }
        let data;
        try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { throw new AiGatewayError('INVALID_RESPONSE'); }
        if (!validateResponse(data)) throw new AiGatewayError('INVALID_RESPONSE');
        return data;
      };
      try { return await Promise.race([operation(), timeout]); }
      finally { clearTimeout(timer); }
    },
  };
}
