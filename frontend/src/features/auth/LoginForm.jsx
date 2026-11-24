import { Alert, Button, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import { requestLogin } from './loginApi.js';

export function LoginForm({ onLogin }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const email = form.get('email').trim();
      const session = await requestLogin({ email, password: form.get('password') });
      onLogin({ ...session, email });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <TextInput name="email" type="email" label="Correo electrónico" placeholder="nombre@ejemplo.com"
          autoComplete="username" maxLength={254} disabled={pending} required />
        <PasswordInput name="password" label="Contraseña" autoComplete="current-password"
          visibilityToggleButtonProps={{ 'aria-label': 'Mostrar u ocultar contraseña' }}
          maxLength={1024} disabled={pending} required />
        <Button type="submit" fullWidth loading={pending} mt="xs">Ingresar</Button>
      </Stack>
    </form>
  );
}
