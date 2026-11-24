export const workspaceRoutes = [
  ['resumen', 'Resumen', '▦'],
  ['chat', 'Chat', '◫'],
  ['campanas', 'Campañas', '◎'],
  ['captacion', 'Captación', '◇'],
  ['calificacion', 'Calificación', '✓'],
  ['derivacion', 'Derivación', '↗'],
  ['usuarios', 'Usuarios', '◉'],
];

export function workspaceRoute(hash) {
  const route = hash.slice(2).split('?')[0];
  return hash.startsWith('#/') && workspaceRoutes.some(([key]) => key === route) ? route : 'resumen';
}

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const validatedId = (value) => typeof value === 'string' && uuid.test(value) ? value : null;

export function publicFormId(hash) {
  return hash.startsWith('#/formulario/') ? validatedId(hash.slice('#/formulario/'.length)) : null;
}

export function routeLeadId(hash) {
  return validatedId(new URLSearchParams(hash.split('?')[1]).get('lead'));
}

export function leadRoute(route, id) {
  return '#/' + route + '?lead=' + encodeURIComponent(id);
}
