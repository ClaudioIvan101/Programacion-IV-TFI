import { Alert, Button, Group, Loader, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { leadLabel } from '../dashboard/dashboardApi.js';
import { leadRoute } from '../workspace/workspaceRoute.js';
import { conversationSuggestions } from './conversationSuggestions.js';
import { TurnJson, TurnResult } from './TurnResult.jsx';

export function ConversationPanel({ api, lead }) {
  const [conversations, setConversations] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.listConversations(lead.id, controller.signal).then((history) => {
      if (controller.signal.aborted) return;
      setConversations(history);
      setConversationId(history.at(-1)?.id ?? null);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api, lead.id, attempt]);

  async function startConversation() {
    setBusy(true);
    setError('');
    try {
      const conversation = await api.createConversation(lead.id);
      setConversations((current) => [...current, conversation]);
      setConversationId(conversation.id);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper className="dashboard-panel" withBorder component="section" aria-label="Chat">
      <Stack>
        <div>
          <Text className="auth-label" size="xs" fw={700}>CHAT</Text>
          <Title order={2}>{leadLabel(lead)}</Title>
          <Button component="a" href={leadRoute('calificacion', lead.id)} variant="subtle" size="compact-sm" mt="xs">Revisar y calificar</Button>
        </div>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        {!conversations && (error
          ? <Button variant="light" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Reintentar</Button>
          : <Loader size="sm" aria-label="Cargando conversaciones" />)}
        {conversations?.length === 0 && (
          <Button variant="light" loading={busy} onClick={startConversation}>Abrir conversación</Button>
        )}
        {conversations?.length > 0 && (
          <Select label="Conversación" value={conversationId} onChange={setConversationId} allowDeselect={false}
            data={conversations.map(({ id, createdAt }, index) => ({
              value: id,
              label: 'Conversación ' + (index + 1) + ' · ' + new Date(createdAt).toLocaleString('es-AR'),
            }))} />
        )}
        {conversationId && <MessageThread key={conversationId} api={api} conversationId={conversationId} leadId={lead.id} />}
      </Stack>
    </Paper>
  );
}

function MessageThread({ api, conversationId, leadId }) {
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [revision, setRevision] = useState(0);
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState('');
  const lastTurn = messages?.findLast((message) => message.turnResult)?.turnResult;
  const humanReviewRequired = lastTurn?.humanReviewRequired === true;

  useEffect(() => {
    const controller = new AbortController();
    api.listMessages(conversationId, controller.signal).then((history) => {
      if (controller.signal.aborted) return;
      setMessages(history);
      setConflict(false);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    api.conversationContext(conversationId, controller.signal).then(({ context: persisted }) => {
      if (!controller.signal.aborted) {
        setContext(persisted);
        setContextError('');
      }
    }).catch((failure) => {
      if (!controller.signal.aborted) setContextError(failure.message);
    });
    return () => controller.abort();
  }, [api, conversationId, revision]);

  function refresh() {
    setMessages(null);
    setError('');
    setRevision((value) => value + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.trim() || isSending || conflict || !messages) return;
    setIsSending(true);
    setError('');
    try {
      await api.sendMessage(conversationId, draft.trim());
      setDraft('');
      refresh();
    } catch (failure) {
      if (failure.status === 409) setConflict(true);
      setError(failure.message);
    } finally {
      setIsSending(false);
    }
  }

  const suggested = conversationSuggestions(context);
  return (
    <div className="chat-thread-columns">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Historial</Text>
          <Button size="compact-sm" variant="subtle" disabled={isSending} onClick={refresh}>Actualizar historial</Button>
        </Group>
        <div className="dashboard-history" role="log" aria-label="Historial de conversación">
          {!messages && !error && <Loader size="sm" aria-label="Cargando historial" />}
          {messages?.length === 0 && <Text c="dimmed" size="sm">Todavía no hay mensajes.</Text>}
          {messages?.map((message) => (
            <div key={message.id} className={'dashboard-message' + (message.role === 'lead' ? ' dashboard-message-lead' : '')}>
              <Text size="xs" fw={700}>{message.role === 'lead' ? 'Interesado'
                : message.turnResult?.humanReviewRequired ? 'Revisión humana' : 'Asistente'}</Text>
              <Text size="sm">{message.content}</Text>
              {message.turnResult && <TurnJson turn={message.turnResult} />}
            </div>
          ))}
        </div>
        {error && <Alert role="alert" color="red">{error}</Alert>}
        <form onSubmit={submit}>
          <Stack gap="xs">
            <Textarea label="Mensaje del interesado" value={draft} maxLength={4000}
              disabled={isSending} onChange={(event) => setDraft(event.currentTarget.value)} />
            <Button type="submit" loading={isSending} disabled={!draft.trim() || !messages || conflict}>Enviar al asistente</Button>
          </Stack>
        </form>
      </Stack>
      <Stack gap="sm">
        <Paper p="sm" withBorder>
          <Text size="sm" fw={700}>Contexto del asistente</Text>
          <Text size="xs" c="dimmed">Datos del interesado que el asistente usa para continuar. No cambian el puntaje por sí solos.</Text>
          {contextError ? <Text size="xs" c="dimmed">{contextError}</Text> :
            Object.keys(suggested).length === 0 ? <Text size="sm" mt={4}>Todavía no hay datos para revisar.</Text> :
            <Stack gap={4} mt="xs">
              {suggested.needs && <Text size="sm">Necesidad: {suggested.needs}</Text>}
              {suggested.urgency && <Text size="sm">Urgencia: {suggested.urgency}</Text>}
              {suggested.budgetAmount != null && <Text size="sm">Presupuesto: {suggested.budgetAmount} {suggested.budgetCurrency ?? '(moneda sin confirmar)'}</Text>}
            </Stack>}
        </Paper>
        {humanReviewRequired
          ? <Alert color="yellow" title="Revisión humana requerida" role="status">
            <Text size="sm">El mensaje se guardó sin agregar datos al contexto. Podés continuar con la calificación manual.</Text>
            <Button component="a" href={leadRoute('calificacion', leadId)} variant="light" size="compact-sm" mt="xs">
              Ir a calificación manual
            </Button>
          </Alert>
          : lastTurn && <TurnResult turn={lastTurn} />}
      </Stack>
    </div>
  );
}
