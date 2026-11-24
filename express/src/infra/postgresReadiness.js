// Nombres registrados por node-pg-migrate, sin la extensión .sql.
export const REQUIRED_MIGRATIONS = Object.freeze([
  '001_create_campaigns',
  '002_expand_campaigns',
  '003_create_users',
  '004_create_capture_sources',
  '005_create_leads_conversations_messages',
  '006_create_lead_qualifications',
  '007_add_conversation_context',
  '008_create_lead_assignments',
]);

export function createPostgresReadiness(pool, { timeoutMs = 1500, cacheMs = 1000 } = {}) {
  let pending;
  let cached;
  let expiresAt = 0;

  async function probe() {
    let timer;
    try {
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
      const query = Promise.resolve().then(() => pool.query({
        text: 'SELECT COUNT(DISTINCT name)::int AS total FROM public.pgmigrations WHERE name = ANY($1::text[])',
        values: [REQUIRED_MIGRATIONS],
        query_timeout: timeoutMs,
      })).then((result) => result.rows[0]?.total === REQUIRED_MIGRATIONS.length, () => false);
      return await Promise.race([query, timeout]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  return function checkReadiness() {
    if (pending) return pending;
    if (performance.now() < expiresAt) return Promise.resolve(cached);
    pending = probe().then((ready) => {
      cached = ready;
      expiresAt = performance.now() + cacheMs;
      return ready;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
