import { Alert, Button, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { dashboardApi, leadLabel } from '../dashboard/dashboardApi.js';
import { ConversationPanel } from './ConversationPanel.jsx';
import '../dashboard/dashboard.css';

export function ChatScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => dashboardApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [leads, setLeads] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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

  return (
    <Stack gap="lg">
      <div>
        <Text className="auth-label" size="xs" fw={700}>SEGUIMIENTO DE CONSULTAS</Text>
        <Title order={1}>Chat</Title>
        <Text c="dimmed" size="sm" mt={4}>Seleccione un interesado para consultar sus conversaciones.</Text>
      </div>
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
    </Stack>
  );
}
