import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../../src/app.js";
import { ConversationTurnError } from "../../src/domain/ai/runConversationTurn.js";

const conversationId = "11111111-1111-4111-8111-111111111111";
const missingId = "22222222-2222-4222-8222-222222222222";

// Respuesta de ejemplo del caso de uso; solo importa la forma HTTP.
const result = {
  assistantMessage: "¿En qué zona buscás?",
  nextQuestionKey: "presupuesto",
  missingFields: ["presupuesto"],
  context: { contacto: null, necesidades: null, presupuesto: null, urgencia: null },
  needsBudgetCurrencyClarification: true,
};

let server;
let baseUrl;
let handler;
const authenticate = async (authorization) => ({
  "Bearer test-administrator": { status: "active", role: "administrador" },
  "Bearer test-seller": { status: "active", role: "vendedor" },
  "Bearer test-inactive": { status: "inactive", role: "administrador" },
})[authorization] ?? null;
const adminHeaders = { "Content-Type": "application/json", Authorization: "Bearer test-administrator" };

before(async () => {
  const app = createApp({
    leads: {
      // Sustituimos el caso de uso para probar únicamente el contrato HTTP.
      authenticate,
      runConversationTurn: (input) => handler(input),
    },
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function postTurn(conversation = conversationId, body = { content: "Hola" }, authorization = adminHeaders.Authorization) {
  return fetch(`${baseUrl}/conversations/${conversation}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization && { Authorization: authorization }) },
    body: JSON.stringify(body),
  });
}

test("un turno válido responde 200 con la próxima pregunta", async () => {
  let received;
  handler = async (input) => { received = input; return result; };

  const response = await postTurn();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  // La ruta entrega solo la conversación y el texto nuevo al caso de uso.
  assert.deepEqual(received, { conversationId, content: "Hola" });
});

test("el turno exige un JWT de administrador activo antes de usar datos del lead", async () => {
  let calls = 0;
  handler = async () => { calls++; return result; };
  const unauthenticated = await postTurn(conversationId, { content: "Hola" }, null);
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("www-authenticate"), "Bearer");
  for (const credential of ["Bearer test-seller", "Bearer test-inactive"]) {
    assert.equal((await postTurn(conversationId, { content: "Hola" }, credential)).status, 403);
  }
  assert.equal(calls, 0);
});

test("una conversación inexistente responde 404", async () => {
  handler = async () => null;

  const response = await postTurn(missingId);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Conversación no encontrada." });
});

test("sin gateway configurado responde 503 sin llamar al caso de uso", async () => {
  // La app se arma con la operación ausente, como en un despliegue sin IA.
  const local = createApp({ leads: { authenticate, runConversationTurn: null } }).listen(0, "127.0.0.1");
  await once(local, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${local.address().port}/conversations/${conversationId}/turn`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ content: "Hola" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Asistente no disponible." });
  } finally {
    await new Promise((resolve, reject) => local.close((error) => error ? reject(error) : resolve()));
  }
});

test("rechaza un cuerpo vacío, incompleto o con campos extra", async () => {
  handler = async () => result;

  for (const body of [{ content: "" }, { content: "   " }, { content: "Hola", extra: true }, {}]) {
    const response = await postTurn(conversationId, body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
});

test("rechaza un identificador de conversación inválido", async () => {
  handler = async () => result;

  const response = await postTurn("no-es-uuid");

  assert.equal(response.status, 400);
});

test("rechaza parámetros de consulta adicionales", async () => {
  handler = async () => result;

  const response = await fetch(`${baseUrl}/conversations/${conversationId}/turn?extra=1`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ content: "Hola" }),
  });

  assert.equal(response.status, 400);
});

test("exige que el cuerpo sea application/json", async () => {
  handler = async () => result;

  const response = await fetch(`${baseUrl}/conversations/${conversationId}/turn`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "text/plain" },
    body: "Hola",
  });

  assert.equal(response.status, 415);
});

test("traduce los fallos del caso de uso a estados HTTP", async () => {
  // Un código desconocido no debe disfrazarse de éxito ni de error del cliente.
  for (const [code, status] of [
    ["TIMEOUT", 504],
    ["DEADLINE_EXCEEDED", 504],
    ["CONFIG", 503],
    ["CREDENTIALS", 503],
    ["TRANSPORT", 503],
    ["SERVICE_UNAVAILABLE", 503],
    ["INVALID_PROVIDER_RESPONSE", 502],
    ["INVALID_RESPONSE", 502],
    ["HTTP_ERROR", 502],
    ["TURN_CONFLICT", 409],
    ["INVALID_CONTEXT", 500],
  ]) {
    handler = async () => { throw new ConversationTurnError(code); };
    const response = await postTurn();
    assert.equal(response.status, status, code);
    assert.deepEqual(await response.json(), { error: "No se pudo completar el turno." });
  }
});
