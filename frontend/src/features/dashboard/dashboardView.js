export function campaignDistribution(leads, campaignNames) {
  const counts = new Map(Array.from(campaignNames.keys(), (id) => [id, 0]));
  counts.set(null, 0);
  for (const { campaignId } of leads) {
    const id = campaignId || null;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts, ([id, count]) => ({
    id, count, label: id ? campaignNames.get(id) ?? 'Campaña ' + id.slice(0, 8) : 'Sin campaña',
  }));
}

function searchable(value) {
  return value?.normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase() ?? '';
}

export function filterDashboardLeads(leads, campaign, search) {
  const query = searchable(search.trim());
  return leads.filter((lead) => (
    (campaign === null || (campaign === 'none' ? !lead.campaignId : lead.campaignId === campaign)) &&
    (!query || [lead.name, lead.email, lead.phone].some((value) => searchable(value).includes(query)))
  ));
}

export function relativeScoreWidth(score, max) {
  return Number.isFinite(score) && max > 0 ? Math.min(100, Math.max(0, (score / max) * 100)) : 0;
}
