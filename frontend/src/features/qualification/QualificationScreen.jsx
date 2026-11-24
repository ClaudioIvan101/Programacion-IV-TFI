import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Divider, Group, Loader, NumberInput, Paper, Select,
  SimpleGrid, Stack, Text, Textarea, Title,
} from '@mantine/core';
import { qualificationApi, qualificationData } from './qualificationApi.js';

const decisions = {
  qualified: ['Calificado', 'green'],
  not_qualified: ['No calificado', 'gray'],
  pending: ['Pendiente', 'yellow'],
};

const criteria = {
  hasNeeds: 'Necesidad registrada',
  hasUrgency: 'Urgencia registrada',
  minimumBudget: 'Presupuesto mínimo',
};

const leadLabel = ({ name, email, phone }) => name || email || phone || 'Interesado sin nombre';

export function QualificationScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => qualificationApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [leads, setLeads] = useState(null);
  const [leadId, setLeadId] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.leads(controller.signal).then((rows) => {
      if (!controller.signal.aborted) setLeads(rows);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api]);

  const lead = leads?.find(({ id }) => id === leadId);

  return (
    <Stack gap="xl">
      <header>
        <Text size="xs" fw={700} c="yellow.4" tt="uppercase">Evaluación comercial</Text>
        <Title order={1}>Calificación</Title>
        <Text c="dimmed" mt={4}>Confirme los datos del interesado y aplique una versión de reglas.</Text>
      </header>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Stack gap="lg">
          <Paper withBorder p="lg" radius="md" bg="dark.6">
            <Stack gap="sm">
              <Title order={2} size="h4">Interesado</Title>
              {error ? <Alert color="red">{error}</Alert> : !leads ? <Loader size="sm" /> : leads.length === 0
                ? <Text c="dimmed">Todavía no hay interesados.</Text>
                : <Select searchable aria-label="Seleccionar interesado" placeholder="Seleccionar interesado"
                    value={leadId} onChange={setLeadId}
                    data={leads.map((row) => ({ value: row.id, label: leadLabel(row) }))} />}
            </Stack>
          </Paper>
          {lead && <LeadQualification key={lead.id} api={api} lead={lead} version={version} setVersion={setVersion} onFactsSaved={(saved) => setLeads((current) => current.map((row) => row.id === saved.id ? { ...row, ...saved } : row))} />}
        </Stack>
        <PublishRule api={api} onPublished={setVersion} />
      </SimpleGrid>
    </Stack>
  );
}

