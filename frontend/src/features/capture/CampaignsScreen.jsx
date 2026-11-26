import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Group, Loader, Paper, Select, Stack, Table, Text, Textarea, TextInput, Title,
} from '@mantine/core';
import { dashboardApi, loadLeadOverview } from '../dashboard/dashboardApi.js';
import { channelOptions, createCaptureApi } from './captureApi.js';
import { CampaignPager, CaptureRequestState, useCampaignPage } from './campaignPage.jsx';
import './capture.css';

const statuses = {
  draft: ['Borrador', 'neutral'],
  active: ['Activa', 'green'],
  paused: ['Pausada', 'yellow'],
  completed: ['Completada', 'neutral'],
};

const channelLabel = (value) => channelOptions.find((option) => option.value === value)?.label ?? value;
const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' });

export function CampaignsScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const leadsApi = useMemo(() => dashboardApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const { result, page, setPage, refresh } = useCampaignPage(api);

  const [overview, setOverview] = useState(null);
  const [channelsByCampaign, setChannelsByCampaign] = useState({});
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [status, setStatus] = useState('active');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    loadLeadOverview(leadsApi, controller.signal).then((data) => {
      if (!controller.signal.aborted) setOverview(data);
    }).catch(() => {
      if (!controller.signal.aborted) setOverview(null);
    });
    return () => controller.abort();
  }, [leadsApi, result?.revision]);

  useEffect(() => {
    const items = result?.data?.items;
    if (!items?.length) return undefined;
    const controller = new AbortController();
    Promise.allSettled(
      items.map(async (campaign) => [campaign.id, await api.listChannels(campaign.id, controller.signal)]),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      const next = {};
      for (const entry of entries) {
        if (entry.status === 'fulfilled') next[entry.value[0]] = entry.value[1];
      }
      setChannelsByCampaign((current) => ({ ...current, ...next }));
    });
    return () => controller.abort();
  }, [api, result?.data?.items]);

  async function create(event) {
    event.preventDefault();
    if (sending) return;
    const trimmedName = name.trim();
    const trimmedObjective = objective.trim();
    if (!trimmedName || !trimmedObjective) {
      setError('Completá el nombre y el objetivo de la campaña.');
      return;
    }
    setSending(true);
    setError('');
    setCreated('');
    try {
      const campaign = await api.createCampaign({
        name: trimmedName,
        objective: trimmedObjective,
        status,
      });
      setCreated(campaign.name);
      setName('');
      setObjective('');
      setStatus('active');
      setPage(1);
      refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSending(false);
    }
  }

  const allLeads = overview?.leads ?? [];
  const canReadQualifications = overview?.counts?.qualified !== null && overview !== null;
  const totalPages = result?.data ? Math.max(1, Math.ceil(result.data.total / 20)) : 1;

  const organicLeads = allLeads.filter((lead) => !lead.campaignId);
  const organicQualified = organicLeads.filter((lead) => lead.decision === 'qualified').length;
  const formCount = allLeads.filter((lead) => lead.channel === 'form').length;
  const messagingCount = allLeads.filter((lead) => lead.channel === 'simulated_messaging').length;
  const unknownChannelCount = allLeads.filter((lead) => !lead.channel).length;

  return (
    <Stack gap="md">
      <header>
        <Text className="auth-label" size="xs" fw={700}>ORIGEN Y RENDIMIENTO</Text>
        <Title order={1}>Campañas</Title>
        <Text c="dimmed" size="sm" mt={4}>
          Consultá de dónde llegan los interesados, qué canales tiene habilitados cada campaña y cuántos califican.
        </Text>
      </header>

      {created && <Alert color="green" role="status">Campaña "{created}" creada.</Alert>}

      <div className="capture-main-grid">
        <Paper className="capture-card capture-table-card" withBorder>
          <div className="capture-card-head">
            <div>
              <Title order={2} size="h4">Campañas de captación</Title>
              <Text size="xs" c="dimmed" className="capture-mono" mt={2}>
                {result?.data ? `${result.data.total} campañas · Página ${page} de ${totalPages}` : 'Cargando…'}
              </Text>
            </div>
            {result?.data && (
              <Group gap="xs">
                <Button variant="default" size="compact-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button variant="default" size="compact-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Siguiente
                </Button>
              </Group>
            )}
          </div>

          <div style={{ padding: result?.data ? 0 : '1rem 1.25rem' }}>
            <CaptureRequestState result={result} />
          </div>

          {result?.data && (
            <>
              {result.data.items.length === 0 ? (
                <Text c="dimmed" size="sm" ta="center" py="lg">Todavía no hay campañas registradas.</Text>
              ) : (
                <Table.ScrollContainer minWidth={720}>
                  <Table className="dashboard-inbox-table" verticalSpacing="sm" highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Campaña</Table.Th>
                        <Table.Th>Canales</Table.Th>
                        <Table.Th>Estado</Table.Th>
                        <Table.Th>Recibidos</Table.Th>
                        <Table.Th>Calificados</Table.Th>
                        <Table.Th>Fecha</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {result.data.items.map((campaign) => {
                        const [statusLabel, tone] = statuses[campaign.status] ?? [campaign.status, 'neutral'];
                        const campaignLeads = allLeads.filter((lead) => lead.campaignId === campaign.id);
                        const campaignQualified = campaignLeads.filter((lead) => lead.decision === 'qualified').length;
                        const campaignChannels = channelsByCampaign[campaign.id];

                        return (
                          <Table.Tr key={campaign.id}>
                            <Table.Td>
                              <Text size="sm" fw={600}>{campaign.name}</Text>
                              <Text size="xs" c="dimmed" lineClamp={1}>{campaign.objective}</Text>
                            </Table.Td>
                            <Table.Td>
                              {campaignChannels === undefined ? (
                                <Text size="xs" c="dimmed">—</Text>
                              ) : campaignChannels.length === 0 ? (
                                <Text size="xs" c="dimmed">Sin canales</Text>
                              ) : (
                                <Group gap={4}>
                                  {campaignChannels.map((ch) => (
                                    <span key={ch} className="capture-tag">{channelLabel(ch)}</span>
                                  ))}
                                </Group>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <span className="capture-status" data-tone={tone}>{statusLabel}</span>
                            </Table.Td>
                            <Table.Td className="capture-mono">
                              {overview ? campaignLeads.length : <Loader size={12} />}
                            </Table.Td>
                            <Table.Td className="capture-mono" style={{ color: '#4ade80' }}>
                              {overview === null ? '—' : canReadQualifications ? campaignQualified : '—'}
                            </Table.Td>
                            <Table.Td className="capture-mono" style={{ color: '#a1a1aa' }}>
                              {campaign.createdAt ? dateFormatter.format(new Date(campaign.createdAt)) : '—'}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}

              <div className="capture-summary-foot">
                <Text size="xs" c="dimmed">
                  Sin campaña (Orgánico):{' '}
                  <strong className="capture-mono" style={{ color: '#f4f4f5' }}>
                    {overview ? organicLeads.length : '—'}
                  </strong>{' '}
                  recibidos
                  {canReadQualifications && (
                    <>
                      {' · '}
                      <strong className="capture-mono" style={{ color: '#4ade80' }}>{organicQualified}</strong> calificados
                    </>
                  )}
                </Text>
                <Text size="xs" c="dimmed" className="capture-mono">
                  Formulario: {formCount} · Mensajería: {messagingCount} · Sin canal: {unknownChannelCount}
                </Text>
              </div>
              <div style={{ padding: '0 20px 14px' }}>
                <CampaignPager page={page} setPage={setPage} total={result.data.total} />
              </div>
            </>
          )}
        </Paper>

        <Paper component="form" onSubmit={create} className="capture-card" withBorder>
          <Stack gap="md">
            <div>
              <Title order={2} size="h4">Crear campaña</Title>
              <Text size="xs" c="dimmed" mt={2}>Disponible al instante en Resumen y Captación</Text>
            </div>
            {error && <Alert color="red" role="alert">{error}</Alert>}
            <TextInput
              label="Nombre de campaña"
              placeholder="Ej. Lanzamiento Palermo Q4"
              value={name}
              required
              disabled={sending}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <Textarea
              label="Objetivo"
              placeholder="Ej. Captar compradores de departamentos 2 y 3 ambientes"
              value={objective}
              required
              minRows={3}
              disabled={sending}
              onChange={(event) => setObjective(event.currentTarget.value)}
            />
            <Select
              label="Estado inicial"
              allowDeselect={false}
              disabled={sending}
              value={status}
              onChange={(value) => setStatus(value ?? 'active')}
              data={[
                { value: 'active', label: 'Activa' },
                { value: 'draft', label: 'Borrador' },
                { value: 'paused', label: 'Pausada' },
                { value: 'completed', label: 'Completada' },
              ]}
            />
            <Button type="submit" loading={sending} fullWidth>
              Crear campaña
            </Button>
          </Stack>
        </Paper>
      </div>
    </Stack>
  );
}
