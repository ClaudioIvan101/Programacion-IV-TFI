import { Alert, Button, Loader, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { publicCapture } from './publicCapture.js';
import '../auth/auth.css';

export function PublicForm({ formId }) {
  const api = useMemo(() => formId ? publicCapture(formId) : null, [formId]);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return undefined;
    const controller = new AbortController();
    api.load(controller.signal).then((value) => {
      if (!controller.signal.aborted) setForm(value);
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadError(error.message);
    });
    return () => controller.abort();
  }, [api]);

  async function submit(event) {
    event.preventDefault();
    if (busy || sent) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setSubmitError('');
    try {
      await api.submit(fields);
      setSent(true);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <Paper className="auth-panel" radius="md" withBorder aria-labelledby="public-form-title">
      <Stack gap="lg">
        <div>
          <Text className="auth-label" size="xs" fw={700}>LEADQUAL · CONSULTA INMOBILIARIA</Text>
          <Title id="public-form-title" order={1}>{form?.name ?? 'Formulario de consulta'}</Title>
          <Text size="sm" c="dimmed" mt="xs">Complete sus datos para enviar una consulta.</Text>
        </div>
        {!form && (loadError || !api
          ? <Alert color="red" role="alert">{loadError || 'El enlace no es válido.'}</Alert>
          : <Loader size="sm" aria-label="Cargando formulario" />)}
        {sent && <Alert color="green" role="status" title="Consulta recibida">Gracias por enviar sus datos.</Alert>}
        {form && !sent && <form onSubmit={submit}>
          <Stack gap="sm">
            <TextInput name="name" label="Nombre" autoComplete="name" required maxLength={120} />
            <TextInput name="email" label="Correo electrónico" type="email" autoComplete="email" maxLength={254} />
            <TextInput name="phone" label="Teléfono" type="tel" autoComplete="tel" maxLength={40} />
            <Text size="xs" c="dimmed">Ingrese al menos un correo o teléfono.</Text>
            <Textarea name="needs" label="¿Qué está buscando?" maxLength={2000} minRows={3} />
            {submitError && <Alert color="red" role="alert">{submitError}</Alert>}
            <Button type="submit" loading={busy}>Enviar consulta</Button>
          </Stack>
        </form>}
      </Stack>
    </Paper>
  </main>;
}
