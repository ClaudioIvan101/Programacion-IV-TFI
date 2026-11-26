import { Alert, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { assignmentApi, formatResponseTime, notificationLabels } from '../assignments/assignmentApi.js';
import { createCaptureApi, listAllCampaigns } from '../capture/captureApi.js';
import { leadRoute } from '../workspace/workspaceRoute.js';
import { LeadRegistration } from '../chat/LeadRegistration.jsx';
import { campaignDistribution, filterDashboardLeads, relativeScoreWidth } from './dashboardView.js';
import { dashboardApi, leadLabel, loadLeadOverview } from './dashboardApi.js';
import './dashboard.css';

const decisions = {
  qualified: ['Calificado', 'green'],
  not_qualified: ['No calificado', 'gray'],
  pending: ['Pendiente', 'yellow'],
};
const channels = { form: 'Formulario web', simulated_messaging: 'Mensajería simulada' };

export function Dashboard({ accessToken, onUnauthorized }) {
  const api = useMemo(() => dashboardApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const capture = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const assignments = useMemo(() => assignmentApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [handoff, setHandoff] = useState(null);
  const [overview, setOverview] = useState(null);
  const [origins, setOrigins] = useState({ campaigns: [], forms: [] });
  const [originError, setOriginError] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [search, setSearch] = useState('');
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    loadLeadOverview(api, signal).then((result) => {
      if (!signal.aborted) setOverview(result);
    }).catch((failure) => {
      if (!signal.aborted) setError(failure.message);
    }).finally(() => {
      if (!signal.aborted) setLoading(false);
    });
    Promise.allSettled([listAllCampaigns(capture, signal), capture.listAllForms(signal)]).then(([campaigns, forms]) => {
      if (signal.aborted) return;
      setOriginError(campaigns.status === 'rejected' || forms.status === 'rejected');
      setOrigins({ campaigns: campaigns.value ?? [], forms: forms.value ?? [] });
    });
    assignments.list(signal).then((result) => {
      if (!signal.aborted) setHandoff(result);
    }).catch(() => {
      if (!signal.aborted) setHandoff(null);
    });
    return () => controller.abort();
  }, [api, capture, assignments, revision]);

  function refresh() {
    setError('');
    setLoading(true);
    setRevision((value) => value + 1);
  }

  const campaignNames = new Map(origins.campaigns.map(({ id, name }) => [id, name]));
  const formNames = new Map(origins.forms.map(({ id, name }) => [id, name]));
  for (const { campaignId } of overview?.leads ?? []) {
    if (campaignId && !campaignNames.has(campaignId)) campaignNames.set(campaignId, 'Campaña ' + campaignId.slice(0, 8));
  }
  const allLeads = overview?.leads ?? [];
  const visibleLeads = filterDashboardLeads(allLeads, campaign, search).toReversed();
  const distribution = campaignDistribution(allLeads, campaignNames);
  const maxCampaignVolume = Math.max(...distribution.map(({ count }) => count), 1);
  const maxScore = allLeads.reduce((max, { score }) => Number.isFinite(score) ? Math.max(max, score) : max, 0);
  const counts = overview?.counts;
  const assignedByLead = new Map(handoff?.assignments.map((row) => [row.leadId, row]));

  return <Stack gap="lg" component="section" aria-labelledby="dashboard-title">
    <Group justify="space-between" align="end">
      <div>
        <Text className="auth-label" fw={700} size="xs">CAPTACIÓN Y SEGUIMIENTO</Text>
        <Title id="dashboard-title" order={1}>Resumen</Title>
        <Text c="dimmed" size="sm" mt="xs">Del origen de la consulta a la calificación comercial.</Text>
      </div>
      <Group gap="xs">
        <Button component="a" href="#/captacion">Compartir un formulario</Button>
        <Button variant="light" loading={loading} onClick={refresh}>Actualizar</Button>
      </Group>
    </Group>
    {error && <Alert color="red" role="alert">{error}</Alert>}
    <div className="dashboard-counts">
      {[
        ['Recibidos', counts?.total],
        ['Calificados', counts?.qualified],
        ['Pendientes', counts?.pending],
        ['Derivados visibles', handoff?.assignments.length],
      ].map(([label, count]) => <Paper className="dashboard-panel dashboard-count" withBorder key={label}>
        <Text size="sm" fw={600} c="dimmed">{label}</Text>
        <Text className="dashboard-count-value" fw={700}>{count ?? '—'}</Text>
      </Paper>)}
    </div>
    {counts?.qualified === null && <Alert color="yellow" role="status">No se pudieron consultar todas las calificaciones. El total de interesados sigue disponible.</Alert>}
    <Paper className="dashboard-panel dashboard-distribution" withBorder>
      <Title order={2} size="h4">Distribución por campaña</Title>
      <Text size="xs" c="dimmed">Volumen actual de consultas por origen.</Text>
      {overview ? <ul className="dashboard-distribution-list">
        {distribution.map(({ id, label, count }) => (
          <li key={id ?? 'none'}>
            <div className="dashboard-distribution-label"><span>{label}</span><strong>{count}</strong></div>
            <div className="dashboard-distribution-track" aria-hidden="true">
              <span style={{ width: 100 * count / maxCampaignVolume + '%' }} />
            </div>
          </li>
        ))}
      </ul> : <Text size="sm" c="dimmed" role="status" mt="sm">
        {loading ? 'Cargando distribución…' : 'Distribución no disponible.'}
      </Text>}
    </Paper>
    <Paper className="dashboard-panel dashboard-inbox" withBorder>
      <header className="dashboard-inbox-head">
        <Title order={2} size="h4">Bandeja de interesados</Title>
        <Text size="xs" c="dimmed">Origen, puntaje de calificación, estado de derivación y accesos de seguimiento.</Text>
        <Group className="dashboard-inbox-controls" gap="xs" align="center">
          <Select aria-label="Filtrar por campaña" placeholder="Todas las campañas" clearable searchable value={campaign}
            onChange={setCampaign} data={[{ value: 'none', label: 'Sin campaña' },
              ...Array.from(campaignNames, ([value, label]) => ({ value, label }))]} />
          <TextInput aria-label="Filtrar por nombre o contacto" placeholder="Filtrar interesado o contacto…"
            value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
          <Button size="sm" onClick={() => { setNotice(''); setRegistering(true); }}>+ Registrar interesado</Button>
        </Group>
        {notice && <Text role="status" mt="xs" size="sm" c="green">{notice}</Text>}
        {originError && <Text size="sm" c="dimmed" mt="xs">No se pudieron cargar todos los nombres de campaña o formulario.</Text>}
        {!overview && loading && <Text role="status" size="sm" mt="xs">Cargando interesados…</Text>}
        {overview && visibleLeads.length === 0 && <Text c="dimmed" size="sm" mt="xs">{campaign || search.trim()
          ? 'No hay consultas para este filtro.'
          : 'Todavía no hay consultas. Cree y comparta un formulario para recibir interesados.'}</Text>}
      </header>
      {visibleLeads.length > 0 && <Table.ScrollContainer minWidth={880}>
        <Table className="dashboard-inbox-table" highlightOnHover verticalSpacing="sm">
          <Table.Thead><Table.Tr>
            <Table.Th>Interesado</Table.Th><Table.Th>Origen / Campaña</Table.Th><Table.Th>Puntaje</Table.Th>
            <Table.Th>Estado</Table.Th><Table.Th>Derivación</Table.Th><Table.Th>Seguimiento</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>{visibleLeads.map((lead) => {
            const [status, color] = decisions[lead.decision] ?? ['No disponible', 'gray'];
            const assigned = assignedByLead.get(lead.id);
            return <Table.Tr key={lead.id}>
              <Table.Td>
                <Text size="sm" fw={600}>{leadLabel(lead)}</Text>
                {lead.name && (lead.email || lead.phone) && <Text size="xs" c="dimmed">{lead.email || lead.phone}</Text>}
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={600}>{lead.campaignId ? campaignNames.get(lead.campaignId) : 'Sin campaña'}</Text>
                <Text size="xs" c="dimmed">{lead.formId ? formNames.get(lead.formId) ?? 'Formulario ' + lead.formId.slice(0, 8)
                  : channels[lead.channel] ?? 'Sin canal registrado'}</Text>
              </Table.Td>
              <Table.Td>
                <div className="dashboard-score" title={lead.score == null ? 'Sin puntaje' : 'Barra relativa al mayor puntaje positivo de la bandeja'}>
                  <div className="dashboard-distribution-track" aria-hidden="true">
                    <span data-decision={lead.decision} style={{ width: relativeScoreWidth(lead.score, maxScore) + '%' }} />
                  </div>
                  <strong aria-label={lead.score == null ? 'Sin puntaje' : lead.score + ' puntos'}>{lead.score ?? '—'}</strong>
                </div>
                {lead.ruleSetVersion != null && <Text size="xs" c="dimmed">Versión {lead.ruleSetVersion}</Text>}
              </Table.Td>
              <Table.Td><span className="dashboard-inbox-status" data-color={color}>{status}</span></Table.Td>
              <Table.Td>
                {assigned ? <>
                  <Text size="sm" fw={600}>{assigned.sellerName}</Text>
                  <span className="dashboard-inbox-status" data-color={notificationLabels[assigned.notificationStatus]?.[1]}>
                    {notificationLabels[assigned.notificationStatus]?.[0] ?? 'Aviso sin estado'}
                  </span>
                  {assigned.responseSeconds != null && <Text size="xs" c="dimmed">{formatResponseTime(assigned.responseSeconds)}</Text>}
                </> : <Text size="xs" c="dimmed">{handoff?.canManage ? 'Sin asignar' : handoff ? 'Sin derivación visible' : 'No disponible'}</Text>}
              </Table.Td>
              <Table.Td><Group className="dashboard-inbox-actions" justify="flex-end" gap="xs" wrap="nowrap">
                <Button component="a" href={leadRoute('chat', lead.id)} size="compact-sm" variant="default">Chat</Button>
                <Button component="a" href={leadRoute('calificacion', lead.id)} size="compact-sm" variant="default">Calificar</Button>
                {assigned
                  ? <Button component="a" href={leadRoute('derivacion', lead.id)} size="compact-sm" variant="default">Ver derivación</Button>
                  : handoff?.canManage && lead.decision === 'qualified'
                    ? <Button component="a" href={leadRoute('derivacion', lead.id)} size="compact-sm" variant="default">Derivar</Button>
                    : <Button size="compact-sm" variant="default" disabled>Derivar</Button>}
              </Group></Table.Td>
            </Table.Tr>;
          })}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>}
    </Paper>
    {registering && <LeadRegistration accessToken={accessToken} onUnauthorized={onUnauthorized}
      onCreate={api.createLead} onClose={() => setRegistering(false)} onCreated={() => {
        setRegistering(false);
        setNotice('Interesado registrado.');
        setCampaign(null);
        setSearch('');
        refresh();
      }} />}
  </Stack>;
}
