import { Alert, Badge, Button, Group, Paper, Select, Stack, Table, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { leadLabel } from '../dashboard/dashboardApi.js';
import { assignmentApi, formatResponseTime, notificationLabels } from './assignmentApi.js';

const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export function AssignmentsScreen({ accessToken, onUnauthorized, initialLeadId }) {
  const api = useMemo(() => assignmentApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [queue, setQueue] = useState(null);
  const [options, setOptions] = useState(null);
  const [leadId, setLeadId] = useState(initialLeadId ?? null);
  const [sellerId, setSellerId] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      try {
        const nextQueue = await api.list(signal);
        if (signal.aborted) return;
        setQueue(nextQueue);
        if (!nextQueue.canManage) return;
        const nextOptions = await api.options(signal);
        if (!signal.aborted) setOptions(nextOptions);
      } catch (failure) {
        if (!signal.aborted) setError(failure.message);
      }
    }
    load();
    return () => controller.abort();
  }, [api, refresh]);

  async function perform(action, operation) {
    if (busy) return;
    setError('');
    setBusy(action);
    try {
      const updated = await operation();
      setQueue((current) => ({ ...current, assignments: [
        updated, ...current.assignments.filter((row) => row.id !== updated.id),
      ] }));
      if (action === 'assign') {
        setOptions((current) => ({ ...current, leads: current.leads.filter((lead) => lead.id !== updated.leadId) }));
        setLeadId(null);
        setSellerId(null);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy('');
    }
  }

  const selected = options?.leads.some((lead) => lead.id === leadId) ? leadId : null;
  const assignments = queue?.assignments ?? [];
  const recordedCount = assignments.filter((row) => row.firstContactAt !== null).length;

  return <Stack component="section" aria-labelledby="assignment-title" gap="lg">
    <Group justify="space-between" align="end">
      <div>
        <Text className="auth-label" fw={700} size="xs">SEGUIMIENTO COMERCIAL</Text>
        <Title id="assignment-title" order={1}>Derivación</Title>
        <Text c="dimmed" size="sm" mt="xs">
          {queue?.canManage ? 'Asigne interesados calificados y supervise el primer contacto.'
            : 'Consulte sus asignaciones y registre el primer contacto con cada interesado.'}
        </Text>
      </div>
      <Button variant="light" disabled={Boolean(busy)} onClick={() => { setError(''); setRefresh((value) => value + 1); }}>Actualizar</Button>
    </Group>
    {error && <Alert color="red" role="alert">{error}</Alert>}
    {!queue && !error && <Text role="status">Cargando derivaciones…</Text>}
    {queue?.canManage && <Paper className="dashboard-panel" withBorder p="md"
      component="form" onSubmit={(event) => {
        event.preventDefault();
        if (selected && sellerId) perform('assign', () => api.create({ leadId: selected, sellerId }));
      }}>
      <Stack gap="sm">
        <Title order={2} size="h4">Nueva asignación</Title>
        <Text c="dimmed" size="sm">Solo aparecen interesados calificados sin asignar y vendedores activos.</Text>
        <Group align="end" grow>
          <Select label="Interesado" searchable placeholder="Seleccione un interesado" value={selected} onChange={setLeadId}
            data={options?.leads.map((lead) => ({ value: lead.id, label: leadLabel(lead) + ' · ' + lead.score + ' puntos' })) ?? []}
            nothingFoundMessage="No hay interesados elegibles" disabled={!options || Boolean(busy)} />
          <Select label="Vendedor" searchable placeholder="Seleccione un vendedor activo" value={sellerId} onChange={setSellerId}
            data={options?.sellers.map((seller) => ({ value: seller.id, label: seller.name })) ?? []}
            nothingFoundMessage="No hay vendedores activos" disabled={!options || Boolean(busy)} />
        </Group>
        <Group justify="flex-end">
          <Button type="submit" loading={busy === 'assign'} disabled={!selected || !sellerId || Boolean(busy)}>
            Asignar y solicitar aviso
          </Button>
        </Group>
      </Stack>
    </Paper>}
    {queue && <Paper className="dashboard-panel" withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={2} size="h4">{queue.canManage ? 'Derivaciones registradas' : 'Mis asignaciones'}</Title>
          <Text size="sm" c="dimmed">{recordedCount} de {assignments.length} con primer contacto</Text>
        </Group>
        <Text size="sm" c="dimmed">
          El tiempo se mide desde la asignación hasta que el vendedor registra su primer contacto.
        </Text>
        {assignments.length === 0 && <Text c="dimmed">No hay derivaciones registradas.</Text>}
        {assignments.length > 0 && <Table.ScrollContainer minWidth={730}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead><Table.Tr>
              <Table.Th>Interesado</Table.Th><Table.Th>Vendedor</Table.Th><Table.Th>Aviso por correo</Table.Th>
              <Table.Th>Primer contacto</Table.Th><Table.Th>Acción</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>{assignments.map((row) => {
              const [status, color] = notificationLabels[row.notificationStatus] ?? ['Estado desconocido', 'gray'];
              return <Table.Tr key={row.id} style={row.leadId === initialLeadId ? { backgroundColor: 'var(--mantine-color-yellow-light)' } : undefined}>
                <Table.Td>
                  <Text fw={600} size="sm">{row.leadName ?? row.leadEmail ?? row.leadPhone ?? 'Interesado sin nombre'}</Text>
                  {row.leadEmail && <Text c="dimmed" size="xs">{row.leadEmail}</Text>}
                  {row.leadPhone && <Text c="dimmed" size="xs">{row.leadPhone}</Text>}
                  <Text c="dimmed" size="xs">{row.campaignName ?? 'Sin campaña'} · {row.score} puntos · v{row.ruleSetVersion}</Text>
                  {row.needs && <Text c="dimmed" size="xs" lineClamp={2}>{row.needs}</Text>}
                </Table.Td>
                <Table.Td><Text size="sm">{row.sellerName}</Text><Text c="dimmed" size="xs">{date.format(new Date(row.assignedAt))}</Text></Table.Td>
                <Table.Td><Badge variant="light" color={color}>{status}</Badge><Text c="dimmed" size="xs">{row.attempts} de 3 intentos</Text></Table.Td>
                <Table.Td>
                  <Text size="sm">{formatResponseTime(row.responseSeconds)}</Text>
                  {row.firstContactAt && <Text c="dimmed" size="xs">{date.format(new Date(row.firstContactAt))}</Text>}
                </Table.Td>
                <Table.Td>
                  {queue.canManage && ['pending', 'failed'].includes(row.notificationStatus) && row.attempts < 3 &&
                    <Button size="compact-sm" variant="light" disabled={Boolean(busy)} loading={busy === row.id}
                      onClick={() => perform(row.id, () => api.retry(row.id))}>Reintentar aviso</Button>}
                  {!queue.canManage && !row.firstContactAt &&
                    <Button size="compact-sm" variant="light" disabled={Boolean(busy)} loading={busy === row.id}
                      onClick={() => perform(row.id, () => api.firstContact(row.id))}>Registrar primer contacto</Button>}
                </Table.Td>
              </Table.Tr>;
            })}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>}
      </Stack>
    </Paper>}
  </Stack>;
}
