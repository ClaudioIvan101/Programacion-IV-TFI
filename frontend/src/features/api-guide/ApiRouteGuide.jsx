import { Text } from '@mantine/core';
import './apiRouteGuide.css';

export function ApiRouteGuide({ routes }) {
  return (
    <details className="api-route-guide">
      <summary>Rutas de la API</summary>
      <div className="api-route-guide-content">
        <Text size="xs" c="dimmed">
          El proxy quita el prefijo <code>/api</code> antes de enviar la solicitud a Express.
        </Text>
        <ul>
          {routes.map(([request, purpose, router]) => (
            <li key={request}>
              <code className="api-route-guide-request">{request}</code>
              <div>
                <Text size="sm">{purpose}</Text>
                <Text size="xs" c="dimmed"><code>express/src/routes/{router}.js</code></Text>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
