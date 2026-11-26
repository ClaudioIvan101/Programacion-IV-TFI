import assert from 'node:assert/strict';
import test from 'node:test';
import { screenApiRoutes } from './screenApiRoutes.js';

test('the route guide identifies the real client caller on each screen', () => {
  for (const routes of Object.values(screenApiRoutes)) {
    for (const [request, , router, caller] of routes) {
      assert.match(request, /^(GET|POST|PATCH) \/api\//);
      assert.ok(router);
      assert.match(caller, /^frontend\/src\/features\/.+\.js · .+\(\)$/);
    }
  }
  assert.ok(screenApiRoutes.resumen.some(([route]) => route === 'GET /api/assignments'));
  assert.deepEqual(screenApiRoutes.formulario.map(([route]) => route), [
    'GET /api/public/forms/:id', 'POST /api/public/forms/:id',
  ]);
  assert.ok(!screenApiRoutes.captacion.some(([route]) => route.includes('/public/')));
});

test('shows rule publication and applying a score on separate screens', () => {
  assert.deepEqual(screenApiRoutes.reglas.map(([route]) => route), [
    'GET /api/lead-scoring-rule-sets',
    'POST /api/lead-scoring-rule-sets',
    'POST /api/lead-scoring-rule-sets/:version/activate',
  ]);
  assert.ok(!screenApiRoutes.calificacion.some(([route]) => route === 'POST /api/lead-scoring-rule-sets'));
  assert.ok(screenApiRoutes.calificacion.some(([route]) => route === 'GET /api/lead-scoring-rule-sets'));
  assert.ok(screenApiRoutes.calificacion.some(([route]) => route === 'POST /api/leads/:leadId/qualifications'));
});
