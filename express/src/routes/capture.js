import { Router } from 'express';
import { z } from 'zod';
import {
  CampaignNotFoundError,
  DuplicateChannelError,
  FormNotFoundError,
  InvalidCaptureError,
} from '../domain/capture/errors.js';

const id = z.string().uuid();

// Ninguna de estas rutas admite parámetros de consulta.
const query = z.strictObject({});
// La forma estricta del cuerpo rechaza campos adicionales antes de llamar al caso de uso.
const channelBody = z.strictObject({
  channel: z.enum(['form', 'simulated_messaging']),
});
const formBody = z.strictObject({
  name: z.string().trim().min(1).max(200),
  // Un formulario puede existir sin estar asociado a una campaña.
  campaignId: id.nullable().optional(),
});

// Los casos de uso se inyectan para probar las rutas sin depender de PostgreSQL.
export function createCaptureRouter({
  addCampaignChannel,
  listCampaignChannels,
  listCampaignForms,
  createForm,
  getFormById,
  authenticate = async () => null,
}) {
  const router = Router();

  // Primero se verifica la identidad; después se aplica el permiso de captación.
  // Si no hay un autenticador configurado, las rutas siguen cerradas.
  const protect = async (req, res, next) => {
    const user = await authenticate(req.get('Authorization'));

    // Sin identidad válida, se devuelve el desafío Bearer; con identidad válida pero sin permiso, se devuelve 403.
    if (!user) {
      return res.set('WWW-Authenticate', 'Bearer')
        .status(401).json({ error: 'Autenticación requerida.' });
    }

    // Se usa el rol actual del usuario, no un rol guardado en el JWT.
    if (user.status !== 'active' || user.role !== 'administrador') {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    next();
  };

  // Las rutas traducen errores del dominio a HTTP. Los inesperados
  // se propagan al manejador general de Express.
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof InvalidCaptureError) {
        return res.status(400).json({ error: 'Datos inválidos.' });
      }
      if (error instanceof CampaignNotFoundError || error instanceof FormNotFoundError) {
        return res.status(404).json({ error: 'Recurso no encontrado.' });
      }
      if (error instanceof DuplicateChannelError) {
        return res.status(409).json({ error: 'Canal ya asociado.' });
      }
      throw error;
    }
  };

  const validate = (req, res, schema) => {
    // Admitir parámetros como charset sin dejar de exigir application/json.
    const contentType = req.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      res.status(415).json({ error: 'El cuerpo debe enviarse como application/json.' });
      return null;
    }

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Datos inválidos.' });
      return null;
    }
    return result.data;
  };

  // Canales: cada operación se aplica a una campaña identificada por su ID.
  router.post('/campaigns/:id/channels', protect, handle(async (req, res) => {
    if (!id.safeParse(req.params.id).success || !query.safeParse(req.query).success) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }

    const body = validate(req, res, channelBody);
    if (body) res.status(201).json(await addCampaignChannel(req.params.id, body.channel));
  }));

  router.get('/campaigns/:id/channels', protect, handle(async (req, res) => {
    if (!id.safeParse(req.params.id).success || !query.safeParse(req.query).success) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }

    // Una lista vacía es válida; el caso de uso distingue una campaña que no existe.
    res.json(await listCampaignChannels(req.params.id));
  }));

  // Formularios: se consultan por su propio ID, tengan o no campaña.
  router.get('/campaigns/:id/forms', protect, handle(async (req, res) => {
    if (!id.safeParse(req.params.id).success || !query.safeParse(req.query).success) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }

    res.json(await listCampaignForms(req.params.id));
  }));

  router.post('/forms', protect, handle(async (req, res) => {
    if (!query.safeParse(req.query).success) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }

    const body = validate(req, res, formBody);
    if (body) res.status(201).json(await createForm(body));
  }));

  router.get('/forms/:id', protect, handle(async (req, res) => {
    if (!id.safeParse(req.params.id).success || !query.safeParse(req.query).success) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }

    res.json(await getFormById(req.params.id));
  }));

  return router;
}
