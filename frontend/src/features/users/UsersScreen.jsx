import { Alert, Badge, Button, Group, Loader, Modal, Paper, PasswordInput, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { createUsersApi } from './usersApi.js';

const roles = [
  { value: 'administrador', label: 'Administrador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'vendedor', label: 'Vendedor' },
];

const roleLabel = (role) => roles.find(({ value }) => value === role)?.label ?? role;
const statusLabel = (status) => ({ active: 'Activo', inactive: 'Inactivo' }[status] ?? status);
const dateLabel = (value) => value ? new Date(value).toLocaleString('es-AR') : 'No disponible';
const errorMessage = (error) => error.status ? error.message : 'No se pudo conectar con la API de usuarios.';

function CreateUserForm({ api, onCreated, onClose, saving, setSaving }) {
  const [role, setRole] = useState('vendedor');
  const [failure, setFailure] = useState('');
  const inFlight = useRef(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (!role || inFlight.current) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    // The password is not retained after submitting, including on errors.
    form.elements.namedItem('password').value = '';
    const controller = new AbortController();
    inFlight.current = controller;
    setSaving(true);
    setFailure('');
    try {
      const created = await api.create({
        name: input.get('name').trim(),
        email: input.get('email').trim(),
        password: input.get('password'),
        role,
      }, controller.signal);
      if (!controller.signal.aborted) onCreated(created);
    } catch (error) {
      if (!controller.signal.aborted) setFailure(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setSaving(false);
      inFlight.current = null;
    }
  }

  return (
    <Stack gap="md" component="form" onSubmit={submit}>
      {failure && <Alert color="red" role="alert">{failure}</Alert>}
      <TextInput name="name" label="Nombre" required maxLength={200} disabled={saving} />
      <TextInput name="email" label="Correo electrónico" type="email" required maxLength={254} disabled={saving} />
      <PasswordInput name="password" label="Contraseña" description="Mínimo 12 caracteres" autoComplete="new-password" required minLength={12} maxLength={1024} disabled={saving} />
      <Select label="Rol" data={roles} value={role} onChange={setRole} allowDeselect={false} disabled={saving} />
      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button type="submit" loading={saving}>Crear usuario</Button>
      </Group>
    </Stack>
  );
}

export function UsersScreen({ accessToken, onUnauthorized }) {
  const [list, setList] = useState(null);
  const [listError, setListError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [notice, setNotice] = useState('');
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => { onUnauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    createUsersApi(accessToken, () => onUnauthorizedRef.current?.()).list(controller.signal)
      .then((users) => {
        if (!controller.signal.aborted) setList(users);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setListError(error);
      });
    return () => controller.abort();
  }, [accessToken, revision]);

  useEffect(() => {
    if (!selected) return undefined;
    const controller = new AbortController();
    createUsersApi(accessToken, () => onUnauthorizedRef.current?.()).get(selected, controller.signal)
      .then((user) => {
        if (!controller.signal.aborted) setDetail(user);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDetailError(error);
      });
    return () => controller.abort();
  }, [accessToken, selected]);

  function refresh() {
    setList(null);
    setListError(null);
    setRevision((value) => value + 1);
  }

  function openDetail(id) {
    setDetail(null);
    setDetailError(null);
    setSelected(id);
  }

  return (
    <Stack gap="lg">
      <Group align="flex-start" justify="space-between">
        <div>
          <Title order={1}>Administración de usuarios</Title>
          <Text c="dimmed" mt={4}>Consulta las cuentas del equipo y asigna un rol a las nuevas.</Text>
        </div>
        {list && <Button onClick={() => { setNotice(''); setCreating(true); }}>Nuevo usuario</Button>}
      </Group>
      {notice && <Alert color="green" role="status">{notice}</Alert>}
      {listError && (
        <Alert color="red" role="alert" title="No se pudo cargar el equipo">
          {errorMessage(listError)}
          {listError.status !== 403 && <Button ml="sm" size="compact-sm" variant="default" onClick={refresh}>Reintentar</Button>}
        </Alert>
      )}
      {!list && !listError && <Loader aria-label="Cargando usuarios" size="sm" />}
      {list && (
        <Paper withBorder p="md">
          <Group justify="space-between" mb="sm">
            <Title order={2} size="h4">Equipo</Title>
            <Text c="dimmed" size="sm">{list.length} {list.length === 1 ? 'cuenta' : 'cuentas'}</Text>
          </Group>
          {!list.length ? <Text c="dimmed">No hay usuarios para mostrar.</Text> : (
            <Table.ScrollContainer minWidth={520}>
              <Table verticalSpacing="sm" highlightOnHover aria-label="Usuarios del equipo">
                <Table.Thead><Table.Tr>
                  <Table.Th>Usuario</Table.Th><Table.Th>Rol</Table.Th><Table.Th>Estado</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>{list.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>
                      <Button variant="subtle" size="compact-sm" px={0} onClick={() => openDetail(user.id)}>{user.name}</Button>
                      <Text size="sm" c="dimmed">{user.email}</Text>
                    </Table.Td>
                    <Table.Td>{roleLabel(user.role)}</Table.Td>
                    <Table.Td><Badge color={user.status === 'active' ? 'green' : 'gray'} variant="light">{statusLabel(user.status)}</Badge></Table.Td>
                  </Table.Tr>
                ))}</Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
      )}
      <Modal
        opened={creating}
        onClose={() => { if (!saving) setCreating(false); }}
        closeOnEscape={!saving}
        closeOnClickOutside={!saving}
        withCloseButton={!saving}
        title="Nuevo usuario"
        centered
      >
        {creating && (
          <CreateUserForm
            api={createUsersApi(accessToken, () => onUnauthorizedRef.current?.())}
            saving={saving}
            setSaving={setSaving}
            onClose={() => setCreating(false)}
            onCreated={() => { setCreating(false); setNotice('Usuario creado.'); refresh(); }}
          />
        )}
      </Modal>
      <Modal opened={Boolean(selected)} onClose={() => setSelected(null)} title="Detalle de usuario" centered>
        {detailError && <Alert color="red" role="alert">{errorMessage(detailError)}</Alert>}
        {!detail && !detailError && <Loader aria-label="Cargando detalle" size="sm" />}
        {detail && (
          <Stack gap={6}>
            <Title order={3}>{detail.name}</Title>
            <Text c="dimmed">{detail.email}</Text>
            <Text size="sm">Rol: {roleLabel(detail.role)}</Text>
            <Text size="sm">Estado: {statusLabel(detail.status)}</Text>
            <Text size="sm">Alta: {dateLabel(detail.createdAt)}</Text>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
