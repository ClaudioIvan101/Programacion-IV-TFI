import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceRoute } from './workspaceRoute.js';

test('resolves deep links and defaults unknown or empty routes to the summary', () => {
  assert.equal(workspaceRoute('#/chat'), 'chat');
  assert.equal(workspaceRoute('#/captacion'), 'captacion');
  assert.equal(workspaceRoute('#/desconocido'), 'resumen');
  assert.equal(workspaceRoute(''), 'resumen');
});
