const qualificationColumns = 'q.id, q.lead_id AS "leadId", q.rule_set_version AS "ruleSetVersion", q.decision, q.score, q.breakdown, q.created_at AS "createdAt"';
const qualificationFacts = 'l.needs, l.urgency, l.budget_amount::double precision AS "budgetAmount", l.budget_currency AS "budgetCurrency"';

async function inTransaction(pool, execute) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const output = await execute(client);
    await client.query('COMMIT');
    return output;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresQualificationRepository(pool) {
  return {
    async updateLeadFromConversation(leadId, conversationId, merge) {
      return inTransaction(pool, async (client) => {
        // El vínculo y los datos se leen bajo bloqueo antes de combinar y guardar.
        const { rows: [current] } = await client.query(
          `SELECT ${qualificationFacts}
           FROM leads l JOIN conversations c ON c.lead_id = l.id
           WHERE l.id = $1 AND c.id = $2 FOR UPDATE OF l, c`,
          [leadId, conversationId],
        );
        if (!current) return null;
        const next = merge(current);
        // Si el monto no cambió, se conserva el NUMERIC original sin reescribir su aproximación en JS.
        const newBudgetAmount = Object.is(next.budgetAmount, current.budgetAmount) ? null : next.budgetAmount;
        const { rows: [updated] } = await client.query(
          `UPDATE leads AS l SET needs = $2, urgency = $3, budget_amount = COALESCE($4, l.budget_amount), budget_currency = $5
           WHERE l.id = $1 RETURNING l.id, ${qualificationFacts}`,
          [leadId, next.needs, next.urgency, newBudgetAmount, next.budgetCurrency],
        );
        return updated;
      });
    },

    async createRuleSet({ threshold, rules }) {
      // Una publicación nueva siempre inserta; no existe una operación de edición.
      const { rows: [record] } = await pool.query(
        `INSERT INTO lead_scoring_rule_sets (threshold, rules) VALUES ($1, $2::jsonb)
         RETURNING version, threshold, rules, created_at AS "createdAt"`,
        [threshold, JSON.stringify(rules)],
      );
      return record;
    },

    async recordQualification(leadId, ruleSetVersion, evaluate) {
      return inTransaction(pool, async (client) => {
        // El mismo lead queda protegido contra un cambio de datos hasta guardar la calificación.
        const { rows: [lead] } = await client.query(
          `SELECT ${qualificationFacts} FROM leads l WHERE l.id = $1 FOR SHARE OF l`,
          [leadId],
        );
        if (!lead) return null;

        const { rows: [ruleSet] } = await client.query(
          'SELECT threshold, rules FROM lead_scoring_rule_sets WHERE version = $1',
          [ruleSetVersion],
        );
        if (!ruleSet) return null;

        const { decision, score, breakdown } = evaluate(lead, ruleSet);
        const { rows: [record] } = await client.query(
          `INSERT INTO lead_qualifications AS q (lead_id, rule_set_version, decision, score, breakdown)
           VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING ${qualificationColumns}`,
          [leadId, ruleSetVersion, decision, score, JSON.stringify(breakdown)],
        );
        return record;
      });
    },

    async listQualifications(leadId) {
      // El LEFT JOIN distingue un lead ausente de un historial todavía vacío.
      const { rows } = await pool.query(
        `SELECT ${qualificationColumns} FROM leads l
         LEFT JOIN lead_qualifications q ON q.lead_id = l.id
         WHERE l.id = $1 ORDER BY q.created_at DESC, q.id DESC`,
        [leadId],
      );
      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },
  };
}
