import { Router } from 'express';
import { z } from 'zod';

const id = z.uuid();
const body = z.strictObject({ leadId: id, sellerId: id });
const managers = ['administrador', 'supervisor'];

export function createAssignmentRouter({ authenticate, list, eligible, assign, retry, recordFirstContact }) {
  const router = Router();

  function allow(roles, handler) {
    return async (req, res) => {
      const actor = await authenticate(req.get('Authorization'));
      if (!actor) return res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'Autenticación requerida.' });
      if (actor.status !== 'active' || !roles.includes(actor.role)) {
        return res.status(403).json({ error: 'Acceso denegado.' });
      }
      if (Object.keys(req.query).length || (req.params.id !== undefined && !id.safeParse(req.params.id).success)) {
        return res.status(400).json({ error: 'Datos inválidos.' });
      }
      return handler(req, res, actor);
    };
  }

  router.get('/', allow([...managers, 'vendedor'], async (_, res, actor) => res.json(await list(actor))));
  router.get('/options', allow(managers, async (_, res) => res.json(await eligible())));

  router.post('/', allow(managers, async (req, res, actor) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'El cuerpo debe enviarse como application/json.' });
    const input = body.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Seleccione un interesado y un vendedor.' });
    const result = await assign(actor.id, input.data);
    if (result.kind === 'created') return res.status(201).json(result.row);
    if (result.kind === 'existing' && result.row.sellerId === input.data.sellerId) return res.json(result.row);
    if (result.kind === 'not_found') return res.status(404).json({ error: 'No se encontró el interesado.' });
    const conflicts = {
      invalid_seller: 'El usuario seleccionado no es un vendedor activo.',
      not_qualified: 'Solo se pueden derivar interesados con una calificación vigente aprobada.',
      existing: 'El interesado ya se derivó a otro vendedor.',
    };
    return res.status(409).json({ error: conflicts[result.kind] });
  }));

  router.post('/:id/retry', allow(managers, async (req, res) => {
    const result = await retry(req.params.id);
    if (result.kind === 'updated') return res.json(result.row);
    if (result.kind === 'not_found') return res.status(404).json({ error: 'No se encontró la derivación.' });
    return res.status(409).json({ error: 'No se puede reintentar este aviso.' });
  }));

  router.post('/:id/first-contact', allow(['vendedor'], async (req, res, actor) => {
    const row = await recordFirstContact(req.params.id, actor.id);
    if (!row) return res.status(404).json({ error: 'No se encontró la derivación.' });
    return res.json(row);
  }));
  return router;
}
