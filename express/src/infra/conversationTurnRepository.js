import { inTransaction } from "./transaction.js";

// Datos del lead que alimentan el contexto inicial de la conversación.
const leadFacts = `l.name, l.email, l.phone, l.needs,
  l.budget_amount::double precision AS "budgetAmount",
  l.budget_currency AS "budgetCurrency", l.urgency`;

const conversationColumns = 'c.id, c.lead_id AS "leadId", c.context, c.xmin::text AS version';

export function createPostgresConversationTurnRepository(pool) {
  return {
    async loadTurn(conversationId, { maxMessages = 40 } = {}) {
      // La conversación trae su contexto y los datos del lead para poder
      // inicializarlo en el primer turno.
      const { rows: [conversation] } = await pool.query(
        `SELECT ${conversationColumns}, ${leadFacts}
         FROM conversations c JOIN leads l ON l.id = c.lead_id
         WHERE c.id = $1`,
        [conversationId],
      );
      if (!conversation) return null;

      // Se piden los últimos N mensajes y se devuelven en orden cronológico:
      // la subconsulta ordena al revés para poder limitar, la externa lo corrige.
      const { rows: messages } = await pool.query(
        `SELECT role, content FROM (
           SELECT role, content, created_at, id
           FROM messages
           WHERE conversation_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2
         ) AS recent
         ORDER BY created_at, id`,
        [conversationId, maxMessages],
      );

      return { ...conversation, messages };
    },

    async saveTurn({ conversationId, version, leadContent, assistantContent, context, turnAt, turnResult }) {
      // La respuesta del asistente se registra un milisegundo después del
      // mensaje del lead. `created_at` usa la hora de inicio de la transacción,
      // así que sin separarlas el orden del historial quedaría ambiguo.
      const assistantAt = new Date(turnAt.getTime() + 1);

      return inTransaction(pool, async (client) => {
        // xmin cambia si otro turno guarda primero. Solo se bloquea la fila durante
        // la escritura, nunca mientras se espera al gateway.
        const { rows: [updated] } = await client.query(
          `UPDATE conversations SET context = $2::jsonb
           WHERE id = $1 AND xmin::text = $3
           RETURNING context`,
          [conversationId, JSON.stringify(context), version],
        );
        if (!updated) return null;
        const { rows: [leadMessage] } = await client.query(
          `INSERT INTO messages (conversation_id, role, content, created_at)
           VALUES ($1, 'lead', $2, $3)
           RETURNING id, conversation_id AS "conversationId", role, content, created_at AS "createdAt"`,
          [conversationId, leadContent, turnAt],
        );

        const { rows: [assistantMessage] } = await client.query(
          `INSERT INTO messages (conversation_id, role, content, created_at, turn_result)
           VALUES ($1, 'assistant', $2, $3, $4::jsonb)
           RETURNING id, conversation_id AS "conversationId", role, content, created_at AS "createdAt"`,
          [conversationId, assistantContent, assistantAt, JSON.stringify(turnResult)],
        );

        return {
          leadMessage,
          assistantMessage,
          context: updated.context,
        };
      });
    },
  };
}
