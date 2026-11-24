import { Alert, Button, Group, Loader, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { leadLabel } from '../dashboard/dashboardApi.js';
import { TurnResult } from './TurnResult.jsx';

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
        {conversationId && <MessageThread key={conversationId} api={api} conversationId={conversationId} />}
      </Stack>
    </Paper>
  );
}

function MessageThread({ api, conversationId }) {
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lastTurn, setLastTurn] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.listMessages(conversationId, controller.signal).then((history) => {
      if (controller.signal.aborted) return;
      setMessages(history);
      setConflict(false);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
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
      const result = await api.sendMessage(conversationId, draft.trim());
      setLastTurn(result);
      setDraft('');
      refresh();
    } catch (failure) {
      if (failure.status === 409) setConflict(true);
      setError(failure.message);
    } finally {
      setIsSending(false);
    }
  }

  return (
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
            <Text size="xs" fw={700}>{message.role === 'lead' ? 'Interesado' : 'Asistente'}</Text>
            <Text size="sm">{message.content}</Text>
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
      {lastTurn && <TurnResult turn={lastTurn} />}
    </Stack>
  );
}
