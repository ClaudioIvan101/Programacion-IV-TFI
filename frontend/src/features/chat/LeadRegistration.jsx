import { Alert, Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { CampaignPager, CaptureRequestState, useCampaignPage } from '../capture/campaignPage.jsx';
import { channelOptions, createCaptureApi } from '../capture/captureApi.js';

const maximumBudget = 1_000_000_000_000;

export function LeadRegistration({ accessToken, onUnauthorized, onCreate, onCreated, onClose }) {
  const api = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const { page, setPage, result } = useCampaignPage(api);
  const [campaign, setCampaign] = useState(null);
  const [channel, setChannel] = useState(null);
  const [formId, setFormId] = useState(null);
  const [currency, setCurrency] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const campaignId = campaign?.value ?? null;
  const campaignChoices = (result?.data?.items ?? []).map(({ id, name }) => ({ value: id, label: name }));
  if (campaign && !campaignChoices.some(({ value }) => value === campaignId)) campaignChoices.unshift(campaign);
  const channels = campaignId
    ? channelOptions.filter(({ value }) => origin?.channels?.includes(value))
    : channelOptions;
  const forms = (origin?.forms ?? []).map(({ id, name }) => ({ value: id, label: name }));

  useEffect(() => {
    if (!campaignId) return undefined;
    const controller = new AbortController();
    Promise.all([
      api.listChannels(campaignId, controller.signal),
      api.listForms(campaignId, controller.signal),
    ]).then(([channels, forms]) => {
      if (!controller.signal.aborted) setOrigin({ channels, forms });
    }).catch((failure) => {
      if (!controller.signal.aborted) setOrigin({ error: failure.message });
    });
    return () => controller.abort();
  }, [api, campaignId]);

  function selectCampaign(id, option) {
    if (id === campaignId) return;
    setCampaign(id ? option : null);
    setChannel(null);
    setFormId(null);
    setOrigin(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    const text = (name) => fields.get(name).trim() || null;
    const amount = text('budgetAmount');
    setError('');
    setSaving(true);
    try {
      const lead = await onCreate({
        name: text('name'), email: text('email'), phone: text('phone'),
        needs: text('needs'), urgency: text('urgency'),
        budgetAmount: amount === null ? null : Number(amount), budgetCurrency: currency,
        campaignId, channel, formId,
      });
      onCreated(lead);
    } catch (failure) {
      setError(failure.message);
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title="Nuevo interesado" size="lg" centered
      withCloseButton={!saving} closeOnClickOutside={!saving} closeOnEscape={!saving}>
      <Stack component="form" gap="md" onSubmit={submit}>
        <Text size="sm" c="dimmed">Completá los datos disponibles. Podés dejar los campos vacíos.</Text>
        <TextInput name="name" label="Nombre" maxLength={120} disabled={saving} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput name="email" label="Correo electrónico" type="email" maxLength={254} disabled={saving} />
          <TextInput name="phone" label="Teléfono" type="tel" maxLength={40} disabled={saving} />
        </SimpleGrid>
        <Textarea name="needs" label="Necesidades" maxLength={2000} disabled={saving} />
        <TextInput name="urgency" label="Urgencia" maxLength={300} disabled={saving} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput name="budgetAmount" label="Presupuesto" type="number" min={0} max={maximumBudget} step="any"
            required={currency !== null} disabled={saving} />
          <Select label="Moneda" data={['ARS', 'USD']} value={currency} onChange={setCurrency} clearable disabled={saving} />
        </SimpleGrid>
        <Title order={3} size="h5">Origen del interesado</Title>
        <CaptureRequestState result={result} />
        <Select label="Campaña" placeholder="Sin campaña" data={campaignChoices} value={campaignId}
          onChange={selectCampaign} searchable clearable disabled={saving || (!result?.data && !campaign)} />
        {!saving && result?.data && <CampaignPager page={page} setPage={setPage} total={result.data.total} />}
        {origin?.error && <Alert color="red" role="alert">{origin.error}</Alert>}
        {campaignId && !origin && <Text size="sm" c="dimmed" role="status">Cargando canales y formularios…</Text>}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Canal" placeholder={channels.length ? 'Sin canal' : 'Sin canales disponibles'} data={channels}
            value={channel} onChange={(value) => { setChannel(value); setFormId(null); }} clearable
            disabled={saving || !channels.length} />
          {channel === 'form' && (
            <Select label="Formulario de origen" placeholder={forms.length ? 'Sin formulario' : 'Sin formularios disponibles'}
              data={forms} value={formId} onChange={setFormId} searchable clearable disabled={saving || !forms.length}
              description={campaignId ? undefined : 'Seleccioná una campaña para ver sus formularios.'} />
          )}
        </SimpleGrid>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving}>Registrar interesado</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
