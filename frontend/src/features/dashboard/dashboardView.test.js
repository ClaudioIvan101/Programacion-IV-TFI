import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignDistribution, filterDashboardLeads, relativeScoreWidth } from './dashboardView.js';

const leads = [
  { id: 'a', name: 'Lucía Díaz', email: 'lucia@ejemplo.test', campaignId: 'camp-a', score: 10 },
  { id: 'b', name: 'Otra persona', phone: '+54 11 5555-0100', campaignId: null, score: -5 },
  { id: 'c', name: 'Una consulta', campaignId: 'camp-a', score: 20 },
  { id: 'd', name: 'Sin campaña', score: null },
];

test('counts each lead by origin and includes zero-count known campaigns and Sin campaña', () => {
  assert.deepEqual(campaignDistribution(leads, new Map([['camp-a', 'Centro'], ['camp-b', 'Sur']])), [
    { id: 'camp-a', label: 'Centro', count: 2 },
    { id: 'camp-b', label: 'Sur', count: 0 },
    { id: null, label: 'Sin campaña', count: 2 },
  ]);
});

test('combines the campaign filter with accent-insensitive name and contact search', () => {
  assert.deepEqual(filterDashboardLeads(leads, 'camp-a', ' lucia diaz '), [leads[0]]);
  assert.deepEqual(filterDashboardLeads(leads, 'none', '5555-0100'), [leads[1]]);
  assert.deepEqual(filterDashboardLeads(leads, null, 'LUCIA@EJEMPLO'), [leads[0]]);
  assert.deepEqual(filterDashboardLeads(leads, 'none', 'lucia'), []);
});

test('scales the visual bar without changing stored negative or missing scores', () => {
  assert.equal(relativeScoreWidth(10, 20), 50);
  assert.equal(relativeScoreWidth(-5, 20), 0);
  assert.equal(relativeScoreWidth(null, 20), 0);
  assert.equal(relativeScoreWidth(0, 0), 0);
});
