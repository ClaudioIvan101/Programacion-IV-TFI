import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { channelOptions, createCaptureApi, listAllCampaigns } from './captureApi.js';
import '../dashboard/dashboard.css';

const channelLabel = (value) => channelOptions.find((option) => option.value === value)?.label ?? value;

export function CaptureScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [campaigns, setCampaigns] = useState(null);
  const [forms, setForms] = useState(null);
  const [campaignId, setCampaignId] = useState(null);
  const [channelState, setChannelState] = useState(null);
  const [channel, setChannel] = useState('form');
  const [formName, setFormName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);
  const channels = channelState?.campaignId === campaignId ? channelState.items : null;
  const canCreate = !campaignId || channels?.includes('form');
  const campaignNames = useMemo(() => new Map(campaigns?.map(({ id, name }) => [id, name])), [campaigns]);

  useEffect(() => {
    const controller = new AbortController();
    listAllCampaigns(api, controller.signal).then((items) => {
      if (!controller.signal.aborted) setCampaigns(items);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    api.listAllForms(controller.signal).then((items) => {
      if (!controller.signal.aborted) setForms(items);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api, revision]);

  useEffect(() => {
    if (!campaignId) return undefined;
    const controller = new AbortController();
    api.listChannels(campaignId, controller.signal).then((items) => {
      if (!controller.signal.aborted) setChannelState({ campaignId, items });
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api, campaignId, revision]);

  async function perform(action, operation) {
    if (busy) return;
    setBusy(action);
    setError('');
    setNotice('');
    try {
      setNotice(await operation());
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy('');
    }
  }

  function addChannel() {
    if (!campaignId) return;
    perform('channel', async () => {
      await api.addChannel(campaignId, channel);
      return 'Canal agregado: ' + channelLabel(channel);
    });
  }

  function createForm(event) {
    event.preventDefault();
    const name = formName.trim();
    if (!name || !canCreate) return;
    perform('form', async () => {
      await api.createForm(campaignId, name);
      setFormName('');
      return 'Formulario creado: ' + name;
    });
  }

  async function copyForm(id) {
    const url = new URL(window.location.href);
    url.hash = '/formulario/' + id;
    setError('');
    try {
      await navigator.clipboard.writeText(url.href);
      setNotice('Enlace copiado.');
    } catch {
      setError('No se pudo copiar. Abra el formulario para copiar su dirección.');
    }
  }

  return <Stack gap="lg">
    <header>
      <Text className="auth-label" size="xs" fw={700}>ENTRADA DE INTERESADOS</Text>
      <Title order={1}>Captación</Title>
      <Text c="dimmed" size="sm" mt="xs">Cree un formulario público con campaña o sin ella. Cada consulta conserva su origen.</Text>
    </header>
    {error && <Alert color="red" role="alert">{error}</Alert>}
    {notice && <Alert color="green" role="status">{notice}</Alert>}
    <Paper className="dashboard-panel" withBorder>
      <Stack gap="sm">
        <Select label="Asociación de campaña" searchable clearable disabled={!!busy}
          placeholder={campaigns === null ? 'Cargando campañas…' : 'Sin campaña'} value={campaignId}
          onChange={(value) => { setCampaignId(value); setChannelState(null); setError(''); }}
          data={campaigns?.map(({ id, name }) => ({ value: id, label: name })) ?? []} />
        {campaignId && <>
          <Title order={2} size="h4">Canales de la campaña</Title>
          {channels === null && !error && <Text role="status" size="sm">Cargando canales…</Text>}
          {channels?.length === 0 && <Text c="dimmed" size="sm">Aún no hay canales.</Text>}
          <Group gap="xs">{channels?.map((value) => <Badge key={value} variant="light">{channelLabel(value)}</Badge>)}</Group>
          <Group align="end">
            <Select label="Canal" data={channelOptions} value={channel} allowDeselect={false}
              onChange={(value) => value && setChannel(value)} disabled={!!busy} />
            <Button variant="light" onClick={addChannel} loading={busy === 'channel'}
              disabled={!channels || channels.includes(channel) || !!busy}>Habilitar canal</Button>
          </Group>
        </>}
        <form onSubmit={createForm}>
          <Group align="end">
            <TextInput label="Nombre del formulario" value={formName} maxLength={200} required
              onChange={(event) => setFormName(event.currentTarget.value)} style={{ flexGrow: 1 }} />
            <Button type="submit" loading={busy === 'form'} disabled={!canCreate || !formName.trim() || !!busy}>Crear formulario</Button>
          </Group>
        </form>
        {!canCreate && channels && <Text size="sm" c="dimmed">Habilite el canal Formulario web para recibir consultas de esta campaña.</Text>}
      </Stack>
    </Paper>
    <Paper className="dashboard-panel" withBorder>
      <Title order={2} size="h4" mb="sm">Formularios y enlaces</Title>
      {forms === null && !error && <Text role="status" size="sm">Cargando formularios…</Text>}
      {forms?.length === 0 && <Text c="dimmed">Todavía no hay formularios.</Text>}
      {forms?.length > 0 && <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing="sm">
          <Table.Thead><Table.Tr><Table.Th>Formulario</Table.Th><Table.Th>Campaña</Table.Th><Table.Th>Enlace público</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{forms.map((form) => <Table.Tr key={form.id}>
            <Table.Td fw={600}>{form.name}</Table.Td>
            <Table.Td>{form.campaignId ? campaignNames.get(form.campaignId) ?? 'Campaña no disponible' : 'Sin campaña'}</Table.Td>
            <Table.Td><Group gap="xs" wrap="nowrap">
              <Button component="a" href={'#/formulario/' + form.id} target="_blank" rel="noopener noreferrer" variant="light" size="compact-sm">Abrir</Button>
              <Button type="button" variant="subtle" size="compact-sm" onClick={() => copyForm(form.id)}>Copiar enlace</Button>
            </Group></Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>}
    </Paper>
  </Stack>;
}
