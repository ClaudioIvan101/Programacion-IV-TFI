const leadColumns = `id, name, email, phone, campaign_id AS "campaignId", channel,
  form_id AS "formId", needs, budget_amount::double precision AS "budgetAmount",
  budget_currency AS "budgetCurrency", urgency, status, created_at AS "createdAt"`;
const conversationColumns = 'c.id, c.lead_id AS "leadId", c.created_at AS "createdAt"';
const messageColumns = 'm.id, m.conversation_id AS "conversationId", m.role, m.content, m.created_at AS "createdAt"';
const originForeignKeys = new Set([
  'leads_campaign_id_fkey', 'leads_form_id_fkey', 'leads_campaign_id_channel_fkey',
]);

export function createPostgresLeadRepository(db) {
  return {
    async createLead({ name, email, phone, campaignId, channel, formId, needs, budgetAmount, budgetCurrency, urgency }) {
      try {
        // Si se informan ambos IDs, comprobamos y bloqueamos el formulario durante el alta.
        // El INSERT conserva la campaña que envió el cliente, incluso cuando es null.
        const { rows } = await db.query(
          `INSERT INTO leads (name, email, phone, campaign_id, channel, form_id, needs, budget_amount, budget_currency, urgency)
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
           WHERE $4::uuid IS NULL OR $6::uuid IS NULL OR EXISTS (
             SELECT 1 FROM forms WHERE id = $6 AND campaign_id = $4 FOR SHARE
           )
           RETURNING ${leadColumns}`,
          [name, email, phone, campaignId, channel, formId, needs, budgetAmount, budgetCurrency, urgency],
        );
        return rows[0] ?? null;
      } catch (error) {
        if (error.code === '23503' && originForeignKeys.has(error.constraint)) return null;
        throw error;
      }
    },
    async listLeads() {
      return (await db.query(`SELECT ${leadColumns} FROM leads ORDER BY created_at, id`)).rows;
    },
    async getLead(id) {
      return (await db.query(`SELECT ${leadColumns} FROM leads WHERE id = $1`, [id])).rows[0] ?? null;
    },
    async createConversation(leadId) {
      try {
        const { rows } = await db.query(
          `INSERT INTO conversations AS c (lead_id) VALUES ($1) RETURNING ${conversationColumns}`,
          [leadId],
        );
        return rows[0];
      } catch (error) {
        if (error.code === '23503' && error.constraint === 'conversations_lead_id_fkey') return null;
        throw error;
      }
    },
    async listConversations(leadId) {
      // El LEFT JOIN distingue un lead sin conversaciones de un lead inexistente.
      const { rows } = await db.query(
        `SELECT ${conversationColumns} FROM leads l
         LEFT JOIN conversations c ON c.lead_id = l.id
         WHERE l.id = $1 ORDER BY c.created_at, c.id`,
        [leadId],
      );
      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },
    async getConversation(id) {
      return (await db.query(`SELECT ${conversationColumns} FROM conversations c WHERE c.id = $1`, [id])).rows[0] ?? null;
    },
    async createMessage(conversationId, { role, content }) {
      try {
        const { rows } = await db.query(
          `INSERT INTO messages AS m (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING ${messageColumns}`,
          [conversationId, role, content],
        );
        return rows[0];
      } catch (error) {
        if (error.code === '23503' && error.constraint === 'messages_conversation_id_fkey') return null;
        throw error;
      }
    },
    async listMessages(conversationId) {
      // Usamos el ID para desempatar mensajes con la misma fecha de creación.
      const { rows } = await db.query(
        `SELECT ${messageColumns} FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.id = $1 ORDER BY m.created_at, m.id`,
        [conversationId],
      );
      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },
    async getMessage(conversationId, messageId) {
      const { rows } = await db.query(
        `SELECT ${messageColumns} FROM messages m WHERE m.conversation_id = $1 AND m.id = $2`,
        [conversationId, messageId],
      );
      return rows[0] ?? null;
    },
  };
}
