import { z } from "zod";

const text = (max) => z.string().refine(
  (value) => /\S/u.test(value) && value.isWellFormed() && !value.includes("\0") && [...value].length <= max,
);
const field = z.enum(["contacto", "necesidades", "presupuesto", "urgencia"]);

// Los objetos cerrados permiten solo los campos que define T4.
const leadData = z.strictObject({
  contacto: z.strictObject({
    nombre: text(120).nullable(),
    email: text(254).refine((value) => /^[^@\s]+@[^@\s]+$/u.test(value)).nullable(),
    telefono: text(40).nullable(),
  }).nullable(),
  necesidades: text(2000).nullable(),
  presupuesto: z.strictObject({
    monto: z.number().min(0).max(1_000_000_000_000),
    moneda: z.enum(["ARS", "USD"]).nullable(),
  }).nullable(),
  urgencia: text(300).nullable(),
});
const responseSchema = z.strictObject({
  data: z.strictObject({
    assistant_message: text(2000),
    extracted_data: leadData,
    summary: text(2000),
    next_question_key: field.nullable(),
    missing_fields: z.array(field).max(4).refine((fields) => new Set(fields).size === fields.length),
  }).refine((data) =>
    (data.next_question_key === null || data.missing_fields.includes(data.next_question_key)) &&
    (data.extracted_data.presupuesto?.moneda !== null || data.missing_fields.includes("presupuesto")),
  ),
  usage: z.strictObject({
    input_tokens: z.int().nonnegative(),
    output_tokens: z.int().nonnegative(),
  }),
  model: text(100),
  latency_ms: z.int().min(0).max(15000),
});

export function processStructuredCompletion(responseBody, previousContext) {
  // 1. Valida la respuesta con Zod antes de combinar los datos.
  const result = responseSchema.safeParse(responseBody);
  if (!result.success) {
    return { ok: false, code: "INVALID_PROVIDER_RESPONSE" };
  }
  const previous = leadData.parse(previousContext);
  const response = result.data;
  const extracted = response.data.extracted_data;
  const contact = extracted.contacto;

  // 2. Si un campo del contacto llega en null, conserva el valor anterior.
  const contacto = contact === null ? previous.contacto : {
    nombre: contact.nombre ?? previous.contacto?.nombre ?? null,
    email: contact.email ?? previous.contacto?.email ?? null,
    telefono: contact.telefono ?? previous.contacto?.telefono ?? null,
  };

  const budget = extracted.presupuesto;
  // 3. Si cambia el monto y no llega una moneda, la deja pendiente.
  const presupuesto = budget === null ? previous.presupuesto : {
    monto: budget.monto,
    moneda: budget.moneda ?? (budget.monto === previous.presupuesto?.monto ? previous.presupuesto.moneda : null),
  };
  // 4. Devuelve el contexto actualizado e indica si hay que aclarar la moneda.
  return {
    ok: true,
    response,
    context: {
      contacto,
      necesidades: extracted.necesidades ?? previous.necesidades,
      presupuesto,
      urgencia: extracted.urgencia ?? previous.urgencia,
    },
    needsBudgetCurrencyClarification: presupuesto?.moneda === null,
  };
}
