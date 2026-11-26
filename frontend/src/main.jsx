import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from './features/auth/AuthScreen.jsx';
import { PublicForm } from './features/capture/PublicForm.jsx';
import { useCurrentHash } from './features/workspace/useCurrentHash.js';
import { publicFormId } from './features/workspace/workspaceRoute.js';
import { theme } from './theme.js';

function App() {
  const hash = useCurrentHash();
  const publicRoute = hash === '#/formulario' || hash.startsWith('#/formulario/');
  // El formulario público no usa la sesión del operador.
  return <>
    <AuthScreen paused={publicRoute} />
    {publicRoute && <PublicForm key={hash} formId={publicFormId(hash)} />}
  </>;
}

createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme} forceColorScheme="dark">
    <App />
  </MantineProvider>,
);
