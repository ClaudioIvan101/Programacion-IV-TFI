import test from 'node:test';
import assert from 'node:assert/strict';
import { leadRoute, publicFormId, routeLeadId, workspaceRoute } from './workspaceRoute.js';

test('resolves deep links and defaults unknown or empty routes to the summary', () => {
  assert.equal(workspaceRoute('#/chat'), 'chat');
  assert.equal(workspaceRoute('#/captacion'), 'captacion');
  assert.equal(workspaceRoute('#/desconocido'), 'resumen');
  assert.equal(workspaceRoute(''), 'resumen');
});

test('preserves lead selection between operator screens without routing public form to the workspace', () => {
  const id = 'af24e13f-a33f-4a5d-9e76-cbc3cdd7550a';
  const chat = leadRoute('chat', id);
  assert.equal(workspaceRoute(chat), 'chat');
  assert.equal(routeLeadId(chat), id);
  const rules = leadRoute('reglas', id);
  assert.equal(workspaceRoute(rules), 'reglas');
  assert.equal(routeLeadId(rules), id);
  assert.equal(routeLeadId('#/chat?lead=invalid'), null);
  assert.equal(publicFormId('#/formulario/' + id), id);
  assert.equal(publicFormId('#/formulario/invalid'), null);
});
