import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Checkbox, Group, Loader, NumberInput, Paper, Select,
  SimpleGrid, Stack, Table, Text, Textarea, TextInput, Title,
} from '@mantine/core';
import { hasUnconfirmedFacts, qualificationApi, qualificationData } from './qualificationApi.js';
import {
  DEFAULT_FINANCING_TIERS, DEFAULT_URGENCY_TIERS, formatRuleCriterion, formatRuleOption,
  mergeRuleSets, previewQualification, ruleMaxPoints, scoringCriteria,
} from './ruleSelection.js';
import { conversationSuggestions } from '../chat/conversationSuggestions.js';
import { leadRoute } from '../workspace/workspaceRoute.js';
import '../dashboard/dashboard.css';
import './qualification.css';

const decisions = {
  qualified: 'Calificado',
  review: 'En revisión',
  not_qualified: 'No calificado',
  pending: 'Pendiente',
};

const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const leadLabel = ({ name, email, phone }) => name || email || phone || 'Interesado sin nombre';
const confirmedFacts = (lead) => ({
  email: lead.email ?? '',
  phone: lead.phone ?? '',
  needs: lead.needs ?? '',
  urgency: lead.urgency ?? '',
  zone: lead.zone ?? '',
  financing: lead.financing ?? '',
  customChecks: { ...(lead.customChecks ?? {}) },
  budgetAmount: lead.budgetAmount ?? '',
  budgetCurrency: lead.budgetCurrency ?? null,
});

function breakdownText(entry) {
  const label = entry.name || scoringCriteria[entry.type] || entry.type;
  const currency = entry.currency ? ` (${entry.currency})` : '';
  if (entry.points == null) {
    return `${label}${currency}: ${entry.status === 'pending' ? 'pendiente' : 'no aplica'}`;
  }
  return `${label}${currency}: ${entry.points >= 0 ? '+' : ''}${entry.points} pts`;
}

export function QualificationScreen({ accessToken, onUnauthorized, initialLeadId, publishedRules }) {
  const api = useMemo(() => qualificationApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [leads, setLeads] = useState(null);
  const [leadId, setLeadId] = useState(initialLeadId ?? null);
  const [fetchedRuleSets, setFetchedRuleSets] = useState(null);
  const [selectedRuleVersion, setSelectedRuleVersion] = useState(null);
  const [error, setError] = useState('');
  const [ruleSetsError, setRuleSetsError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.leads(controller.signal),
      api.ruleSets(controller.signal),
    ]).then(([leadsResult, rulesResult]) => {
      if (controller.signal.aborted) return;
      if (leadsResult.status === 'fulfilled') {
        const rows = leadsResult.value;
        setLeads(rows);
        setLeadId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          return initialLeadId && rows.some((row) => row.id === initialLeadId)
            ? initialLeadId
            : rows[0]?.id ?? null;
        });
      } else {
        setError(leadsResult.reason.message);
      }

      if (rulesResult.status === 'fulfilled') {
        setFetchedRuleSets(rulesResult.value);
      } else {
        setFetchedRuleSets([]);
        setRuleSetsError(rulesResult.reason.message);
      }
    });
    return () => controller.abort();
  }, [api, initialLeadId]);

  const ruleSets = useMemo(
    () => mergeRuleSets(fetchedRuleSets ?? [], publishedRules ?? []),
    [fetchedRuleSets, publishedRules],
  );
  const defaultRule = ruleSets.find((rule) => rule.status === 'active') ?? ruleSets[0] ?? null;
  const activeRuleSet = ruleSets.find((rule) => String(rule.version) === selectedRuleVersion) ?? defaultRule;
  const lead = leads?.find(({ id }) => id === leadId) ?? null;

  return (
    <Stack gap="md">
      <header>
        <Text size="xs" fw={700} className="auth-label">EVALUACIÓN COMERCIAL</Text>
        <Title order={1}>Calificar interesado</Title>
        <Text c="dimmed" size="sm" mt={4}>
          Editá o confirmá los datos comerciales, simulá el puntaje en vivo con tus reglas publicadas y guardá el resultado en el historial.
        </Text>
      </header>

      {error && <Alert color="red" role="alert">{error}</Alert>}
      {ruleSetsError && <Alert color="yellow" role="status">No se pudieron cargar las reglas publicadas: {ruleSetsError}</Alert>}

      {!leads && !error ? (
        <Paper className="qual-card" withBorder><Loader size="sm" aria-label="Cargando interesados" /></Paper>
      ) : leads?.length === 0 ? (
        <Paper className="qual-card" withBorder>
          <Text c="dimmed" size="sm">Todavía no hay interesados registrados para calificar.</Text>
        </Paper>
      ) : lead && (
        <LeadQualification
          key={lead.id}
          api={api}
          lead={lead}
          leads={leads}
          onSelectLead={setLeadId}
          ruleSets={ruleSets}
          ruleSetsLoaded={fetchedRuleSets !== null}
          activeRuleSet={activeRuleSet}
          onSelectRuleVersion={setSelectedRuleVersion}
          onFactsSaved={(saved) => setLeads((current) => current.map((row) => row.id === saved.id ? { ...row, ...saved } : row))}
        />
      )}
    </Stack>
  );
}

