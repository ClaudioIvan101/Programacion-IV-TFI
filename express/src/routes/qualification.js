import { Router } from 'express';
import { z } from 'zod';
import { InvalidQualificationDataError } from '../domain/leads/applyQualificationData.js';
import { InvalidRuleSetError } from '../domain/leads/qualifyLead.js';
import { requireUserRole } from '../middlewares/requireUserRole.js';

const id = z.string().uuid();
const text = (max) => z.string().trim().min(1).max(max)
  .refine((value) => value.isWellFormed() && !value.includes('\0'));
const qualificationData = z.strictObject({
  needs: text(2000).nullish(),
  urgency: text(300).nullish(),
  budgetAmount: z.number().min(0).max(1_000_000_000_000).nullish(),
  budgetCurrency: z.enum(['ARS', 'USD']).nullish(),
});

export function createQualificationRouter({
  authenticate, applyQualificationData, publishRuleSet, qualifyLead, listQualifications,
}) {
  const router = Router();

  // Solo un administrador activo puede acceder a las operaciones nuevas.
  const protect = requireUserRole(authenticate, 'administrador');

  // Se valida la solicitud antes de delegar reglas de negocio y persistencia.
  const validate = (schema, handle) => async (req, res) => {
    if (Object.keys(req.query).length || Object.values(req.params).some((value) => !id.safeParse(value).success)) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }
    if (!schema) return handle(req, res);
    if (req.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return res.status(415).json({ error: 'El cuerpo debe enviarse como application/json.' });
    }
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Datos inválidos.' });
    return handle(req, res, body.data);
  };

  router.patch('/leads/:leadId/conversations/:conversationId/qualification-data', protect,
    validate(qualificationData, async (req, res, data) => {
      try {
        const result = await applyQualificationData({ ...req.params, data });
        return result ? res.json(result) : res.status(404).json({ error: 'Lead o conversación no encontrados.' });
      } catch (error) {
        if (error instanceof InvalidQualificationDataError) return res.status(400).json({ error: error.message });
        throw error;
      }
    }));

  // Se publica una versión nueva para que el historial conserve las reglas que se usaron.
  router.post('/lead-scoring-rule-sets', protect, validate(z.unknown(), async (req, res, body) => {
    try {
      const ruleSet = await publishRuleSet(body);
      return res.status(201).json(ruleSet);
    } catch (error) {
      if (error instanceof InvalidRuleSetError) return res.status(400).json({ error: error.message });
      throw error;
    }
  }));

  const qualificationRequest = z.strictObject({ ruleSetVersion: z.number().int().min(1).max(2_147_483_647) });
  router.post('/leads/:leadId/qualifications', protect, validate(qualificationRequest, async (req, res, body) => {
    const result = await qualifyLead(req.params.leadId, body.ruleSetVersion);
    return result ? res.status(201).json(result) : res.status(404).json({ error: 'Lead o versión de reglas no encontrados.' });
  }));

  router.get('/leads/:leadId/qualifications', protect, validate(null, async (req, res) => {
    const history = await listQualifications(req.params.leadId);
    return history ? res.json(history) : res.status(404).json({ error: 'Lead no encontrado.' });
  }));

  return router;
}
