export function createReadinessController(checkReadiness = async () => false) {
  return async function getReadiness(req, res) {
    res.set('Cache-Control', 'no-store');
    try {
      if (await checkReadiness() === true) return res.status(200).json({ status: 'ok' });
    } catch {
      // Un fallo interno nunca debe exponer detalles de conexión.
    }
    return res.status(503).json({ status: 'unavailable' });
  };
}
