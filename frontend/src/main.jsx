import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from './features/auth/AuthScreen.jsx';
import { theme } from './theme.js';

createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme} forceColorScheme="dark">
    <AuthScreen />
  </MantineProvider>,
);
