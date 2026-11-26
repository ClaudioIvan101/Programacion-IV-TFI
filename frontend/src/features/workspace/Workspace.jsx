import { useState } from 'react';
import { Button, Text } from '@mantine/core';
import { AssignmentsScreen } from '../assignments/AssignmentsScreen.jsx';
import { ApiRouteGuide } from '../api-guide/ApiRouteGuide.jsx';
import { screenApiRoutes } from '../api-guide/screenApiRoutes.js';
import { CampaignsScreen } from '../capture/CampaignsScreen.jsx';
import { CaptureScreen } from '../capture/CaptureScreen.jsx';
import { ChatScreen } from '../chat/ChatScreen.jsx';
import { Dashboard } from '../dashboard/Dashboard.jsx';
import { QualificationScreen } from '../qualification/QualificationScreen.jsx';
import { ScoringRulesScreen } from '../qualification/ScoringRulesScreen.jsx';
import { UsersScreen } from '../users/UsersScreen.jsx';
import { routeLeadId, workspaceRoute, workspaceRoutes } from './workspaceRoute.js';
import { useCurrentHash } from './useCurrentHash.js';
import './workspace.css';

const screens = {
  resumen: Dashboard,
  chat: ChatScreen,
  campanas: CampaignsScreen,
  captacion: CaptureScreen,
  calificacion: QualificationScreen,
  reglas: ScoringRulesScreen,
  derivacion: AssignmentsScreen,
  usuarios: UsersScreen,
};

export function Workspace({ session, onLogout, onUnauthorized }) {
  const hash = useCurrentHash();
  const [publishedRules, setPublishedRules] = useState([]);
  const onRulePublished = (rule) => setPublishedRules((current) => [
    rule,
    ...current
      .filter((item) => item.version !== rule.version)
      .map((item) => (rule.status === 'active' && item.status === 'active' ? { ...item, status: 'archived' } : item)),
  ]);
  const route = workspaceRoute(hash);
  const leadId = routeLeadId(hash);
  const Screen = screens[route];
  const title = workspaceRoutes.find(([key]) => key === route)[1];

  return (
    <div className="workspace-shell" data-route={route}>
      <aside className="workspace-sidebar" aria-label="Espacio de trabajo">
        <div className="workspace-brand">
          <span className="auth-mark" aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7" />
            </svg>
          </span>
          <Text fw={700}>LeadQual</Text>
        </div>
        <Text className="workspace-nav-title" size="xs" fw={700}>OPERACIONES</Text>
        <nav className="workspace-nav" aria-label="Navegación principal">
          {workspaceRoutes.map(([key, label, icon]) => (
            <a key={key} href={'#/' + key} aria-current={route === key ? 'page' : undefined}>
              <span aria-hidden="true">{icon}</span>{label}
            </a>
          ))}
        </nav>
        <div className="workspace-session">
          <Button variant="subtle" color="gray" size="sm" onClick={onLogout}>Cerrar sesión</Button>
        </div>
      </aside>
      <main className="workspace-main" aria-label={title}>
        <header className="workspace-topbar">
          <p className="workspace-breadcrumb"><span>Espacio de trabajo</span><span aria-hidden="true">/</span><strong>{title}</strong></p>
          <ApiRouteGuide key={route} routes={screenApiRoutes[route]} />
        </header>
        <div className="workspace-content">
          <Screen key={route + ':' + (leadId ?? '')} initialLeadId={leadId} accessToken={session.accessToken}
            onUnauthorized={onUnauthorized} publishedRules={publishedRules} onRulePublished={onRulePublished} />
        </div>
      </main>
    </div>
  );
}
