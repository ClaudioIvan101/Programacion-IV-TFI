import { randomUUID } from "node:crypto";

import { processStructuredCompletion } from "./processStructuredCompletion.js";
import { T4_MAX_BODY_BYTES } from "./t4Limits.js";

// Perfil del request T4 (contracts/schemas/request.schema.json).
const TASK = "real_estate_assistance";
const LANE = "live";
const JSON_SCHEMA = { $ref: "urn:leadqual:ai:result:v1" };
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 40;

// El gateway rechaza deadlines de más de 15 s. Se pide menos para dejar margen
// a la red y al propio procesamiento del gateway.
const TURN_BUDGET_MS = 10_000;
const PROVIDER_HTTP_FAILURES = new Set([502, 503, 504]);
const PROVIDER_CLIENT_FAILURES = new Set(["TIMEOUT", "TRANSPORT", "INVALID_RESPONSE"]);

export class ConversationTurnError extends Error {
  constructor(code) {
    super(`Turno conversacional: ${code}`);
    this.name = "ConversationTurnError";
    // El adaptador HTTP traduce este código; el caso de uso no conoce estados.
    this.code = code;
  }
}

// Contexto T4 sin datos: es válido contra `lead-data.schema.json` porque las
// cuatro claves están presentes y sus valores son nulos.
const EMPTY_CONTEXT = Object.freeze({
  contacto: null,
  necesidades: null,
  presupuesto: null,
  urgencia: null,
});

export function contextFromLead({
  name = null,
  email = null,
  phone = null,
  needs = null,
  budgetAmount = null,
  budgetCurrency = null,
  urgency = null,
}) {
  // El contacto es nulo solo cuando no hay ningún dato; si hay uno, se envían
  // los tres campos porque el esquema los exige juntos.
  const hasContact = name !== null || email !== null || phone !== null;

  return {
    contacto: hasContact ? { nombre: name, email: email, telefono: phone } : null,
    necesidades: needs,
    // Una moneda sin monto no existe: el esquema exige `monto` dentro del objeto.
    presupuesto:
      budgetAmount === null ? null : { monto: budgetAmount, moneda: budgetCurrency },
    urgencia: urgency,
  };
}

/**
 * Construye el caso de uso del turno conversacional.
 *
 * Recibe el mensaje del lead, llama al gateway de IA, valida la respuesta,
 * persiste ambos mensajes y el contexto de la conversación, y devuelve la
 * próxima pregunta. No conoce HTTP, ni PostgreSQL, ni cómo se firma el JWT:
 * todo eso entra por los adaptadores inyectados.
 */
export function makeRunConversationTurn({
  conversationTurnRepository,
  aiGateway,
  newId = randomUUID,
  now = () => new Date(),
}) {
  return async function runConversationTurn({ conversationId, content }) {
    const turn = await conversationTurnRepository.loadTurn(conversationId, {
      maxMessages: MAX_MESSAGES,
    });
    if (!turn) return null;

    // En la primera vuelta el contexto arranca con lo que el formulario ya
    // sabía del lead; después manda el contexto acumulado de la conversación.
    const previousContext = turn.context ?? contextFromLead(turn);

    const request = {
      task: TASK,
      lane: LANE,
      messages: [],
      context: previousContext,
      json_schema: JSON_SCHEMA,
      max_tokens: MAX_TOKENS,
    };

    // Reservar primero el resto del cuerpo. Se añade un sufijo contiguo del
    // historial, contando los bytes reales de JSON y las comas entre mensajes.
    const recent = [...turn.messages, { role: "lead", content }].slice(-MAX_MESSAGES);
    let remaining = T4_MAX_BODY_BYTES - Buffer.byteLength(JSON.stringify(request), "utf8");
    for (const message of recent.reverse()) {
      const bytes = Buffer.byteLength(JSON.stringify(message), "utf8") + (request.messages.length ? 1 : 0);
      if (bytes > remaining) break;
      request.messages.unshift(message);
      remaining -= bytes;
    }
    if (!request.messages.length) throw new ConversationTurnError("INVALID_CONTEXT");

    // Se fija el instante del turno antes de salir a la red: sirve para el
    // deadline y para ordenar los dos mensajes que se van a persistir.
    const turnAt = now();
    const deadline = new Date(turnAt.getTime() + TURN_BUDGET_MS).toISOString();

    async function persist(result, context) {
      const saved = await conversationTurnRepository.saveTurn({
        conversationId,
        version: turn.version,
        leadContent: content,
        assistantContent: result.assistantMessage,
        context,
        turnAt,
        turnResult: result,
      });
      if (saved === null) throw new ConversationTurnError("TURN_CONFLICT");
      return result;
    }

    function requestHumanReview() {
      return persist({
        assistantMessage: "El asistente no pudo responder. Este mensaje requiere revisión humana.",
        humanReviewRequired: true,
      }, turn.context);
    }

    let responseBody;
    try {
      responseBody = await aiGateway.structuredCompletion(request, {
        idempotencyKey: newId(),
        requestId: newId(),
        deadline,
      });
    } catch (error) {
      // El gateway ya agotó su política de reintentos. No iniciar otro intento
      // ni tratar errores de autenticación o de solicitud como fallos del proveedor.
      if (PROVIDER_CLIENT_FAILURES.has(error?.code) ||
          (error?.code === "HTTP_ERROR" && PROVIDER_HTTP_FAILURES.has(error.status))) {
        return requestHumanReview();
      }
      throw new ConversationTurnError(error?.code ?? "INTERNAL_ERROR");
    }

    let processed;
    try {
      processed = processStructuredCompletion(responseBody, previousContext);
    } catch {
      // El contexto guardado no cumple `lead-data.schema.json`: es un defecto
      // nuestro, no del proveedor.
      throw new ConversationTurnError("INVALID_CONTEXT");
    }
    if (!processed.ok) return requestHumanReview();

    const { data } = processed.response;
    const result = {
      assistantMessage: data.assistant_message,
      nextQuestionKey: data.next_question_key,
      missingFields: data.missing_fields,
      context: processed.context,
      // El cliente sabe que debe preguntar por la moneda del presupuesto.
      needsBudgetCurrencyClarification: processed.needsBudgetCurrencyClarification,
    };
    return persist(result, processed.context);
  };
}
