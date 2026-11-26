import { Button, Drawer, Text } from '@mantine/core';
import { useState } from 'react';
import './apiRouteGuide.css';

export function ApiRouteGuide({ routes }) {
  const [opened, setOpened] = useState(false);
  return <>
    <Button size="compact-sm" className="api-route-guide-trigger" variant="default" onClick={() => setOpened(true)}>
      <span aria-hidden="true">↗</span> Rutas de la API
    </Button>
    <Drawer opened={opened} onClose={() => setOpened(false)} title="Rutas de la API" position="right" size="lg">
      <div className="api-route-guide-content">
        <Text size="sm" c="dimmed">
          Así llama esta pantalla a Express. El proxy elimina el prefijo <code>/api</code> antes de reenviar cada solicitud.
        </Text>
        <ul>
          {routes.map(([request, purpose, router, caller]) => {
            const [method, path] = request.split(' ');
            return <li key={request}>
              <p className="api-route-guide-request"><strong data-method={method}>{method}</strong> <code>{path}</code></p>
              <Text size="sm">{purpose}</Text>
              <dl>
                <dt>Frontend</dt><dd><code>{caller}</code></dd>
                <dt>Express</dt><dd><code>express/src/routes/{router}.js</code></dd>
              </dl>
            </li>;
          })}
        </ul>
      </div>
    </Drawer>
  </>;
}
