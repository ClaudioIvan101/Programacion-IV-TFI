import { Alert, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { dashboardApi, leadLabel } from '../dashboard/dashboardApi.js';
import { ConversationPanel } from './ConversationPanel.jsx';
import { LeadRegistration } from './LeadRegistration.jsx';
import '../dashboard/dashboard.css';

export function ChatScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => dashboardApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [leads, setLeads] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = leads?.find(({ id }) => id === selectedId);

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
          <Text c="dimmed" size="sm" mt={4}>Seleccione un interesado para consultar sus conversaciones.</Text>
        </div>
        <Button onClick={() => { setNotice(''); setRegistering(true); }}>Nuevo interesado</Button>
      </Group>
      {notice && <Alert color="green" role="status">{notice}</Alert>}
      <div className="dashboard-grid">
        <Paper className="dashboard-panel" withBorder>
          <Stack gap="sm">
            <Title order={2} size="h4">Interesados</Title>
            {error && <Alert color="red" role="alert">{error}</Alert>}
            {error && <Button variant="light" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Reintentar</Button>}
            {!leads && !error && <Text role="status" size="sm">Cargando interesados…</Text>}
            {leads?.length === 0 && <Text c="dimmed" size="sm">Todavía no hay interesados registrados.</Text>}
            {leads?.length > 0 && (
              <Select label="Interesado" searchable data={leads.map((lead) => ({ value: lead.id, label: leadLabel(lead) }))}
                placeholder="Seleccione un interesado" value={selectedId} onChange={setSelectedId} />
            )}
          </Stack>
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
