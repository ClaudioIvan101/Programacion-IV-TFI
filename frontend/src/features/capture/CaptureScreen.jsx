import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { channelOptions, createCaptureApi } from './captureApi.js';
import { CampaignPager, CaptureRequestState, useCampaignPage } from './campaignPage.jsx';
import '../dashboard/dashboard.css';

const channelLabel = (value) => channelOptions.find(({ value: option }) => option === value)?.label ?? value;
const dateLabel = (value) => value ? new Date(value).toLocaleString('es-AR') : 'Sin fecha';

export function CaptureScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const { result, page, setPage } = useCampaignPage(api);
  // La lista se memoriza para que el efecto de selección no dependa de un arreglo nuevo en cada render.
  const campaigns = useMemo(() => result?.data?.items ?? [], [result]);

  const [campaignId, setCampaignId] = useState(null);
  const [channels, setChannels] = useState(null);
  const [forms, setForms] = useState(null);
  const [channel, setChannel] = useState('form');
  const [formName, setFormName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  // Se elige la primera campaña disponible para no dejar la pantalla vacía.
  useEffect(() => {
    if (!campaignId && campaigns.length) setCampaignId(campaigns[0].id);
  }, [campaignId, campaigns]);

  useEffect(() => {
    if (!campaignId) {
      setChannels(null);
      setForms(null);
      return undefined;
    }
    const controller = new AbortController();
    setChannels(null);
    setForms(null);
    Promise.all([
      api.listChannels(campaignId, controller.signal),
      api.listForms(campaignId, controller.signal),
    ]).then(([nextChannels, nextForms]) => {
      if (controller.signal.aborted) return;
      setChannels(nextChannels);
      setForms(nextForms);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api, campaignId, revision]);

  async function addChannel(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.addChannel(campaignId, channel);
      setNotice('Canal agregado: ' + channelLabel(channel));
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function createForm(event) {
    event.preventDefault();
    const name = formName.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.createForm(campaignId, name);
      setFormName('');
      setNotice('Formulario creado: ' + name);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="lg">
      <div>
        <Text className="auth-label" size="xs" fw={700}>ORÍGENES DE CONTACTO</Text>
        <Title order={1}>Captación</Title>
        <Text c="dimmed" size="sm" mt={4}>Canales habilitados y formularios asociados a cada campaña.</Text>
      </div>

      <Paper p="md" withBorder>
        <CaptureRequestState result={result} />
        {result?.data && (
          <Stack>
            {campaigns.length ? (
              <>
                <Select
                  label="Campaña"
                  placeholder="Seleccione una campaña"
                  data={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
                  value={campaignId}
                  onChange={setCampaignId}
                />
                <CampaignPager page={page} setPage={setPage} total={result.data.total} />
              </>
            ) : <Text c="dimmed">Todavía no hay campañas. Cree una en la sección Campañas.</Text>}
          </Stack>
        )}
      </Paper>

      {error && <Alert color="red" role="alert">{error}</Alert>}
      {notice && <Alert color="green" role="status">{notice}</Alert>}

      {campaignId && (
        <div className="dashboard-grid">
          <Paper className="dashboard-panel" withBorder>
            <Stack gap="md">
              <div>
                <Title order={2} size="h4">Canales</Title>
                <Text c="dimmed" size="sm">Cada canal se asocia una sola vez por campaña.</Text>
              </div>
              <Group align="flex-end" wrap="nowrap">
                <Select
                  label="Canal"
                  data={channelOptions}
                  value={channel}
                  onChange={(value) => value && setChannel(value)}
                  allowDeselect={false}
                  style={{ flex: 1 }}
                />
                <Button type="button" onClick={addChannel} loading={busy}>Agregar</Button>
              </Group>
              {!channels && <Text role="status" size="sm">Cargando canales…</Text>}
              {channels?.length === 0 && <Text c="dimmed" size="sm">Esta campaña aún no tiene canales.</Text>}
              {channels?.length > 0 && (
                <Group gap="xs">
                  {channels.map((value) => <Badge key={value} variant="light" color="yellow">{channelLabel(value)}</Badge>)}
                </Group>
              )}
            </Stack>
          </Paper>

          <Paper className="dashboard-panel" withBorder>
            <Stack gap="md">
              <div>
                <Title order={2} size="h4">Formularios</Title>
                <Text c="dimmed" size="sm">Formularios de captación vinculados a la campaña.</Text>
              </div>
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Nombre del formulario"
                  placeholder="Ej.: Consulta web"
                  value={formName}
                  onChange={(event) => setFormName(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button type="button" onClick={createForm} loading={busy} disabled={!formName.trim()}>Crear</Button>
              </Group>
              {!forms && <Text role="status" size="sm">Cargando formularios…</Text>}
              {forms?.length === 0 && <Text c="dimmed" size="sm">Esta campaña aún no tiene formularios.</Text>}
              {forms?.length > 0 && (
                <Table.ScrollContainer minWidth={320}>
                  <Table verticalSpacing="xs" highlightOnHover>
                    <Table.Thead>
                      <Table.Tr><Table.Th>Formulario</Table.Th><Table.Th>Creado</Table.Th></Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {forms.map((form) => (
                        <Table.Tr key={form.id}>
                          <Table.Td fw={600}>{form.name}</Table.Td>
                          <Table.Td>{dateLabel(form.createdAt)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Stack>
          </Paper>
        </div>
      )}
    </Stack>
  );
}
