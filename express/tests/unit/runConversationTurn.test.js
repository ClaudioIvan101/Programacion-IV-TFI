import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConversationTurnError,
  contextFromLead,
  makeRunConversationTurn,
} from "../../src/domain/ai/runConversationTurn.js";

const uuid = () => "af24e13f-a33f-4a5d-9e76-cbc3cdd7550a";
const turnAt = new Date("2026-01-01T00:00:00.000Z");

// Respuesta T4 válida; cada prueba ajusta solo los datos que le importan.
function response(extracted = {}, data = {}) {
  return {
    data: {
      assistant_message: "¿En qué zona buscás?",
      extracted_data: {
        contacto: null,
        necesidades: null,
        presupuesto: null,
        urgencia: null,
        ...extracted,
      },
      summary: "Resumen.",
      next_question_key: null,
      missing_fields: [],
      ...data,
    },
    usage: { input_tokens: 1, output_tokens: 2 },
    model: "test",
    latency_ms: 5,
  };
}

// Fila que devolvería el repositorio: conversación + datos del lead.
function turn(overrides = {}) {
  return {
    id: "c1",
    version: "17",
    leadId: "l1",
    context: null,
    messages: [],
    name: null,
    email: null,
    phone: null,
    needs: null,
    budgetAmount: null,
    budgetCurrency: null,
    urgency: null,
    ...overrides,
  };
}

test("el primer turno inicializa el contexto desde el lead y persiste la respuesta", async () => {
  const requests = [];
  const saved = [];
  const run = makeRunConversationTurn({
    conversationTurnRepository: {
      loadTurn: async () => turn({ name: "Ana" }),
      saveTurn: async (input) => { saved.push(input); },
    },
    aiGateway: {
      structuredCompletion: async (request, options) => {
        requests.push({ request, options });
        return response(
          {
            contacto: { nombre: null, email: "ana@example.invalid", telefono: null },
            necesidades: "Casa",
            presupuesto: { monto: 50000, moneda: "USD" },
          },
          { next_question_key: "urgencia", missing_fields: ["urgencia"] },
        );
      },
    },
    newId: uuid,
    now: () => turnAt,
  });

  const result = await run({ conversationId: "c1", content: "Hola" });

  // El contexto inicial sale del lead y respeta el esquema T4.
  assert.deepEqual(requests[0].request, {
    task: "real_estate_assistance",
    lane: "live",
    messages: [{ role: "lead", content: "Hola" }],
    context: contextFromLead({ name: "Ana" }),
    json_schema: { $ref: "urn:leadqual:ai:result:v1" },
    max_tokens: 1024,
  });
  // El deadline se calcula con el reloj inyectado y deja margen al gateway.
  assert.equal(requests[0].options.deadline, "2026-01-01T00:00:10.000Z");
  assert.equal(requests[0].options.idempotencyKey, uuid());
  assert.equal(requests[0].options.requestId, uuid());

  // El contacto se fusiona campo por campo con lo que ya sabía el lead.
  assert.deepEqual(saved[0], {
    conversationId: "c1",
    version: "17",
    leadContent: "Hola",
    assistantContent: "¿En qué zona buscás?",
    context: {
      contacto: { nombre: "Ana", email: "ana@example.invalid", telefono: null },
      necesidades: "Casa",
      presupuesto: { monto: 50000, moneda: "USD" },
      urgencia: null,
    },
    turnAt,
  });

  assert.deepEqual(result, {
    assistantMessage: "¿En qué zona buscás?",
    nextQuestionKey: "urgencia",
    missingFields: ["urgencia"],
    context: saved[0].context,
    needsBudgetCurrencyClarification: false,
  });
});

test("los turnos siguientes usan el contexto persistido y el historial", async () => {
  const context = {
    contacto: { nombre: "Ana", email: null, telefono: null },
    necesidades: "Casa",
    presupuesto: null,
    urgencia: null,
  };
  const requests = [];
  const run = makeRunConversationTurn({
    conversationTurnRepository: {
      loadTurn: async () => turn({
        context,
        messages: [
          { role: "lead", content: "Hola" },
          { role: "assistant", content: "¿Buscás casa o depto?" },
        ],
      }),
      saveTurn: async () => {},
    },
    aiGateway: {
      structuredCompletion: async (request) => {
        requests.push(request);
        return response();
      },
    },
    newId: uuid,
    now: () => turnAt,
  });

  await run({ conversationId: "c1", content: "Casa" });

  // Gana el contexto de la conversación, no los datos del lead.
  assert.deepEqual(requests[0].context, context);
  // El historial previo viaja completo, seguido del mensaje nuevo.
  assert.deepEqual(requests[0].messages, [
    { role: "lead", content: "Hola" },
    { role: "assistant", content: "¿Buscás casa o depto?" },
    { role: "lead", content: "Casa" },
  ]);
});

