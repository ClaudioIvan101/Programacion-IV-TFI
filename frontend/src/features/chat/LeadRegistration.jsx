import { Alert, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CampaignPager, CaptureRequestState, useCampaignPage } from '../capture/campaignPage.jsx';
import { channelOptions, createCaptureApi } from '../capture/captureApi.js';
import { DEFAULT_FINANCING_TIERS, DEFAULT_URGENCY_TIERS } from '../qualification/ruleSelection.js';
import { leadContact } from './leadContact.js';
import './leadRegistration.css';

const urgencyOptions = DEFAULT_URGENCY_TIERS.map(({ key, label }) => ({ value: key, label }));
const financingOptions = DEFAULT_FINANCING_TIERS.map(({ key, label }) => ({ value: key, label }));

export function LeadRegistration({ accessToken, onUnauthorized, onCreate, onCreated, onClose }) {
  const api = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const { page, setPage, result } = useCampaignPage(api);
  const [campaign, setCampaign] = useState(null);
  const [channel, setChannel] = useState(null);
  const [formId, setFormId] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [zone, setZone] = useState('');
  const [urgency, setUrgency] = useState(null);
  const [financing, setFinancing] = useState(null);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const registration = useRef(null);
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
    const text = (name) => String(fields.get(name) ?? '').trim() || null;
    const leadName = text('name');
    if (!leadName || leadName.length < 2) {
      setError('Ingresá el nombre completo del interesado (al menos 2 caracteres).');
      return;
    }
    let contact;
    try {
      contact = leadContact(fields.get('contact'));
    } catch (failure) {
      setError(failure.message);
      return;
    }

    const hasAmount = budgetAmount !== '' && budgetAmount != null;
    if (budgetCurrency && !hasAmount) {
      setError('Ingresá el monto de presupuesto para indicar una moneda.');
      return;
    }

    const body = {
      name: leadName,
      ...contact,
      needs: text('needs'),
      zone: zone.trim() || null,
      financing: financing || null,
      urgency: urgency || null,
      budgetAmount: hasAmount ? Number(budgetAmount) : null,
      budgetCurrency: budgetCurrency || null,
      campaignId,
      channel,
      formId,
    };
    const snapshot = JSON.stringify(body);
    if (registration.current?.snapshot !== snapshot) {
      registration.current = { snapshot, id: crypto.randomUUID() };
    }
    setError('');
    setSaving(true);
    try {
      const lead = await onCreate(body, registration.current.id);
      onCreated(lead);
    } catch (failure) {
      setError(failure.message);
      setSaving(false);
    }
  }

  return (
    <Modal.Root opened onClose={onClose} size={540} centered
      closeOnClickOutside={!saving} closeOnEscape={!saving}>
      <Modal.Overlay backgroundOpacity={0.74} blur={8} />
      <Modal.Content className="lead-registration-dialog">
        <Modal.Header className="lead-registration-header">
          <Modal.Title>Registrar interesado manualmente</Modal.Title>
          <Button type="button" variant="default" size="compact-sm" onClick={onClose}
            disabled={saving}>Cerrar</Button>
        </Modal.Header>
        <Modal.Body className="lead-registration-body">
          <form onSubmit={submit}>
            <Stack className="lead-registration-fields" gap={12}>
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
                <TextInput data-autofocus required name="name" label="Nombre completo"
                  placeholder="Ej. Mariana Sosa" minLength={2} maxLength={120} disabled={saving} />
                <TextInput required name="contact" label="Correo o teléfono"
                  placeholder="mariana@ejemplo.com o +54 9 11..." maxLength={254} disabled={saving} />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
                <Select label="Campaña (opcional)" placeholder="Sin campaña / Orgánico" data={campaignChoices}
                  value={campaignId} onChange={selectCampaign} searchable clearable
                  disabled={saving || (!result?.data && !campaign)} />
                <Select label="Canal" placeholder={channels.length ? 'Sin canal' : 'Sin canales disponibles'} data={channels}
                  value={channel} onChange={(value) => { setChannel(value); setFormId(null); }} clearable
                  disabled={saving || !channels.length} />
              </SimpleGrid>
              {(!result || result.error) && <CaptureRequestState result={result} />}
              {!saving && result?.data && <CampaignPager page={page} setPage={setPage} total={result.data.total} />}
              {origin?.error && <Alert color="red" role="alert">{origin.error}</Alert>}
              {campaignId && !origin && <Text size="sm" c="dimmed" role="status">Cargando canales y formularios…</Text>}
              {campaignId && channel === 'form' && (
                <Select label="Formulario de origen" placeholder={forms.length ? 'Sin formulario' : 'Sin formularios disponibles'}
                  data={forms} value={formId} onChange={setFormId} searchable clearable disabled={saving || !forms.length} />
              )}
              <Textarea name="needs" label="Necesidad / propiedad buscada"
                placeholder="Ej. Departamento 2 ambientes con balcón..."
                minRows={2} maxLength={2000} disabled={saving} />
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
                <TextInput label="Zona de interés" placeholder="Ej. Palermo, Belgrano..."
                  maxLength={120} disabled={saving} value={zone} onChange={(event) => setZone(event.currentTarget.value)} />
                <Select label="Financiación / operación" placeholder="Seleccionar…" clearable
                  data={financingOptions} value={financing} onChange={setFinancing} disabled={saving} />
                <Select label="Urgencia / plazo" placeholder="Seleccionar…" clearable
                  data={urgencyOptions} value={urgency} onChange={setUrgency} disabled={saving} />
                <Group gap="xs" grow wrap="nowrap" align="flex-end">
                  <NumberInput label="Presupuesto" placeholder="145000" min={0} max={1_000_000_000_000}
                    disabled={saving} value={budgetAmount} onChange={setBudgetAmount} />
                  <Select label="Moneda" placeholder="USD/ARS" clearable data={['USD', 'ARS']}
                    disabled={saving} value={budgetCurrency} onChange={setBudgetCurrency} style={{ maxWidth: 108 }} />
                </Group>
              </SimpleGrid>
              {error && <Alert color="red" role="alert">{error}</Alert>}
            </Stack>
            <Group className="lead-registration-footer" justify="flex-end" gap="xs">
              <Button type="button" variant="default" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button type="submit" size="sm" loading={saving}>Crear y abrir Chat</Button>
            </Group>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
