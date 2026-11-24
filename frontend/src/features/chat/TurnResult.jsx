import { Code, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';

const formatBudget = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 20 });
const fieldLabels = {
  contacto: 'Contacto',
  necesidades: 'Necesidades',
  presupuesto: 'Presupuesto',
  urgencia: 'Urgencia',
};

export function TurnResult({ turn }) {
  const { contacto, necesidades, presupuesto, urgencia } = turn.context;
  const fields = [
    ['Nombre', contacto?.nombre],
    ['Correo electrónico', contacto?.email],
    ['Teléfono', contacto?.telefono],
    ['Necesidades', necesidades],
    ['Presupuesto', presupuesto ? formatBudget.format(presupuesto.monto) : null],
    ['Moneda', presupuesto?.moneda],
    ['Urgencia', urgencia],
  ];

  return (
    <Paper component="section" withBorder p="sm" aria-labelledby="turn-result-title">
      <Stack gap="sm">
        <Title id="turn-result-title" order={3} size="h5">Información extraída</Title>
        <SimpleGrid component="dl" cols={{ base: 1, sm: 2 }} spacing="xs" m={0}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <Text component="dt" size="xs" c="dimmed">{label}</Text>
              <Text component="dd" size="sm" m={0}>{value ?? 'Sin informar'}</Text>
            </div>
          ))}
        </SimpleGrid>
        <div>
          <Text size="xs" c="dimmed">Campos faltantes del último turno</Text>
          <Text size="sm">{turn.missingFields.map((field) => fieldLabels[field]).join(', ') || 'Ninguno'}</Text>
        </div>
        <details>
          <Text component="summary" size="sm" fw={600} style={{ cursor: 'pointer' }}>Respuesta de la API (JSON)</Text>
          <Code block mt="xs" mah={300} style={{ overflow: 'auto' }}>{JSON.stringify(turn, null, 2)}</Code>
        </details>
      </Stack>
    </Paper>
  );
}
