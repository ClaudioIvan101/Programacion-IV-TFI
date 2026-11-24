export const workspaceRoutes = [
  ['resumen', 'Resumen', '▦'],
  ['chat', 'Chat', '◫'],
  ['campanas', 'Campañas', '◎'],
  ['captacion', 'Captación', '◇'],
  ['calificacion', 'Calificación', '✓'],
  ['usuarios', 'Usuarios', '◉'],
];

export function workspaceRoute(hash) {
  const route = hash.slice(2);
  return hash.startsWith('#/') && workspaceRoutes.some(([key]) => key === route) ? route : 'resumen';
}
