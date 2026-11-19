import { CampaignNotFoundError, DuplicateChannelError } from '../domain/capture/errors.js';

export function createPostgresCaptureRepository(pool) {
  return {
    async addCampaignChannel(campaignId, channel) {
      try {
        const result = await pool.query(
          'INSERT INTO campaign_channels (campaign_id, channel) VALUES ($1, $2) RETURNING campaign_id AS "campaignId", channel',
          [campaignId, channel],
        );
        return result.rows[0];
      } catch (error) {
        if (error.code === '23503' && error.constraint === 'campaign_channels_campaign_id_fkey') throw new CampaignNotFoundError();
        if (error.code === '23505' && error.constraint === 'campaign_channels_unique') throw new DuplicateChannelError();
        throw error;
      }
    },
    async listCampaignChannels(campaignId) {
      const result = await pool.query(
        'SELECT cc.channel FROM campaigns c LEFT JOIN campaign_channels cc ON cc.campaign_id = c.id WHERE c.id = $1 ORDER BY cc.channel',
        [campaignId],
      );
      return result.rows.length ? result.rows.filter((row) => row.channel !== null).map((row) => row.channel) : null;
    },
    async createForm({ name, campaignId }) {
      try {
        const result = await pool.query(
          'INSERT INTO forms (name, campaign_id) VALUES ($1, $2) RETURNING id, name, campaign_id AS "campaignId", created_at AS "createdAt"',
          [name, campaignId],
        );
        return result.rows[0];
      } catch (error) {
        if (error.code === '23503' && error.constraint === 'forms_campaign_id_fkey') throw new CampaignNotFoundError();
        throw error;
      }
    },
    async getFormById(id) {
      const result = await pool.query('SELECT id, name, campaign_id AS "campaignId", created_at AS "createdAt" FROM forms WHERE id = $1', [id]);
      return result.rows[0] ?? null;
    },
  };
}
