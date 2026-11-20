export function requireUserRole(authenticate, ...allowedRoles) {
  return async function protect(req, res, next) {
    const user = await authenticate(req.get('Authorization'));
    if (!user) {
      return res.set('WWW-Authenticate', 'Bearer')
        .status(401).json({ error: 'Autenticación requerida.' });
    }

    // La autorización usa el estado y el rol actuales que devuelve el autenticador.
    if (user.status !== 'active' || !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }
    next();
  };
}
