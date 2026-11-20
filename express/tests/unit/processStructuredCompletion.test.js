import assert from "node:assert/strict";
import test from "node:test";
import { processStructuredCompletion } from "../../src/domain/ai/processStructuredCompletion.js";

const previous = {
  contacto: { nombre: "Ana", email: "ana@example.invalid", telefono: "555" },
  necesidades: "Vivienda",
  presupuesto: { monto: 80000, moneda: "USD" },
  urgencia: "Este mes",
};
const example = () => ({
  data: {
    assistant_message: "¿El presupuesto está en ARS o USD?",
    extracted_data: {
      contacto: null,
      necesidades: "Asesoramiento inmobiliario",
      presupuesto: { monto: 100000, moneda: null },
      urgencia: null,
    },
    summary: "Moneda pendiente.",
    next_question_key: "presupuesto",
    missing_fields: ["contacto", "presupuesto", "urgencia"],
  },
  usage: { input_tokens: 0, output_tokens: 0 },
  model: "test",
  latency_ms: 0,
});

test("valida la respuesta T4 y conserva los grupos previamente conocidos", () => {
  const complete = example();
  complete.data = { ...complete.data, extracted_data: previous, next_question_key: null, missing_fields: [] };
  assert.deepEqual(processStructuredCompletion(complete, previous), {
    ok: true,
    response: complete,
    context: previous,
    needsBudgetCurrencyClarification: false,
  });

  const response = example();
  response.data.extracted_data.presupuesto = null;
  const result = processStructuredCompletion(response, previous);
  assert.deepEqual(result.context, {
    ...previous,
    necesidades: "Asesoramiento inmobiliario",
  });
  assert.equal(result.needsBudgetCurrencyClarification, false);
});

test("conserva los campos de contacto individualmente y asocia moneda solo al mismo monto", () => {
  const snapshot = structuredClone(previous);
  const response = example();
  response.data.extracted_data.contacto = { nombre: null, email: null, telefono: "12345" };
  for (const [monto, moneda, expected, clarify] of [
    [80000, null, "USD", false],
    [100000, null, null, true],
    [0, null, null, true],
    [100000, "ARS", "ARS", false],
  ]) {
    response.data.extracted_data.presupuesto = { monto, moneda };
    const result = processStructuredCompletion(response, previous);
    assert.deepEqual(result.context.contacto, { ...previous.contacto, telefono: "12345" });
    assert.deepEqual(result.context.presupuesto, { monto, moneda: expected });
    assert.equal(result.needsBudgetCurrencyClarification, clarify);
  }
  assert.deepEqual(previous, snapshot);
  const noBudget = { ...previous, presupuesto: null };
  assert.equal(processStructuredCompletion(example(), noBudget).needsBudgetCurrencyClarification, true);
});

test("rechaza respuestas inválidas con un error estable y sin datos del proveedor", () => {
  const invalid = { ok: false, code: "INVALID_PROVIDER_RESPONSE" };
  const wrongBudget = example();
  wrongBudget.data.extracted_data.presupuesto.monto = "100000";
  assert.deepEqual(processStructuredCompletion(wrongBudget, previous), invalid);
  for (const fields of [
    { score: 100 },
    { next_question_key: "necesidades" },
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ]) {
    const response = example();
    response.data = { ...response.data, ...fields };
    assert.deepEqual(processStructuredCompletion(response, previous), invalid);
  }
});
