import { Alert, Badge, Button, Group, Paper, Select, Stack, Table, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { assignmentApi, formatResponseTime, notificationLabels } from '../assignments/assignmentApi.js';
import { createCaptureApi, listAllCampaigns } from '../capture/captureApi.js';
import { leadRoute } from '../workspace/workspaceRoute.js';
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
  const visibleLeads = overview?.leads.toReversed().filter((lead) =>
    campaign === null || (campaign === 'none' ? !lead.campaignId : lead.campaignId === campaign));
  const counts = overview?.counts;
  const assignedByLead = new Map(handoff?.assignments.map((row) => [row.leadId, row]));

  return <Stack gap="lg" component="section" aria-labelledby="dashboard-title">
    <Group justify="space-between" align="end">
      <div>
        <Text className="auth-label" fw={700} size="xs">CAPTACIÓN Y SEGUIMIENTO</Text>
        <Title id="dashboard-title" order={1}>Bandeja de interesados</Title>
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
      ].map(([label, count]) => <Paper className="dashboard-panel dashboard-count" withBorder key={label}>
        <Text size="sm" fw={600} c="dimmed">{label}</Text>
        <Text className="dashboard-count-value" fw={700}>{count ?? '—'}</Text>
      </Paper>)}
    </div>
    {counts?.qualified === null && <Alert color="yellow" role="status">No se pudieron consultar todas las calificaciones. El total de interesados sigue disponible.</Alert>}
    <Paper className="dashboard-panel" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="end">
          <div>
            <Title order={2} size="h4">Consultas recibidas</Title>
            <Text size="sm" c="dimmed">Último puntaje guardado. El filtro solo aplica al listado.</Text>
          </div>
          <Select label="Filtrar por campaña" placeholder="Todas las campañas" clearable searchable value={campaign}
            onChange={setCampaign} data={[{ value: 'none', label: 'Sin campaña' },
              ...Array.from(campaignNames, ([value, label]) => ({ value, label }))]} />
        </Group>
        {originError && <Text size="sm" c="dimmed">No se pudieron cargar todos los nombres de campaña o formulario.</Text>}
        {!overview && loading && <Text role="status" size="sm">Cargando interesados…</Text>}
        {visibleLeads?.length === 0 && <Text c="dimmed" size="sm">{campaign
          ? 'No hay consultas para este filtro.'
          : 'Todavía no hay consultas. Cree y comparta un formulario para recibir interesados.'}</Text>}
        {visibleLeads?.length > 0 && <Table.ScrollContainer minWidth={770}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead><Table.Tr>
              <Table.Th>Interesado</Table.Th><Table.Th>Origen</Table.Th><Table.Th>Calificación</Table.Th>
              <Table.Th>Derivación</Table.Th><Table.Th>Seguimiento</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>{visibleLeads.map((lead) => {
              const [status, color] = decisions[lead.decision] ?? ['No disponible', 'gray'];
              const assigned = assignedByLead.get(lead.id);
              return <Table.Tr key={lead.id}>
                <Table.Td><Text size="sm" fw={600}>{leadLabel(lead)}</Text></Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>{lead.campaignId ? campaignNames.get(lead.campaignId) : 'Sin campaña'}</Text>
                  <Text size="xs" c="dimmed">{lead.formId ? formNames.get(lead.formId) ?? 'Formulario ' + lead.formId.slice(0, 8)
                    : channels[lead.channel] ?? 'Sin canal registrado'}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={color}>{status}</Badge>
                  <Text size="xs" c="dimmed" mt={4}>{lead.score == null ? 'Sin puntaje'
                    : lead.score + ' puntos · v' + lead.ruleSetVersion}</Text>
                </Table.Td>
                <Table.Td>
                  {assigned ? <>
                    <Text size="sm" fw={600}>{assigned.sellerName}</Text>
                    <Text size="xs" c="dimmed">{notificationLabels[assigned.notificationStatus]?.[0] ?? 'Aviso sin estado'}</Text>
                    <Text size="xs" c="dimmed">{formatResponseTime(assigned.responseSeconds)}</Text>
                    <Button component="a" href={leadRoute('derivacion', lead.id)} size="compact-xs" variant="subtle">Ver derivación</Button>
                  </> : handoff?.canManage && lead.decision === 'qualified'
                    ? <Button component="a" href={leadRoute('derivacion', lead.id)} size="compact-sm" variant="light">Derivar</Button>
                    : <Text size="xs" c="dimmed">{handoff ? 'Sin derivación visible' : 'Derivación no disponible'}</Text>}
                </Table.Td>
                <Table.Td><Group gap="xs" wrap="nowrap">
                  <Button component="a" href={leadRoute('chat', lead.id)} size="compact-sm" variant="light">Chat</Button>
                  <Button component="a" href={leadRoute('calificacion', lead.id)} size="compact-sm" variant="subtle">Calificación</Button>
                </Group></Table.Td>
              </Table.Tr>;
            })}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>}
      </Stack>
    </Paper>
  </Stack>;
}