test("acota el historial al máximo del contrato", async () => {
  const messages = Array.from({ length: 40 }, (_, index) => ({
    role: index % 2 ? "assistant" : "lead",
    content: `m${index}`,
  }));
  const requests = [];
  const run = makeRunConversationTurn({
    conversationTurnRepository: {
      loadTurn: async () => turn({ messages }),
      saveTurn: async () => {},
    },
    aiGateway: {
      structuredCompletion: async (request) => {
        requests.push(request);
        return response();
      },
    },
    newId: uuid,
    now: () => turnAt,
  });

  await run({ conversationId: "c1", content: "Nuevo" });

  // 40 previos + 1 nuevo se recortan a los últimos 40: cae el más viejo.
  assert.equal(requests[0].messages.length, 40);
  assert.deepEqual(requests[0].messages.at(-1), { role: "lead", content: "Nuevo" });
  assert.equal(requests[0].messages[0].content, "m1");
});

test("devuelve null si la conversación no existe y no llama al gateway", async () => {
  let called = false;
  const run = makeRunConversationTurn({
    conversationTurnRepository: { loadTurn: async () => null },
    aiGateway: {
      structuredCompletion: async () => { called = true; },
    },
  });

  assert.equal(await run({ conversationId: "c1", content: "Hola" }), null);
  assert.equal(called, false);
});

test("propaga el código del gateway sin filtrar detalles internos", async () => {
  const run = makeRunConversationTurn({
    conversationTurnRepository: {
      loadTurn: async () => turn(),
      saveTurn: async () => {},
    },
    aiGateway: {
      structuredCompletion: async () => {
        throw Object.assign(new Error("boom"), { code: "TIMEOUT" });
      },
    },
  });

  await assert.rejects(run({ conversationId: "c1", content: "Hola" }), (error) => {
    assert.ok(error instanceof ConversationTurnError);
    assert.equal(error.code, "TIMEOUT");
    return true;
  });
});

test("rechaza un contexto persistido que no cumple el esquema", async () => {
  const run = makeRunConversationTurn({
    conversationTurnRepository: {
      loadTurn: async () => turn({ context: { foo: 1 } }),
      saveTurn: async () => {},
    },
    aiGateway: { structuredCompletion: async () => response() },
  });

  await assert.rejects(
    run({ conversationId: "c1", content: "Hola" }),
    { code: "INVALID_CONTEXT" },
  );
});

test("rechaza una respuesta inválida del proveedor", async () => {
  const run = makeRunConversationTurn({
    conversationTurnRepository: {
      loadTurn: async () => turn(),
      saveTurn: async () => {},
    },
    aiGateway: { structuredCompletion: async () => ({ data: {} }) },
  });

  await assert.rejects(
    run({ conversationId: "c1", content: "Hola" }),
    { code: "INVALID_PROVIDER_RESPONSE" },
  );
});

test("contextFromLead arma el contexto T4 con las reglas del esquema", () => {
  // Sin datos, las cuatro claves existen con valor nulo.
  assert.deepEqual(contextFromLead({}), {
    contacto: null,
    necesidades: null,
    presupuesto: null,
    urgencia: null,
  });

  // Un solo dato de contacto obliga a enviar los tres campos juntos.
  assert.deepEqual(contextFromLead({ name: "Ana" }), {
    contacto: { nombre: "Ana", email: null, telefono: null },
    necesidades: null,
    presupuesto: null,
    urgencia: null,
  });

  // Un monto de cero sigue siendo un presupuesto válido.
  assert.deepEqual(contextFromLead({ budgetAmount: 0, budgetCurrency: null }), {
    contacto: null,
    necesidades: null,
    presupuesto: { monto: 0, moneda: null },
    urgencia: null,
  });
});

test("los fallos HTTP de disponibilidad y plazo conservan su significado", async () => {
  for (const [status, code] of [[503, "SERVICE_UNAVAILABLE"], [504, "DEADLINE_EXCEEDED"]]) {
    const run = makeRunConversationTurn({
      conversationTurnRepository: { loadTurn: async () => turn(), saveTurn: async () => assert.fail("no guarda errores") },
      aiGateway: { structuredCompletion: async () => { throw Object.assign(new Error(), { code: "HTTP_ERROR", status }); } },
    });
    await assert.rejects(run({ conversationId: "c1", content: "Hola" }), { code });
  }
});

test("no devuelve como exitoso un turno que perdió el control de versión", async () => {
  const run = makeRunConversationTurn({
    conversationTurnRepository: { loadTurn: async () => turn(), saveTurn: async () => null },
    aiGateway: { structuredCompletion: async () => response() },
  });
  await assert.rejects(run({ conversationId: "c1", content: "Hola" }), { code: "TURN_CONFLICT" });
});

test("mantiene los mensajes más recientes sin superar el límite UTF-8 de T4", async () => {
  const history = Array.from({ length: 39 }, (_, index) => ({
    role: index % 2 ? "assistant" : "lead",
    content: String(index) + "🙂".repeat(1900),
  }));
  const content = "Mensaje nuevo, también multibyte: 🙂";
  let request;
  const run = makeRunConversationTurn({
    conversationTurnRepository: { loadTurn: async () => turn({ messages: history }), saveTurn: async () => {} },
    aiGateway: { structuredCompletion: async (payload) => { request = payload; return response(); } },
  });
  await run({ conversationId: "c1", content });

  assert.ok(Buffer.byteLength(JSON.stringify(request), "utf8") <= 100 * 1024);
  assert.ok(request.messages.length > 1 && request.messages.length < 40);
  assert.deepEqual(request.messages, [...history, { role: "lead", content }].slice(-request.messages.length));
});
