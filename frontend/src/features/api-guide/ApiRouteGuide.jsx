import { Button, Drawer, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import './apiRouteGuide.css';

const METHOD_ORDER = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

export function ApiRouteGuide({ routes = [] }) {
  const [opened, setOpened] = useState(false);
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [copiedRoute, setCopiedRoute] = useState('');

  const methods = useMemo(() => {
    const present = new Set(routes.map(([request]) => request.split(' ')[0]));
    return METHOD_ORDER.filter((method) => present.has(method));
  }, [routes]);

  const activeFilter = methodFilter !== 'ALL' && !methods.includes(methodFilter) ? 'ALL' : methodFilter;
  const visibleRoutes = activeFilter === 'ALL'
    ? routes
    : routes.filter(([request]) => request.startsWith(`${activeFilter} `));

  async function copyRoute(request) {
    try {
      await navigator.clipboard.writeText(request);
      setCopiedRoute(request);
      setTimeout(() => setCopiedRoute((current) => (current === request ? '' : current)), 1500);
    } catch {
      setCopiedRoute('');
    }
  }

  return (
    <>
      <Button
        size="compact-sm"
        className="api-route-guide-trigger"
        variant="default"
        onClick={() => setOpened(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
        </svg>
        <span>Rutas de la API</span>
        <span className="api-trigger-count">{routes.length}</span>
      </Button>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="right"
        size={560}
        withCloseButton={false}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.68, blur: 5 }}
        classNames={{
          content: 'api-drawer-panel',
          body: 'api-drawer-body-root',
        }}
        aria-label="Guía de API LeadQual"
      >
        <div className="api-drawer-head">
          <div>
            <div className="api-drawer-title">Guía de API — LeadQual</div>
            <Text size="xs" className="api-drawer-subtitle">
              Nginx <span className="api-drawer-highlight">/api</span> → Express (sin prefijo /api)
            </Text>
          </div>
          <Button variant="default" size="compact-sm" className="api-drawer-close" onClick={() => setOpened(false)}>
            Cerrar
          </Button>
        </div>

        <div className="api-drawer-tabs-wrap">
          <div className="api-segmented" role="tablist" aria-label="Filtrar rutas por método HTTP">
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'ALL'}
              className={`api-seg-btn ${activeFilter === 'ALL' ? 'is-active' : ''}`}
              onClick={() => setMethodFilter('ALL')}
            >
              Todos ({routes.length})
            </button>
            {methods.map((method) => (
              <button
                key={method}
                type="button"
                role="tab"
                aria-selected={activeFilter === method}
                className={`api-seg-btn api-mono ${activeFilter === method ? 'is-active' : ''}`}
                onClick={() => setMethodFilter(method)}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        <div className="api-drawer-list">
          {visibleRoutes.map(([request, purpose, router, caller]) => {
            const [method, path] = request.split(' ');
            const expressPath = path.replace(/^\/api/, '') || '/';
            const copied = copiedRoute === request;

            return (
              <article key={request} className="api-route-card">
                <div className="api-route-head">
                  <div className="api-route-endpoint">
                    <span className="api-method-tag api-mono" data-method={method}>{method}</span>
                    <span className="api-route-path api-mono">{path}</span>
                  </div>
                  <button
                    type="button"
                    className="api-copy-btn"
                    onClick={() => copyRoute(request)}
                  >
                    {copied ? 'Copiado ✓' : 'Copiar ruta'}
                  </button>
                </div>

                <p className="api-route-desc">{purpose}</p>

                <div className="api-code-block api-mono">
                  <div className="api-code-row">
                    <span className="api-code-key">Frontend</span>
                    <span className="api-code-val">{caller}</span>
                  </div>
                  <div className="api-code-row">
                    <span className="api-code-key">Express</span>
                    <span className="api-code-val">express/src/routes/{router}.js</span>
                  </div>
                  <div className="api-code-row">
                    <span className="api-code-key">Upstream</span>
                    <span className="api-code-val">{expressPath}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Drawer>
    </>
  );
}
