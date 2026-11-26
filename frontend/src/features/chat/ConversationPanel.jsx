import { Alert, Button, Group, Loader, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { leadLabel } from '../dashboard/dashboardApi.js';
import { leadRoute } from '../workspace/workspaceRoute.js';
import { shouldSubmitChatOnKey } from './chatComposer.js';
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
    <Paper className="dashboard-panel chat-conversation-panel" withBorder component="section" aria-label="Chat">
      <Stack className="chat-conversation-content" gap="xs">
        <Group className="chat-conversation-heading" justify="space-between" gap="xs">
          <Title className="chat-lead-name" order={2} size="h4">{leadLabel(lead)}</Title>
          <Button component="a" href={leadRoute('calificacion', lead.id)} variant="subtle" size="compact-sm">Revisar y calificar</Button>
        </Group>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        {!conversations && (error
          ? <Button variant="light" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Reintentar</Button>
          : <Loader size="sm" aria-label="Cargando conversaciones" />)}
        {conversations?.length === 0 && (
          <Button variant="light" loading={busy} onClick={startConversation}>Abrir conversación</Button>
        )}
        {conversations?.length > 0 && (
          <Select label="Conversación" size="xs" value={conversationId} onChange={setConversationId} allowDeselect={false}
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
  const [contextOpen, setContextOpen] = useState(false);
  const canSend = Boolean(draft.trim() && messages && !isSending && !conflict);
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
    if (!canSend) return;
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

  function handleComposerKeyDown(event) {
    if (!shouldSubmitChatOnKey(event, canSend)) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const suggested = conversationSuggestions(context);
  return (
    <div className="chat-thread-columns" data-context-open={contextOpen}>
      <Stack className="chat-thread-main" gap="xs">
        <Group justify="space-between">
          <Text fw={600}>Historial</Text>
          <Group gap={4}>
            <Button size="compact-sm" variant="subtle" disabled={isSending} onClick={refresh}>Actualizar historial</Button>
            <Button className="chat-context-toggle" variant="default" size="compact-sm"
              aria-expanded={contextOpen} aria-controls="chat-context" onClick={() => setContextOpen((open) => !open)}>
              {contextOpen ? 'Ocultar contexto' : 'Ver contexto'}
            </Button>
          </Group>
        </Group>
        <div className="dashboard-history chat-history" role="log" aria-label="Historial de conversación" tabIndex={0}>
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
        {error && <Alert className="chat-send-error" role="alert" color="red">{error}</Alert>}
        <form className="chat-composer" onSubmit={submit}>
          <Group gap="xs" align="end" wrap="nowrap">
            <Textarea className="chat-composer-input" label="Mensaje del interesado" value={draft} maxLength={4000}
              rows={2} size="xs" disabled={isSending} onKeyDown={handleComposerKeyDown}
              onChange={(event) => setDraft(event.currentTarget.value)} />
            <Button type="submit" size="xs" loading={isSending} disabled={!canSend}>Enviar al asistente</Button>
          </Group>
        </form>
      </Stack>
      <Stack className="chat-context-panel" id="chat-context" gap="sm" tabIndex={0} role="region" aria-label="Contexto del asistente">
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
