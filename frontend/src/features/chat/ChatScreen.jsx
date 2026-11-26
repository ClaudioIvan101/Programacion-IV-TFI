import { Alert, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { dashboardApi, leadLabel } from '../dashboard/dashboardApi.js';
import { ConversationPanel } from './ConversationPanel.jsx';
import { LeadRegistration } from './LeadRegistration.jsx';
import '../dashboard/dashboard.css';
import './chat.css';

const channelLabels = { form: 'Formulario web', simulated_messaging: 'Mensajería simulada' };
const leadStatuses = {
  nuevo: 'Nuevo',
  'en calificación': 'En calificación',
  calificado: 'Calificado',
  'no calificado': 'No calificado',
  asignado: 'Asignado',
  cerrado: 'Cerrado',
};

export function ChatScreen({ accessToken, onUnauthorized, initialLeadId }) {
  const api = useMemo(() => dashboardApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [leads, setLeads] = useState(null);
  const [selectedId, setSelectedId] = useState(initialLeadId ?? null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const selected = leads?.find(({ id }) => id === selectedId);

  const query = search.trim().toLocaleLowerCase('es-AR');
  const visibleLeads = leads?.filter((lead) => leadLabel(lead).toLocaleLowerCase('es-AR').includes(query));

  useEffect(() => {
    const controller = new AbortController();
    api.listLeads(controller.signal).then((next) => {
      if (!controller.signal.aborted) setLeads(next);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [api, attempt]);

  function selectCreatedLead(lead) {
    setLeads((current) => [...(current ?? []).filter(({ id }) => id !== lead.id), lead]);
    setSelectedId(lead.id);
    setError('');
    setNotice('Interesado registrado.');
    setRegistering(false);
    setAttempt((value) => value + 1);
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text className="auth-label" size="xs" fw={700}>SEGUIMIENTO DE CONSULTAS</Text>
          <Title order={1}>Chat</Title>
          <Text c="dimmed" size="sm" mt={4}>El asistente conversa y propone datos; Express valida la respuesta. Confirme los datos antes de aplicar las reglas de calificación.</Text>
        </div>
      </Group>
      {notice && <Alert color="green" role="status">{notice}</Alert>}
      <div className="chat-layout">
        <Paper className="dashboard-panel chat-list-panel" withBorder component="section" aria-labelledby="chat-list-title">
          <Group className="chat-list-heading" justify="space-between" align="center" wrap="nowrap">
            <Title id="chat-list-title" order={2} size="h4">Interesados</Title>
            <Button aria-label="Nuevo interesado" size="compact-sm" onClick={() => { setNotice(''); setRegistering(true); }}>+ Nuevo</Button>
          </Group>
          <div className="chat-list-content">
            {error && <Alert color="red" role="alert">{error}</Alert>}
            {error && <Button variant="light" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Reintentar</Button>}
            {!leads && !error && <Text role="status" size="sm">Cargando interesados…</Text>}
            {leads?.length === 0 && <Text c="dimmed" size="sm">Todavía no hay interesados registrados.</Text>}
            {leads?.length > 0 && (
              <Stack gap="xs">
                <TextInput aria-label="Buscar interesado" placeholder="Buscar interesado" size="xs"
                  value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
                {visibleLeads.length === 0 && <Text c="dimmed" size="sm">No hay interesados que coincidan.</Text>}
                <ul className="chat-lead-list" aria-label="Interesados">
                  {visibleLeads.map((lead) => (
                    <li key={lead.id}>
                      <button type="button" className="chat-lead-row" aria-pressed={selected?.id === lead.id}
                        onClick={() => setSelectedId(lead.id)}>
                        <span className="chat-lead-name">{leadLabel(lead)}</span>
                        <span className="chat-lead-meta">
                          <span>{channelLabels[lead.channel] ?? 'Sin canal'}</span>
                          <span className="chat-lead-status" data-status={lead.status}>
                            {leadStatuses[lead.status] ?? 'Sin estado'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Stack>
            )}
          </div>
        </Paper>
        {selected
          ? <ConversationPanel key={selected.id} api={api} lead={selected} />
          : <Paper className="dashboard-panel" withBorder><Text c="dimmed" size="sm">El historial aparecerá al seleccionar un interesado.</Text></Paper>}
      </div>
      {registering && (
        <LeadRegistration accessToken={accessToken} onUnauthorized={onUnauthorized}
          onCreate={api.createLead} onCreated={selectCreatedLead} onClose={() => setRegistering(false)} />
      )}
    </Stack>
  );
}
