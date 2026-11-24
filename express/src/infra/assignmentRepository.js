import { inTransaction } from './transaction.js';

const columns = `a.id, a.lead_id AS "leadId", l.name AS "leadName", l.email AS "leadEmail",
  l.phone AS "leadPhone", l.needs, c.name AS "campaignName", a.seller_id AS "sellerId",
  u.name AS "sellerName", q.score, q.rule_set_version AS "ruleSetVersion",
  a.qualification_id AS "qualificationId", a.assigned_at AS "assignedAt",
  a.first_contact_at AS "firstContactAt",
  floor(extract(epoch FROM a.first_contact_at - a.assigned_at))::double precision AS "responseSeconds",
  a.notification_status AS "notificationStatus", a.notification_attempts AS attempts,
  a.notification_sent_at AS "notificationSentAt"`;

const joins = `JOIN leads l ON l.id = a.lead_id
  JOIN users u ON u.id = a.seller_id
  JOIN lead_qualifications q ON q.id = a.qualification_id
  LEFT JOIN campaigns c ON c.id = l.campaign_id`;

const qualificationOrder = 'ORDER BY created_at DESC, id DESC LIMIT 1';

export function createPostgresAssignmentRepository(db) {
  async function get(id, connection = db) {
    const { rows } = await connection.query(`SELECT ${columns} FROM lead_assignments a ${joins} WHERE a.id = $1`, [id]);
    return rows[0] ?? null;
  }

  return {
    get,
    async list(sellerId) {
      const { rows } = await db.query(`SELECT ${columns} FROM lead_assignments a ${joins}
        WHERE ($1::uuid IS NULL OR a.seller_id = $1) ORDER BY a.assigned_at DESC, a.id`, [sellerId]);
      return rows;
    },
    async eligible() {
      const [leads, sellers] = await Promise.all([
        db.query(`SELECT l.id, l.name, l.email, l.phone, q.score
          FROM leads l
          JOIN LATERAL (SELECT decision, score FROM lead_qualifications
            WHERE lead_id = l.id ${qualificationOrder}) q ON q.decision = 'qualified'
          WHERE l.status <> 'cerrado' AND NOT EXISTS (SELECT 1 FROM lead_assignments a WHERE a.lead_id = l.id)
          ORDER BY l.created_at DESC, l.id`),
        db.query("SELECT id, name FROM users WHERE role = 'vendedor' AND status = 'active' ORDER BY name, id"),
      ]);
      return { leads: leads.rows, sellers: sellers.rows };
    },
    async assign({ leadId, sellerId, assignedBy }) {
      return inTransaction(db, async (client) => {
        // El bloqueo de la fila y la restricción UNIQUE impiden dos asignaciones al mismo interesado.
        const lead = (await client.query('SELECT status FROM leads WHERE id = $1 FOR UPDATE', [leadId])).rows[0];
        if (!lead) return { kind: 'not_found' };
        const previous = (await client.query('SELECT id, seller_id AS "sellerId" FROM lead_assignments WHERE lead_id = $1', [leadId])).rows[0];
        if (previous) return { kind: 'existing', row: await get(previous.id, client) };
        const qualification = (await client.query(`SELECT id, decision FROM lead_qualifications
          WHERE lead_id = $1 ${qualificationOrder}`, [leadId])).rows[0];
        if (lead.status === 'cerrado' || qualification?.decision !== 'qualified') return { kind: 'not_qualified' };
        const seller = (await client.query("SELECT id FROM users WHERE id = $1 AND role = 'vendedor' AND status = 'active' FOR SHARE", [sellerId])).rows[0];
        if (!seller) return { kind: 'invalid_seller' };
        const { rows: [row] } = await client.query(`INSERT INTO lead_assignments (lead_id, seller_id, assigned_by, qualification_id)
          VALUES ($1, $2, $3, $4) RETURNING id`, [leadId, sellerId, assignedBy, qualification.id]);
        await client.query("UPDATE leads SET status = 'asignado' WHERE id = $1", [leadId]);
        return { kind: 'created', row };
      });
    },
    async claim(id) {
      const { rows } = await db.query(`WITH claimed AS (
        UPDATE lead_assignments SET notification_status = 'sending', notification_attempts = notification_attempts + 1
        WHERE id = $1 AND notification_status IN ('pending', 'failed') AND notification_attempts < 3
          AND EXISTS (SELECT 1 FROM users WHERE id = seller_id AND role = 'vendedor' AND status = 'active')
        RETURNING *
      ) SELECT ${columns}, u.email AS "sellerEmail" FROM claimed a ${joins}`, [id]);
      return rows[0] ?? null;
    },
    async settle(id, status) {
      await db.query(`UPDATE lead_assignments SET notification_status = $2,
        notification_sent_at = CASE WHEN $2 = 'sent' THEN clock_timestamp() ELSE NULL END
        WHERE id = $1 AND notification_status = 'sending'`, [id, status]);
    },
    async recordFirstContact(id, sellerId) {
      const { rows } = await db.query(`WITH recorded AS (
        UPDATE lead_assignments SET first_contact_at = COALESCE(first_contact_at, greatest(assigned_at, clock_timestamp()))
        WHERE id = $1 AND seller_id = $2 RETURNING *
      ) SELECT ${columns} FROM recorded a ${joins}`, [id, sellerId]);
      return rows[0] ?? null;
    },
  };
}
