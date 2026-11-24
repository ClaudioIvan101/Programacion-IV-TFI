import { Alert, Button, Group, Paper, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { dashboardApi, loadLeadOverview } from './dashboardApi.js';
import './dashboard.css';

export function Dashboard({ accessToken, onUnauthorized }) {
  const api = useMemo(() => dashboardApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadLeadOverview(api, controller.signal).then((result) => {
      if (!controller.signal.aborted) setCounts(result.counts);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [api, revision]);

  function refresh() {
    setError('');
    setLoading(true);
    setRevision((value) => value + 1);
  }

  return (
    <section aria-labelledby="dashboard-title">
      <Group justify="space-between" align="end" mb="xl">
        <div>
          <Text className="auth-label" fw={700} size="xs">SEGUIMIENTO COMERCIAL</Text>
          <Title id="dashboard-title" order={1}>Resumen de interesados</Title>
          <Text c="dimmed" size="sm" mt={4}>Estado según la última calificación guardada.</Text>
        </div>
        <Button variant="light" loading={loading} onClick={refresh}>Actualizar</Button>
      </Group>
      {error && <Alert color="red" role="alert" mb="md">{error}</Alert>}
      <div className="dashboard-counts">
        {[
          ['Total de leads', counts?.total],
          ['Calificados', counts?.qualified],
          ['Pendientes', counts?.pending],
        ].map(([label, count]) => (
          <Paper className="dashboard-panel dashboard-count" withBorder key={label}>
            <Text size="sm" fw={600} c="dimmed">{label}</Text>
            <Text className="dashboard-count-value" fw={700}>{count ?? '—'}</Text>
          </Paper>
        ))}
      </div>
      {counts?.qualified === null && (
        <Alert color="yellow" role="status" mt="sm">No se pudo consultar toda la calificación. El total de leads sigue disponible.</Alert>
      )}
    </section>
  );
}
