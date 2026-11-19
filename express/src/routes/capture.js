import { Router } from 'express';
import { z } from 'zod';
import { CampaignNotFoundError, DuplicateChannelError, FormNotFoundError, InvalidCaptureError } from '../domain/capture/errors.js';

const id = z.string().uuid();
const query = z.strictObject({});
const channelBody = z.strictObject({ channel: z.enum(['form', 'simulated_messaging']) });
const formBody = z.strictObject({ name: z.string().trim().min(1).max(200), campaignId: id.nullable().optional() });

export function createCaptureRouter({ addCampaignChannel, listCampaignChannels, createForm, getFormById, authorize = async () => false }) {
  const router = Router();
  const protect = async (req, res, next) => {
    if (await authorize(req) !== true) return res.status(403).json({ error: 'Acceso denegado.' });
    next();
  };
  const handle = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      if (error instanceof InvalidCaptureError) return res.status(400).json({ error: 'Datos inválidos.' });
      if (error instanceof CampaignNotFoundError || error instanceof FormNotFoundError) return res.status(404).json({ error: 'Recurso no encontrado.' });
      if (error instanceof DuplicateChannelError) return res.status(409).json({ error: 'Canal ya asociado.' });
      throw error;
    }
  };
  const validate = (req, res, schema) => {
    if (req.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      res.status(415).json({ error: 'El cuerpo debe enviarse como application/json.' });
      return null;
    }
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: 'Datos inválidos.' }); return null; }
    return result.data;
  };
  router.post('/campaigns/:id/channels', protect, handle(async (req, res) => {
    if (!id.safeParse(req.params.id).success || !query.safeParse(req.query).success) return res.status(400).json({ error: 'Datos inválidos.' });
    const body = validate(req, res, channelBody);
    if (body) res.status(201).json(await addCampaignChannel(req.params.id, body.channel));
  }));
  router.get('/campaigns/:id/channels', protect, handle(async (req, res) => {
    if (!id.safeParse(req.params.id).success || !query.safeParse(req.query).success) return res.status(400).json({ error: 'Datos inválidos.' });
    res.json(await listCampaignChannels(req.params.id));
  }));
  router.post('/forms', protect, handle(async (req, res) => {
    if (!query.safeParse(req.query).success) return res.status(400).json({ error: 'Datos inválidos.' });
    const body = validate(req, res, formBody);
    if (body) res.status(201).json(await createForm(body));
  }));
  router.get('/forms/:id', protect, handle(async (req, res) => {
    if (!id.safeParse(req.params.id).success || !query.safeParse(req.query).success) return res.status(400).json({ error: 'Datos inválidos.' });
    res.json(await getFormById(req.params.id));
  }));
  return router;
}