function LeadQualification({
  api, lead, leads, onSelectLead, ruleSets, ruleSetsLoaded, activeRuleSet, onSelectRuleVersion, onFactsSaved,
}) {
  const [conversations, setConversations] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState(null);
  const [history, setHistory] = useState(null);
  const [facts, setFacts] = useState(() => confirmedFacts(lead));
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [message, setMessage] = useState('');
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState('');

  const draftChanged = hasUnconfirmedFacts(facts, lead);
  const preview = useMemo(() => previewQualification(facts, activeRuleSet), [facts, activeRuleSet]);
  const setFact = (name) => (value) => setFacts((current) => ({ ...current, [name]: value }));

  useEffect(() => {
    const controller = new AbortController();
    api.conversations(lead.id, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      setConversations(rows);
      setConversationId(rows.at(-1)?.id ?? null);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    api.history(lead.id, controller.signal).then((rows) => {
      if (!controller.signal.aborted) setHistory(rows);
    }).catch((failure) => {
      if (!controller.signal.aborted) setHistoryError(failure.message);
    });
    return () => controller.abort();
  }, [api, lead.id]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const controller = new AbortController();
    Promise.allSettled([
      api.conversationContext(conversationId, controller.signal),
      api.messages(conversationId, controller.signal),
    ]).then(([contextResult, messagesResult]) => {
      if (controller.signal.aborted) return;
      if (contextResult.status === 'fulfilled') {
        setContext({ conversationId, facts: conversationSuggestions(contextResult.value.context) });
        setContextError('');
      } else {
        setContextError(contextResult.reason.message);
      }
      if (messagesResult.status === 'fulfilled') {
        setMessages(messagesResult.value);
      } else {
        setMessages([]);
      }
    });
    return () => controller.abort();
  }, [api, conversationId]);

  async function saveDraftOnly() {
    if (pending) return;
    setPending('facts');
    setError('');
    setMessage('');
    try {
      const saved = await api.saveFacts(lead.id, conversationId, qualificationData(facts));
      setFacts(confirmedFacts({ ...lead, ...saved }));
      onFactsSaved(saved);
      setMessage('Datos comerciales confirmados.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending('');
    }
  }

  async function saveAndQualify(event) {
    event.preventDefault();
    if (pending || (!history && !historyError)) return;
    if (!activeRuleSet) {
      await saveDraftOnly();
      return;
    }
    setPending('score');
    setError('');
    setMessage('');
    try {
      if (draftChanged) {
        const saved = await api.saveFacts(lead.id, conversationId, qualificationData(facts));
        setFacts(confirmedFacts({ ...lead, ...saved }));
        onFactsSaved(saved);
      }
      const result = await api.qualify(lead.id, activeRuleSet.version);
      setHistory((current) => [result, ...(current ?? [])]);
      if (historyError) setHistoryError('No se pudo recuperar el historial previo.');
      setMessage(
        result.score == null
          ? `Calificación v${result.ruleSetVersion} registrada como pendiente.`
          : `Calificación guardada: ${result.score} pts (${decisions[result.decision] ?? result.decision}).`,
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending('');
    }
  }

  const urgencyRule = activeRuleSet?.rules?.find((r) => r.type === 'urgencyTiers');
  const financingRule = activeRuleSet?.rules?.find((r) => r.type === 'financingTiers');
  const zonesRule = activeRuleSet?.rules?.find((r) => r.type === 'priorityZones');
  const customRules = activeRuleSet?.rules?.filter((r) => r.type === 'customCriteria') ?? [];

  const urgencySelectData = (urgencyRule?.tiers ?? DEFAULT_URGENCY_TIERS).map((t) => ({
    value: t.key, label: t.label ?? t.key,
  }));
  if (facts.urgency && !urgencySelectData.some((item) => item.value === facts.urgency)) {
    urgencySelectData.unshift({ value: facts.urgency, label: facts.urgency });
  }

  const financingSelectData = (financingRule?.tiers ?? DEFAULT_FINANCING_TIERS).map((t) => ({
    value: t.key, label: t.label ?? t.key,
  }));
  if (facts.financing && !financingSelectData.some((item) => item.value === facts.financing)) {
    financingSelectData.unshift({ value: facts.financing, label: facts.financing });
  }

  const suggested = context?.conversationId === conversationId ? context.facts : {};
  const hudPercent = preview?.score != null && activeRuleSet?.threshold > 0
    ? Math.min(100, Math.max(0, Math.round((preview.score / activeRuleSet.threshold) * 100)))
    : 0;
  const recentMessages = messages?.slice(-2) ?? [];
  const canSubmitPrimary = Boolean(!pending && (history || historyError) && (activeRuleSet || draftChanged));

  return (
    <Stack gap="md">
      <Paper className="qual-card" withBorder>
        <div className="qual-topbar">
          <div className="qual-selectors">
            <Select
              label="Interesado"
              searchable
              allowDeselect={false}
              aria-label="Seleccionar interesado"
              value={lead.id}
              onChange={(value) => value && onSelectLead(value)}
              data={leads.map((row) => ({ value: row.id, label: leadLabel(row) }))}
            />
            {ruleSets.length > 0 ? (
              <Select
                label="Regla publicada (simulación en vivo)"
                allowDeselect={false}
                disabled={!!pending}
                value={String(activeRuleSet.version)}
                onChange={onSelectRuleVersion}
                data={ruleSets.map((ruleSet) => ({
                  value: String(ruleSet.version),
                  label: formatRuleOption(ruleSet),
                }))}
              />
            ) : (
              <Stack gap={6}>
                <Text size="xs" fw={500} c="dimmed">Regla publicada</Text>
                {!ruleSetsLoaded ? (
                  <Text size="sm" c="dimmed">Cargando reglas…</Text>
                ) : (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">Sin reglas publicadas</Text>
                    <Button component="a" href={leadRoute('reglas', lead.id)} variant="light" size="compact-sm">
                      Crear regla
                    </Button>
                  </Group>
                )}
              </Stack>
            )}
          </div>

          <div className="qual-hud">
            <div className="qual-hud-label">
              {activeRuleSet ? `Puntaje simulado (v${activeRuleSet.version})` : 'Sin regla seleccionada'}
              {draftChanged ? ' · borrador' : ''}
            </div>
            <div className="qual-hud-value">
              <span className="qual-hud-number">
                {preview ? (preview.score == null ? '—' : preview.score) : '—'}
              </span>
              {activeRuleSet && (
                <span className="qual-hud-threshold">/ {activeRuleSet.threshold} pts</span>
              )}
              {preview && (
                <span className="qual-status" data-decision={preview.decision}>
                  {decisions[preview.decision] ?? preview.decision}
                </span>
              )}
            </div>
            <div className="qual-score-track" aria-hidden="true">
              <div
                className="qual-score-fill"
                data-decision={preview?.decision ?? 'pending'}
                style={{ width: `${hudPercent}%` }}
              />
            </div>
          </div>
        </div>
      </Paper>

      {error && <Alert color="red" role="alert">{error}</Alert>}
      {message && <Alert color="green" role="status">{message}</Alert>}

      <div className="qual-main-grid">
        <Paper component="form" onSubmit={saveAndQualify} className="qual-card" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Title order={2} size="h4">Borrador editable de datos</Title>
                <Text size="xs" c="dimmed" mt={2}>
                  Editá los campos afectados por las reglas para simular el puntaje en vivo y guardar en el historial.
                </Text>
              </div>
              {conversations?.length > 1 && (
                <Select
                  aria-label="Conversación"
                  size="xs"
                  value={conversationId}
                  disabled={!!pending}
                  allowDeselect={false}
                  onChange={(value) => {
                    setContextError('');
                    setMessages(null);
                    setFacts(confirmedFacts(lead));
                    setConversationId(value);
                  }}
                  data={conversations.map(({ id }, index) => ({
                    value: id,
                    label: `Conversación ${index + 1}`,
                  }))}
                />
              )}
            </Group>

            {contextError && <Text size="xs" c="dimmed">Contexto del asistente: {contextError}</Text>}
            {Object.keys(suggested).length > 0 && (
              <div className="qual-assistant-hint">
                <div>
                  <Text size="xs" fw={600}>Sugerencias detectadas por el asistente</Text>
                  <Text size="xs" c="dimmed">Podés cargarlas al borrador y revisarlas antes de confirmar.</Text>
                </div>
                <Button
                  type="button"
                  variant="light"
                  size="compact-sm"
                  disabled={!!pending}
                  onClick={() => setFacts((current) => ({ ...current, ...suggested }))}
                >
                  Cargar borrador IA
                </Button>
              </div>
            )}

            <Textarea
              label="Necesidad / propiedad buscada"
              placeholder="Ej. Departamento 2 ambientes en Palermo"
              minRows={2}
              maxLength={2000}
              disabled={!!pending}
              value={facts.needs}
              onChange={(event) => setFact('needs')(event.currentTarget.value)}
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <div>
                <TextInput
                  label="Zona de interés"
                  placeholder="Ej. Palermo, Belgrano…"
                  maxLength={120}
                  disabled={!!pending}
                  value={facts.zone}
                  onChange={(event) => setFact('zone')(event.currentTarget.value)}
                />
                {zonesRule?.zones?.length > 0 && (
                  <div className="qual-zone-suggestions">
                    {zonesRule.zones.map((zone) => (
                      <button
                        key={zone}
                        type="button"
                        className={`rules-zone-chip is-clickable ${facts.zone.toLowerCase() === zone.toLowerCase() ? 'is-selected' : ''}`}
                        onClick={() => setFact('zone')(zone)}
                      >
                        {zone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Select
                label="Financiación / operación"
                placeholder="Seleccionar modalidad…"
                clearable
                disabled={!!pending}
                data={financingSelectData}
                value={facts.financing || null}
                onChange={(value) => setFact('financing')(value ?? '')}
              />
              <Select
                label="Urgencia / plazo"
                placeholder="Seleccionar plazo…"
                clearable
                disabled={!!pending}
                data={urgencySelectData}
                value={facts.urgency || null}
                onChange={(value) => setFact('urgency')(value ?? '')}
              />
              <Group gap="xs" grow wrap="nowrap" align="flex-end">
                <NumberInput
                  label="Presupuesto"
                  placeholder="145000"
                  min={0}
                  max={1_000_000_000_000}
                  disabled={!!pending}
                  value={facts.budgetAmount}
                  onChange={setFact('budgetAmount')}
                />
                <Select
                  label="Moneda"
                  placeholder="Sin definir"
                  data={['USD', 'ARS']}
                  clearable
                  disabled={!!pending}
                  value={facts.budgetCurrency}
                  onChange={setFact('budgetCurrency')}
                  style={{ maxWidth: 112 }}
                />
              </Group>
            </SimpleGrid>

            {customRules.length > 0 && (
              <div className="qual-custom-list">
                <Text size="xs" fw={600} c="dimmed">Criterios personalizados de la regla activa</Text>
                {customRules.map((rule) => {
                  const key = rule.id ?? rule.name;
                  return (
                    <Checkbox
                      key={key}
                      disabled={!!pending}
                      checked={Boolean(facts.customChecks?.[key] ?? facts.customChecks?.[rule.name])}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setFacts((current) => ({
                          ...current,
                          customChecks: { ...(current.customChecks ?? {}), [key]: checked },
                        }));
                      }}
                      label={`${rule.name} (+${rule.points} pts)${rule.condition ? ` — ${rule.condition}` : ''}`}
                    />
                  );
                })}
              </div>
            )}

            <Text size="xs" c="dimmed">
              Los campos vacíos no sobrescriben datos ya guardados. Si falta un dato requerido por la regla, queda pendiente.
            </Text>

            <Group justify="space-between" align="center" wrap="wrap" pt={4}>
              <Button component="a" href={leadRoute('chat', lead.id)} variant="default" size="sm">
                Ver conversación
              </Button>
              <Group gap="xs">
                {draftChanged && activeRuleSet && (
                  <Button
                    type="button"
                    variant="subtle"
                    size="sm"
                    disabled={!!pending}
                    loading={pending === 'facts'}
                    onClick={saveDraftOnly}
                  >
                    Solo confirmar datos
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canSubmitPrimary}
                  loading={pending === 'score' || (!activeRuleSet && pending === 'facts')}
                >
                  {draftChanged
                    ? (activeRuleSet ? 'Confirmar datos y guardar puntaje' : 'Confirmar datos')
                    : 'Guardar puntaje'}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Paper>

        <Stack gap="md">
          <Paper className="qual-card" withBorder>
            <Stack gap="sm">
              <div>
                <Group justify="space-between" align="center">
                  <Title order={2} size="h4">
                    {activeRuleSet ? `Desglose por regla (v${activeRuleSet.version})` : 'Desglose por regla'}
                  </Title>
                  {activeRuleSet && (
                    <Button component="a" href={leadRoute('reglas', lead.id)} variant="subtle" size="compact-xs">
                      Editar reglas
                    </Button>
                  )}
                </Group>
                <Text size="xs" c="dimmed" mt={2}>
                  {activeRuleSet
                    ? `Calificado ≥ ${activeRuleSet.threshold} pts${activeRuleSet.discardThreshold != null ? ` · Descartado < ${activeRuleSet.discardThreshold} pts` : ''} · ${activeRuleSet.rules.length} criterio(s)`
                    : 'Publicá una regla en Reglas de puntaje para ver el desglose.'}
                </Text>
              </div>

              {preview && (
                <Stack gap="xs">
                  {preview.breakdown.map((entry, idx) => {
                    const rule = activeRuleSet.rules.find((item) => (
                      item.type === entry.type &&
                      (item.currency ?? null) === (entry.currency ?? null) &&
                      (item.type !== 'customCriteria' || (item.id ?? item.name) === (entry.id ?? entry.name))
                    ));
                    const maxPts = rule ? ruleMaxPoints(rule) : 0;
                    const fillPct = entry.status === 'evaluated' && maxPts > 0 && entry.points > 0
                      ? Math.min(100, Math.round((entry.points / maxPts) * 100))
                      : 0;
                    const rightLabel = entry.status === 'pending'
                      ? 'Pendiente'
                      : entry.status === 'not_applicable'
                        ? 'No aplica'
                        : `${entry.points >= 0 ? '+' : ''}${entry.points} / ${maxPts}`;
                    return (
                      <div key={`${entry.type}:${entry.currency ?? entry.id ?? entry.name ?? idx}`}>
                        <Group justify="space-between" mb={4} gap="xs">
                          <Text size="xs" c="dimmed">{formatRuleCriterion(entry)}</Text>
                          <Text size="xs" className="qual-mono">{rightLabel}</Text>
                        </Group>
                        <div className="qual-score-track">
                          <div
                            className="qual-score-fill"
                            data-decision={entry.status === 'evaluated' && entry.points >= maxPts && maxPts > 0 ? 'qualified' : 'pending'}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper className="qual-card" withBorder>
            <Stack gap="sm">
              <Title order={2} size="h4">Últimos mensajes</Title>
              {!conversationId ? (
                <Text size="xs" c="dimmed">Sin conversación iniciada.</Text>
              ) : !messages ? (
                <Loader size="xs" aria-label="Cargando mensajes" />
              ) : recentMessages.length === 0 ? (
                <Text size="xs" c="dimmed">Todavía no hay mensajes en esta conversación.</Text>
              ) : (
                <Stack gap="xs">
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className="qual-msg-box">
                      <Text size="xs" fw={600} c="dimmed" mb={2}>
                        {msg.role === 'lead'
                          ? leadLabel(lead)
                          : msg.turnResult?.humanReviewRequired ? 'Revisión humana' : 'Asistente'}
                      </Text>
                      <Text size="xs">{msg.content}</Text>
                    </div>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        </Stack>
      </div>

      <Paper className="qual-card qual-history-card" withBorder>
        <div className="qual-history-head">
          <div>
            <Title order={2} size="h4">Historial de calificaciones — {leadLabel(lead)}</Title>
            <Text size="xs" c="dimmed" mt={2}>Cada evaluación conserva los puntos y la versión de reglas aplicada.</Text>
          </div>
          {history && <span className="qual-tag qual-mono">{history.length} evaluaciones</span>}
        </div>
        {historyError && <Alert color="red" m="md">{historyError}</Alert>}
        {!history && !historyError && <Loader size="sm" m="md" aria-label="Cargando historial" />}
        {history?.length === 0 && (
          <Text c="dimmed" size="sm" ta="center" py="lg">Sin calificaciones confirmadas aún.</Text>
        )}
        {history?.length > 0 && (
          <Table.ScrollContainer minWidth={720}>
            <Table className="dashboard-inbox-table" highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Versión de regla</Table.Th>
                  <Table.Th>Puntaje</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Desglose</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td className="qual-mono" style={{ color: '#a1a1aa' }}>
                      {item.createdAt ? dateFormatter.format(new Date(item.createdAt)) : '—'}
                    </Table.Td>
                    <Table.Td><span className="qual-tag qual-mono">v{item.ruleSetVersion}</span></Table.Td>
                    <Table.Td className="qual-mono" style={{ fontWeight: 600 }}>
                      {item.score == null ? 'Pendiente' : `${item.score} pts`}
                    </Table.Td>
                    <Table.Td>
                      <span className="qual-status" data-decision={item.decision}>
                        {decisions[item.decision] ?? item.decision}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {item.breakdown?.map(breakdownText).join(' · ') || '—'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </Stack>
  );
}
