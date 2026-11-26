import { Alert, Paper, Stack, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { ApiRouteGuide } from '../api-guide/ApiRouteGuide.jsx';
import { screenApiRoutes } from '../api-guide/screenApiRoutes.js';
import { Workspace } from '../workspace/Workspace.jsx';
import { LoginForm } from './LoginForm.jsx';
import { createSessionStore } from './sessionStore.js';
import './auth.css';

export function AuthScreen({ paused = false }) {
  const [sessionStore] = useState(createSessionStore);
  const [{ session, notice }, setAuth] = useState(() => ({ session: sessionStore.current, notice: '' }));

  const expireSession = useCallback(() => {
    if (sessionStore.clear(session)) {
      setAuth({ session: null, notice: 'La sesión ya no es válida. Inicie sesión nuevamente.' });
    }
  }, [session, sessionStore]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = setTimeout(expireSession, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session, expireSession]);

  function handleLogin(nextSession) {
    setAuth({ session: sessionStore.save(nextSession), notice: '' });
  }

  function handleLogout() {
    if (sessionStore.clear(session)) setAuth({ session: null, notice: '' });
  }

  if (paused) return null;
  if (session) return (
    <Workspace session={session} onLogout={handleLogout} onUnauthorized={expireSession} />
  );

  return (
    <main className="auth-shell">
      <Paper className="auth-panel" radius="md" withBorder aria-labelledby="auth-title">
        <Stack gap="xl">
          <header className="auth-brand">
            <span className="auth-mark" aria-hidden="true">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7" />
              </svg>
            </span>
            <Text fw={700}>LeadQual</Text>
          </header>
          <div>
            <Text className="auth-label" size="xs" fw={700}>CALIFICACIÓN INMOBILIARIA</Text>
            <Title id="auth-title" order={1}>Iniciar sesión</Title>
            <Text c="dimmed" size="sm" mt="xs">
              Ingrese con su cuenta de operador.
            </Text>
          </div>
          <Stack gap="md">
            {notice && <Alert role="status">{notice}</Alert>}
            <LoginForm onLogin={handleLogin} />
          </Stack>
        </Stack>
        <ApiRouteGuide routes={screenApiRoutes.login} />
      </Paper>
    </main>
  );
}
