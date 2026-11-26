import { inTransaction } from './transaction.js';

const qualificationColumns = 'q.id, q.lead_id AS "leadId", q.rule_set_version AS "ruleSetVersion", q.decision, q.score, q.breakdown, q.created_at AS "createdAt"';
const qualificationFacts = `l.email, l.phone, l.needs, l.urgency, l.zone, l.financing,
  l.custom_checks AS "customChecks",
  l.budget_amount::double precision AS "budgetAmount", l.budget_currency AS "budgetCurrency"`;
const ruleSetColumns = 'version, name, status, threshold, discard_threshold AS "discardThreshold", rules, created_at AS "createdAt"';

export function createPostgresQualificationRepository(pool) {
  async function applyLeadUpdate(client, leadId, current, merge) {
    const next = merge(current);
    // Si el monto no cambió, se conserva el NUMERIC original sin reescribir su aproximación en JS.
    const newBudgetAmount = Object.is(next.budgetAmount, current.budgetAmount) ? null : next.budgetAmount;
    const { rows: [updated] } = await client.query(
      `UPDATE leads AS l
       SET needs = $2, urgency = $3, zone = $4, financing = $5,
           custom_checks = $6::jsonb, budget_amount = COALESCE($7, l.budget_amount),
           budget_currency = $8
       WHERE l.id = $1 RETURNING l.id, ${qualificationFacts}`,
      [
        leadId,
        next.needs,
        next.urgency,
        next.zone ?? null,
        next.financing ?? null,
        JSON.stringify(next.customChecks ?? {}),
        newBudgetAmount,
        next.budgetCurrency,
      ],
    );
    return updated;
  }

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
        return applyLeadUpdate(client, leadId, current, merge);
      });
    },

    async updateLead(leadId, merge) {
      return inTransaction(pool, async (client) => {
        const { rows: [current] } = await client.query(
          `SELECT ${qualificationFacts} FROM leads l WHERE l.id = $1 FOR UPDATE OF l`,
          [leadId],
        );
        if (!current) return null;
        return applyLeadUpdate(client, leadId, current, merge);
      });
    },

    async createRuleSet({ threshold, discardThreshold = null, name = null, status = 'active', rules }) {
      // Una publicación nueva siempre inserta; no existe una operación de edición in-place.
      return inTransaction(pool, async (client) => {
        if (status === 'active') {
          await client.query(`UPDATE lead_scoring_rule_sets SET status = 'archived' WHERE status = 'active'`);
        }
        const { rows: [record] } = await client.query(
          `INSERT INTO lead_scoring_rule_sets (threshold, discard_threshold, name, status, rules)
           VALUES ($1, $2, COALESCE($3, 'Regla personalizada'), $4, $5::jsonb)
           RETURNING ${ruleSetColumns}`,
          [threshold, discardThreshold, name, status, JSON.stringify(rules)],
        );
        return record;
      });
    },

    async listRuleSets() {
      const { rows } = await pool.query(
        `SELECT ${ruleSetColumns}
         FROM lead_scoring_rule_sets
         ORDER BY version DESC`,
      );
      return rows;
    },

    async activateRuleSet(version) {
      return inTransaction(pool, async (client) => {
        const { rows: [existing] } = await client.query(
          'SELECT version FROM lead_scoring_rule_sets WHERE version = $1 FOR UPDATE',
          [version],
        );
        if (!existing) return null;
        await client.query(
          `UPDATE lead_scoring_rule_sets SET status = 'archived' WHERE status = 'active' AND version <> $1`,
          [version],
        );
        const { rows: [activated] } = await client.query(
          `UPDATE lead_scoring_rule_sets SET status = 'active' WHERE version = $1 RETURNING ${ruleSetColumns}`,
          [version],
        );
        return activated;
      });
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
          'SELECT threshold, discard_threshold AS "discardThreshold", rules FROM lead_scoring_rule_sets WHERE version = $1',
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
