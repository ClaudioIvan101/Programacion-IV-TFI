import { test } from "node:test";
import assert from "node:assert/strict";
import { createPostgresConversationTurnRepository } from "../../src/infra/conversationTurnRepository.js";

// Pool falso: registra las consultas y simula la transacción sobre un cliente.
function fakePool({ conversation = null, messages = [], onClientQuery } = {}) {
  const calls = [];
  const released = { count: 0 };
  const client = {
    queries: [],
    async query(sql, values) {
      client.queries.push({ sql, values });
      if (onClientQuery) return onClientQuery(sql, values);
      if (sql.startsWith("INSERT")) {
        const role = sql.includes("'lead'") ? "lead" : "assistant";
        return {
          rows: [{ id: role, conversationId: values[0], role, content: values[1], createdAt: values[2] }],
        };
      }
      if (sql.startsWith("UPDATE conversations")) {
        return { rows: [{ context: JSON.parse(values[1]) }] };
      }
      return { rows: [] };
    },
    release() { released.count += 1; },
  };

  return {
    calls,
    client,
    released,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("FROM conversations c JOIN leads l")) return { rows: conversation ? [conversation] : [] };
      if (sql.includes("FROM messages")) return { rows: messages };
      return { rows: [] };
    },
    async connect() { return client; },
  };
}

const context = {
  contacto: { nombre: "Ana", email: null, telefono: null },
  necesidades: "Casa",
  presupuesto: null,
  urgencia: null,
};

test("loadTurn devuelve la conversación con su contexto y el historial en orden", async () => {
  const row = {
    id: "c1",
    version: "17",
    leadId: "l1",
    context: null,
    name: "Ana",
    email: null,
    phone: null,
    needs: null,
    budgetAmount: null,
    budgetCurrency: null,
    urgency: null,
  };
  const messages = [
    { role: "lead", content: "a" },
    { role: "assistant", content: "b" },
  ];
  const pool = fakePool({ conversation: row, messages });
  const repository = createPostgresConversationTurnRepository(pool);

  const turn = await repository.loadTurn("c1", { maxMessages: 5 });

  // La conversación y los datos del lead llegan en una sola fila.
  assert.deepEqual(turn, { ...row, messages });
  assert.deepEqual(pool.calls[0].values, ["c1"]);
  // El historial se limita con el máximo que pidió el caso de uso.
  assert.deepEqual(pool.calls[1].values, ["c1", 5]);
});

test("loadTurn devuelve null si la conversación no existe", async () => {
  const pool = fakePool();
  const repository = createPostgresConversationTurnRepository(pool);

  assert.equal(await repository.loadTurn("c1"), null);
  // Sin conversación no se consultan los mensajes.
  assert.equal(pool.calls.length, 1);
});

test("saveTurn persiste ambos mensajes y el contexto en una transacción", async () => {
  const pool = fakePool();
  const repository = createPostgresConversationTurnRepository(pool);
  const turnAt = new Date("2026-01-01T00:00:00.000Z");

  const saved = await repository.saveTurn({
    conversationId: "c1",
    version: "17",
    leadContent: "Hola",
    assistantContent: "¿Zona?",
    context,
    turnAt,
  });

  const statements = pool.client.queries.map(({ sql }) => sql.split(" ")[0]);
  assert.deepEqual(statements, ["BEGIN", "UPDATE", "INSERT", "INSERT", "COMMIT"]);

  const [update, lead, assistant] = pool.client.queries
    .filter(({ sql }) => sql.startsWith("INSERT") || sql.startsWith("UPDATE"));
  // El mensaje del lead usa el instante del turno.
  assert.deepEqual(lead.values, ["c1", "Hola", turnAt]);
  // El del asistente se registra un milisegundo después para ordenar el historial.
  assert.deepEqual(assistant.values, ["c1", "¿Zona?", new Date(turnAt.getTime() + 1)]);
  // El contexto ya viene fusionado por el caso de uso; aquí solo se guarda.
  assert.deepEqual(update.values, ["c1", JSON.stringify(context), "17"]);

  assert.deepEqual(saved, {
    leadMessage: { id: "lead", conversationId: "c1", role: "lead", content: "Hola", createdAt: turnAt },
    assistantMessage: {
      id: "assistant",
      conversationId: "c1",
      role: "assistant",
      content: "¿Zona?",
      createdAt: new Date(turnAt.getTime() + 1),
    },
    context,
  });
  // El cliente siempre vuelve al pool.
  assert.equal(pool.released.count, 1);
});

test("saveTurn revierte la transacción si falla una escritura", async () => {
  const pool = fakePool({
    onClientQuery(sql, values) {
      if (sql.startsWith("UPDATE conversations")) return { rows: [{ context }] };
      if (sql.includes("'assistant'")) throw new Error("fallo de escritura");
      if (sql.startsWith("INSERT")) {
        return { rows: [{ id: "x", conversationId: values[0], role: "lead", content: values[1], createdAt: values[2] }] };
      }
      return { rows: [] };
    },
  });
  const repository = createPostgresConversationTurnRepository(pool);

  await assert.rejects(
    repository.saveTurn({
      conversationId: "c1",
      version: "17",
      leadContent: "Hola",
      assistantContent: "¿Zona?",
      context,
      turnAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
    /fallo de escritura/,
  );

  const statements = pool.client.queries.map(({ sql }) => sql.split(" ")[0]);
  assert.deepEqual(statements, ["BEGIN", "UPDATE", "INSERT", "INSERT", "ROLLBACK"]);
  assert.equal(pool.released.count, 1);
});

test("un turno calculado sobre una versión anterior no guarda mensajes", async () => {
  const pool = fakePool({ onClientQuery: async () => ({ rows: [] }) });
  const repository = createPostgresConversationTurnRepository(pool);
  const saved = await repository.saveTurn({
    conversationId: "c1",
    version: "17",
    leadContent: "Hola",
    assistantContent: "¿Zona?",
    context,
    turnAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(saved, null);
  assert.deepEqual(pool.client.queries.map(({ sql }) => sql.split(" ")[0]), ["BEGIN", "UPDATE", "COMMIT"]);
  assert.deepEqual(pool.client.queries[1].values, ["c1", JSON.stringify(context), "17"]);
  assert.equal(pool.released.count, 1);
});