function LeadQualification({ api, lead, version, setVersion, onFactsSaved }) {
  const [conversations, setConversations] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [history, setHistory] = useState(null);
  const [facts, setFacts] = useState({
    needs: lead.needs ?? '', urgency: lead.urgency ?? '',
    budgetAmount: lead.budgetAmount ?? '', budgetCurrency: lead.budgetCurrency ?? null,
  });
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [message, setMessage] = useState('');
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

  async function saveFacts(event) {
    event.preventDefault();
    if (!conversationId || pending) return;
    setPending('facts');
    setError('');
    setMessage('');
    try {
      const saved = await api.saveFacts(lead.id, conversationId, qualificationData(facts));
      onFactsSaved(saved);
      setMessage('Datos confirmados.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending('');
    }
  }

  async function qualify(event) {
    event.preventDefault();
    if (pending || (!history && !historyError) || !Number.isInteger(Number(version)) || Number(version) < 1) return;
    setPending('score');
    setError('');
    setMessage('');
    try {
      const result = await api.qualify(lead.id, Number(version));
      setHistory((current) => [result, ...(current ?? [])]);
      if (historyError) setHistoryError('No se pudo recuperar el historial previo.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending('');
    }
  }

  return (
    <Stack gap="lg">
      {error && <Alert color="red">{error}</Alert>}
      {message && <Alert color="green">{message}</Alert>}
      <Paper component="form" onSubmit={saveFacts} withBorder p="lg" radius="md" bg="dark.6">
        <Stack>
          <Title order={2} size="h4">Confirmar datos</Title>
          {!conversations ? <Text c="dimmed">No hay conversaciones disponibles para confirmar datos.</Text> : !conversations.length ? (
            <Text c="dimmed">Abra una conversación en Chat antes de confirmar datos.</Text>
          ) : (
            <Select label="Conversación" value={conversationId} onChange={setConversationId} allowDeselect={false}
              data={conversations.map(({ id }, index) => ({ value: id, label: 'Conversación ' + (index + 1) }))} />
          )}
          <Textarea label="Necesidad" value={facts.needs} maxLength={2000} onChange={(event) => setFact('needs')(event.target.value)} />
          <Textarea label="Urgencia" value={facts.urgency} maxLength={300} onChange={(event) => setFact('urgency')(event.target.value)} />
          <SimpleGrid cols={2}>
            <NumberInput label="Presupuesto" min={0} max={1_000_000_000_000}
              value={facts.budgetAmount} onChange={setFact('budgetAmount')} />
            <Select label="Moneda" value={facts.budgetCurrency} onChange={setFact('budgetCurrency')} data={['ARS', 'USD']} clearable />
          </SimpleGrid>
          <Text size="xs" c="dimmed">Los campos vacíos no sobrescriben los datos guardados.</Text>
          <Button type="submit" variant="light" disabled={!conversationId || !!pending} loading={pending === 'facts'}>Confirmar datos</Button>
        </Stack>
      </Paper>
      <Paper component="form" onSubmit={qualify} withBorder p="lg" radius="md" bg="dark.6">
        <Stack>
          <Title order={2} size="h4">Calificar interesado</Title>
          <NumberInput label="Versión publicada" required min={1} max={2_147_483_647} allowDecimal={false}
            value={version} onChange={setVersion} placeholder="Ingrese la versión" />
          <Button type="submit" disabled={!Number.isInteger(Number(version)) || Number(version) < 1 || !!pending || (!history && !historyError)}
            loading={pending === 'score'}>Calificar</Button>
        </Stack>
      </Paper>
      <Paper withBorder p="lg" radius="md" bg="dark.6">
        <Stack gap="sm">
          <Title order={2} size="h4">Historial de calificaciones</Title>
          {historyError && <Alert color="red">{historyError}</Alert>}
          {!history && !historyError && <Loader size="sm" />}
          {history?.length === 0 && <Text c="dimmed">Todavía no hay calificaciones.</Text>}
          {history?.map((result, index) => {
            const [label, color] = decisions[result.decision] ?? ['Sin decisión', 'gray'];
            return (
              <Stack key={result.id} gap={6}>
                {index > 0 && <Divider />}
                <Group justify="space-between">
                  <Text fw={600}>Versión {result.ruleSetVersion}</Text>
                  <Badge color={color}>{label}</Badge>
                </Group>
                <Text size="sm">{result.score == null ? 'Sin puntaje' : result.score + ' puntos'}</Text>
                {result.breakdown?.map((item) => (
                  <Text key={item.type + ':' + (item.currency ?? '')} size="xs" c="dimmed">
                    {criteria[item.type]}{item.currency && ' (' + item.currency + ')'}:
                    {' '}{item.points == null ? (item.status === 'pending' ? 'pendiente' : 'no aplica') : item.points + ' puntos'}
                  </Text>
                ))}
              </Stack>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}

function PublishRule({ api, onPublished }) {
  const [type, setType] = useState('hasNeeds');
  const [threshold, setThreshold] = useState('');
  const [points, setPoints] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [minimumAmount, setMinimumAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(null);
  const [error, setError] = useState('');

  async function publish(event) {
    event.preventDefault();
    if (pending || threshold === '' || points === '' || (type === 'minimumBudget' && minimumAmount === '')) return;
    setPending(true);
    setError('');
    try {
      const rule = { type, points: Number(points) };
      if (type === 'minimumBudget') Object.assign(rule, { currency, minimumAmount: Number(minimumAmount) });
      const result = await api.publish({ threshold: Number(threshold), rules: [rule] });
      setVersion(result.version);
      onPublished(result.version);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Paper component="form" onSubmit={publish} withBorder p="lg" radius="md" bg="dark.6" style={{ alignSelf: 'start' }}>
      <Stack>
        <Title order={2} size="h4">Publicar regla</Title>
        <Text size="sm" c="dimmed">Publique una versión con un criterio o use el número de una versión existente.</Text>
        {error && <Alert color="red">{error}</Alert>}
        {version != null && <Alert color="green">Versión {version} publicada.</Alert>}
        <Select label="Criterio" value={type} onChange={setType} allowDeselect={false}
          data={Object.entries(criteria).map(([value, label]) => ({ value, label }))} />
        {type === 'minimumBudget' && (
          <SimpleGrid cols={2}>
            <NumberInput label="Monto mínimo" required min={0} max={1_000_000_000_000}
              value={minimumAmount} onChange={setMinimumAmount} />
            <Select label="Moneda" value={currency} onChange={setCurrency} data={['ARS', 'USD']} allowDeselect={false} />
          </SimpleGrid>
        )}
        <SimpleGrid cols={2}>
          <NumberInput label="Umbral" required min={1} max={1_000_000} allowDecimal={false}
            value={threshold} onChange={setThreshold} />
          <NumberInput label="Puntos" required min={-1_000_000} max={1_000_000} allowDecimal={false}
            value={points} onChange={setPoints} />
        </SimpleGrid>
        <Button type="submit" loading={pending}>Publicar versión</Button>
      </Stack>
    </Paper>
  );
}

