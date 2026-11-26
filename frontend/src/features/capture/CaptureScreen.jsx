import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Loader, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { dashboardApi } from '../dashboard/dashboardApi.js';
import { channelOptions, createCaptureApi, listAllCampaigns } from './captureApi.js';
import { publicFormLink } from './publicFormLink.js';
import './capture.css';

const channelDescriptions = {
  form: 'Formularios públicos y enlaces compartibles',
  simulated_messaging: 'Consultas recibidas por el canal de mensajería simulado',
};

const channelLabel = (value) => channelOptions.find((option) => option.value === value)?.label ?? value;

export function CaptureScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const leadsApi = useMemo(() => dashboardApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [campaigns, setCampaigns] = useState(null);
  const [forms, setForms] = useState(null);
  const [leads, setLeads] = useState([]);
  const [channelCampaignId, setChannelCampaignId] = useState(null);
  const [channelState, setChannelState] = useState(null);
  const [filterCampaign, setFilterCampaign] = useState('all');
  const [formCampaignId, setFormCampaignId] = useState(null);
  const [formName, setFormName] = useState('');
  const [createdForm, setCreatedForm] = useState(null);
  const [copiedId, setCopiedId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);

  const currentChannels = channelState?.campaignId === channelCampaignId ? channelState : null;
  const channels = currentChannels?.items ?? null;
  const campaignNames = useMemo(() => new Map(campaigns?.map(({ id, name }) => [id, name])), [campaigns]);

  useEffect(() => {
    const controller = new AbortController();
    listAllCampaigns(api, controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setCampaigns(items);
      setChannelCampaignId((current) => current ?? items[0]?.id ?? null);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.listAllForms(controller.signal),
      leadsApi.listLeads(controller.signal),
    ]).then(([formsResult, leadsResult]) => {
      if (controller.signal.aborted) return;
      if (formsResult.status === 'fulfilled') setForms(formsResult.value);
      else setError(formsResult.reason.message);
      if (leadsResult.status === 'fulfilled') setLeads(leadsResult.value);
    });
    return () => controller.abort();
  }, [api, leadsApi, revision]);

  useEffect(() => {
    if (!channelCampaignId) return undefined;
    const controller = new AbortController();
    api.listChannels(channelCampaignId, controller.signal).then((items) => {
      if (!controller.signal.aborted) setChannelState({ campaignId: channelCampaignId, items });
    }).catch((failure) => {
      if (!controller.signal.aborted) setChannelState({ campaignId: channelCampaignId, error: failure.message });
    });
    return () => controller.abort();
  }, [api, channelCampaignId, revision]);

  async function enableChannel(channel) {
    if (!channelCampaignId || busy) return;
    setBusy(`channel:${channel}`);
    setError('');
    setNotice('');
    try {
      await api.addChannel(channelCampaignId, channel);
      setChannelState((current) => current?.campaignId === channelCampaignId
        ? { campaignId: channelCampaignId, items: [...new Set([...(current.items ?? []), channel])] }
        : current);
      setNotice(`Canal "${channelLabel(channel)}" habilitado para ${campaignNames.get(channelCampaignId) ?? 'la campaña'}.`);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy('');
    }
  }

  async function handleCreateForm(event) {
    event.preventDefault();
    if (busy) return;
    const name = formName.trim();
    if (!name) {
      setError('Ingresá un nombre para el formulario.');
      return;
    }

    setBusy('create-form');
    setError('');
    setNotice('');
    try {
      if (formCampaignId) {
        const campaignChannels = await api.listChannels(formCampaignId);
        if (!campaignChannels.includes('form')) {
          try {
            await api.addChannel(formCampaignId, 'form');
          } catch (channelError) {
            if (!/ya asociado/i.test(channelError.message)) throw channelError;
          }
        }
      }
      const created = await api.createForm(formCampaignId, name);
      setCreatedForm(created);
      setFormName('');
      setNotice(`Formulario "${created.name}" generado y listo para compartir.`);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy('');
    }
  }

  async function copyForm(id) {
    const { href } = publicFormLink(window.location.href, id);
    setError('');
    try {
      await navigator.clipboard.writeText(href);
      setCopiedId(id);
      setNotice('Enlace público copiado al portapapeles.');
      setTimeout(() => setCopiedId((current) => current === id ? '' : current), 1600);
    } catch {
      setNotice('');
      setError('No se pudo copiar automáticamente. Abrí la vista previa o copiá la dirección del formulario.');
    }
  }

  const formSubmissions = new Map();
  for (const lead of leads) {
    if (lead.formId) formSubmissions.set(lead.formId, (formSubmissions.get(lead.formId) ?? 0) + 1);
  }

  const visibleForms = (forms ?? []).filter((form) => (
    filterCampaign === 'all'
    || (filterCampaign === 'none' && !form.campaignId)
    || form.campaignId === filterCampaign
  ));

  const createdLink = createdForm && publicFormLink(window.location.href, createdForm.id);
  const localOnly = publicFormLink(window.location.href, '').localOnly;
  const formHref = (id) => publicFormLink(window.location.href, id).href;

  return (
    <Stack gap="md">
      <header>
        <Text className="auth-label" size="xs" fw={700}>ENTRADA DE INTERESADOS</Text>
        <Title order={1}>Captación</Title>
        <Text c="dimmed" size="sm" mt={4}>
          Habilitá canales por campaña, generá formularios públicos y probalos en vista previa. Requiere cuenta de administrador activa.
        </Text>
      </header>

      {error && <Alert color="red" role="alert">{error}</Alert>}
      {notice && <Alert color="green" role="status">{notice}</Alert>}

      <Paper className="capture-card" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="end" wrap="wrap" gap="md">
            <div>
              <Title order={2} size="h4">Canales habilitados</Title>
              <Text size="xs" c="dimmed" mt={2}>Activá los orígenes permitidos para cada campaña comercial.</Text>
            </div>
            <Select
              aria-label="Campaña para configurar canales"
              placeholder={campaigns === null ? 'Cargando campañas…' : 'Seleccionar campaña'}
              value={channelCampaignId}
              onChange={(value) => { setChannelCampaignId(value); setChannelState(null); setError(''); }}
              disabled={!!busy || !campaigns?.length}
              searchable
              style={{ minWidth: 260 }}
              data={campaigns?.map(({ id, name }) => ({ value: id, label: name })) ?? []}
            />
          </Group>

          {!channelCampaignId ? (
            <Text size="sm" c="dimmed">
              {campaigns?.length === 0
                ? 'Todavía no hay campañas creadas. Podés crear formularios sin campaña o crear una campaña primero.'
                : 'Seleccioná una campaña para consultar y habilitar sus canales.'}
            </Text>
          ) : currentChannels?.error ? (
            <Alert color="red" role="alert">
              <Group justify="space-between" gap="xs">
                <Text size="sm">No se pudieron cargar los canales: {currentChannels.error}</Text>
                <Button size="compact-sm" variant="light" onClick={() => { setChannelState(null); setRevision((v) => v + 1); }}>
                  Reintentar
                </Button>
              </Group>
            </Alert>
          ) : channels === null ? (
            <Loader size="xs" aria-label="Cargando canales" />
          ) : (
            <div className="capture-channels-grid">
              {channelOptions.map(({ value, label }) => {
                const active = channels.includes(value);
                return (
                  <div key={value} className="capture-item-card">
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Text size="sm" fw={600}>{label}</Text>
                      <span className="capture-status" data-tone={active ? 'green' : 'neutral'}>
                        {active ? 'Habilitado' : 'Inactivo'}
                      </span>
                    </Group>
                    <Text size="xs" c="dimmed">{channelDescriptions[value]}</Text>
                    {!active && (
                      <div>
                        <Button
                          size="compact-sm"
                          variant="light"
                          loading={busy === `channel:${value}`}
                          disabled={!!busy}
                          onClick={() => enableChannel(value)}
                        >
                          Habilitar {label}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Stack>
      </Paper>

      {createdLink && (
        <Paper className="capture-card" withBorder>
          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Title order={2} size="h4">Formulario creado: {createdForm.name}</Title>
                <Text size="xs" c="dimmed">El enlace ya está listo para recibir consultas sin inicio de sesión.</Text>
              </div>
              <Group gap="xs">
                <Button variant="default" size="compact-sm" onClick={() => copyForm(createdForm.id)}>
                  {copiedId === createdForm.id ? 'Copiado' : 'Copiar enlace'}
                </Button>
                <Button component="a" href={createdLink.href} target="_blank" rel="noopener noreferrer" size="compact-sm">
                  Vista previa
                </Button>
              </Group>
            </Group>
            <TextInput label="Enlace público" value={createdLink.href} readOnly onFocus={(event) => event.currentTarget.select()} />
            {createdLink.localOnly && <LocalLinkHint />}
          </Stack>
        </Paper>
      )}

      <div className="capture-main-grid">
        <Paper className="capture-card capture-table-card" withBorder>
          <div className="capture-card-head">
            <div>
              <Title order={2} size="h4">Formularios públicos</Title>
              <Text size="xs" c="dimmed" mt={2}>Enlaces listos para compartir o probar en vista previa</Text>
            </div>
            <Select
              aria-label="Filtrar formularios por campaña"
              size="xs"
              value={filterCampaign}
              allowDeselect={false}
              onChange={(value) => setFilterCampaign(value ?? 'all')}
              style={{ width: 225 }}
              data={[
                { value: 'all', label: 'Todas las campañas' },
                { value: 'none', label: 'Sin campaña (Orgánico)' },
                ...(campaigns?.map(({ id, name }) => ({ value: id, label: name })) ?? []),
              ]}
            />
          </div>

          <Stack p="md" gap="sm">
            {localOnly && !createdLink && visibleForms.length > 0 && <LocalLinkHint />}
            {forms === null && !error && <Loader size="xs" aria-label="Cargando formularios" />}
            {forms !== null && visibleForms.length === 0 && (
              <Text c="dimmed" size="sm" ta="center" py="md">
                {forms.length === 0 ? 'Todavía no hay formularios creados.' : 'Sin formularios para esta campaña.'}
              </Text>
            )}
            {visibleForms.map((form) => {
              const url = formHref(form.id);
              const count = formSubmissions.get(form.id) ?? 0;
              return (
                <div key={form.id} className="capture-item-card">
                  <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                    <div>
                      <Text size="sm" fw={600}>{form.name}</Text>
                      <Text size="xs" c="dimmed" mt={2}>
                        {form.campaignId ? `Campaña: ${campaignNames.get(form.campaignId) ?? 'Campaña no disponible'}` : 'Sin campaña (Orgánico)'}
                        {' · '}
                        <span className="capture-mono">{count} {count === 1 ? 'envío' : 'envíos'}</span>
                      </Text>
                    </div>
                    <span className="capture-tag">Formulario web</span>
                  </Group>
                  <div className="capture-item-foot">
                    <span className="capture-url">{url}</span>
                    <Group gap="xs" wrap="nowrap">
                      <Button type="button" variant="default" size="compact-sm" onClick={() => copyForm(form.id)}>
                        {copiedId === form.id ? 'Copiado' : 'Copiar enlace'}
                      </Button>
                      <Button component="a" href={url} target="_blank" rel="noopener noreferrer" size="compact-sm">
                        Vista previa
                      </Button>
                    </Group>
                  </div>
                </div>
              );
            })}
          </Stack>
        </Paper>

        <Paper component="form" onSubmit={handleCreateForm} className="capture-card" withBorder>
          <Stack gap="md">
            <div>
              <Title order={2} size="h4">Crear formulario público</Title>
              <Text size="xs" c="dimmed" mt={2}>Vinculable opcionalmente a una campaña comercial</Text>
            </div>
            <TextInput
              label="Nombre del formulario"
              placeholder="Ej. Consulta Departamentos Palermo"
              value={formName}
              maxLength={200}
              required
              disabled={!!busy}
              onChange={(event) => setFormName(event.currentTarget.value)}
            />
            <Select
              label="Campaña asociada (opcional)"
              placeholder={campaigns === null ? 'Cargando campañas…' : 'Sin campaña / Orgánico'}
              value={formCampaignId}
              onChange={setFormCampaignId}
              clearable
              searchable
              disabled={!!busy}
              data={campaigns?.map(({ id, name }) => ({ value: id, label: name })) ?? []}
            />
            <Text size="xs" c="dimmed">
              {formCampaignId
                ? 'Las consultas quedarán asociadas a este formulario y a la campaña elegida (si la campaña no tiene el canal Formulario web, se habilita automáticamente).'
                : 'Las consultas quedarán registradas con origen de formulario sin campaña (Orgánico).'}
            </Text>
            <Button type="submit" loading={busy === 'create-form'} disabled={!!busy || !formName.trim()} fullWidth>
              Generar formulario
            </Button>
          </Stack>
        </Paper>
      </div>
    </Stack>
  );
}

function LocalLinkHint() {
  return (
    <Text size="xs" c="dimmed">
      Estás usando una dirección local; este enlace funciona en esta máquina para probar y copiar.
    </Text>
  );
}
