import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Paper, Stack, Table, Text, Textarea, TextInput, Title } from '@mantine/core';
import { createCaptureApi } from './captureApi.js';
import { CampaignPager, CaptureRequestState, useCampaignPage } from './campaignPage.jsx';

const statuses = { draft: 'Borrador', active: 'Activa', paused: 'Pausada', completed: 'Completada' };

export function CampaignsScreen({ accessToken, onUnauthorized }) {
  const api = useMemo(() => createCaptureApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const { result, page, setPage, refresh } = useCampaignPage(api);
  const [opened, setOpened] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');

  async function create(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSending(true);
    setError('');
    try {
      const campaign = await api.createCampaign({
        name: fields.get('name').trim(),
        objective: fields.get('objective').trim(),
      });
      setCreated(campaign.name);
      setOpened(false);
      setPage(1);
      refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1}>Campañas</Title>
          <Text c="dimmed">Organice las iniciativas comerciales y sus objetivos.</Text>
        </div>
        <Button onClick={() => { setError(''); setOpened(true); }}>Nueva campaña</Button>
      </Group>
      {created && <Alert color="green" role="status">Campaña creada: {created}</Alert>}
      <Paper p="md" withBorder>
        <CaptureRequestState result={result} />
        {result?.data && (
          <Stack>
            {result.data.items.length ? (
              <Table.ScrollContainer minWidth={550}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead><Table.Tr><Table.Th>Campaña</Table.Th><Table.Th>Objetivo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Fecha de alta</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {result.data.items.map((campaign) => (
                      <Table.Tr key={campaign.id}>
                        <Table.Td fw={600}>{campaign.name}</Table.Td>
                        <Table.Td>{campaign.objective}</Table.Td>
                        <Table.Td><Badge variant="light" color={campaign.status === 'active' ? 'green' : 'gray'}>{statuses[campaign.status] ?? campaign.status}</Badge></Table.Td>
                        <Table.Td>{campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('es-AR') : '—'}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : <Text c="dimmed">Todavía no hay campañas.</Text>}
            <CampaignPager page={page} setPage={setPage} total={result.data.total} />
          </Stack>
        )}
      </Paper>
      <Modal opened={opened} onClose={() => !sending && setOpened(false)} title="Nueva campaña" centered closeOnClickOutside={!sending} closeOnEscape={!sending}>
        <Stack component="form" onSubmit={create}>
          <TextInput label="Nombre" name="name" required />
          <Textarea label="Objetivo" name="objective" required />
          {error && <Alert color="red" role="alert">{error}</Alert>}
          <Button type="submit" loading={sending} ml="auto">Crear campaña</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
