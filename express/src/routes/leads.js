import { Router } from 'express';
import { z } from 'zod';
import { InvalidLeadError } from '../domain/leads/createLead.js';
import { ConversationTurnError } from '../domain/ai/runConversationTurn.js';
import { requireUserRole } from '../middlewares/requireUserRole.js';

const id = z.string().uuid();
// Evitamos que la codificación UTF-8 reemplace caracteres inválidos o envíe un carácter nulo a PostgreSQL.
const validPostgresText = (value) => value.isWellFormed() && !value.includes('\0');
const text = (max) => z.string().trim().min(1).max(max).refine(validPostgresText);
const leadBody = z.strictObject({
  name: text(120).nullish(),
  email: z.string().trim().max(254).email().nullish(),
  phone: text(40).nullish(),
  campaignId: id.nullish(),
  channel: z.enum(['form', 'simulated_messaging']).nullish(),
  formId: id.nullish(),
  needs: text(2000).nullish(),
  budgetAmount: z.number().min(0).max(1_000_000_000_000).nullish(),
  budgetCurrency: z.enum(['ARS', 'USD']).nullish(),
  urgency: text(300).nullish(),
});
const messageBody = z.strictObject({
  role: z.enum(['lead', 'assistant']),
  content: z.string().max(4000).refine((value) => value.trim().length > 0 && validPostgresText(value)),
});
// Un turno recibe solo el texto nuevo del lead: el historial y el contexto ya
// están persistidos y los arma el caso de uso.
const turnBody = z.strictObject({
  content: z.string().max(4000).refine((value) => value.trim().length > 0 && validPostgresText(value)),
});

// El caso de uso clasifica el fallo con un código; el adaptador HTTP decide el
// estado. Un código desconocido cae en 500 para no disfrazar un defecto nuestro.
const turnErrorStatus = new Map([
  ['TIMEOUT', 504],
  ['DEADLINE_EXCEEDED', 504],
  ['CONFIG', 503],
  ['CREDENTIALS', 503],
  ['TRANSPORT', 503],
  ['SERVICE_UNAVAILABLE', 503],
  ['INVALID_PROVIDER_RESPONSE', 502],
  ['INVALID_RESPONSE', 502],
  ['HTTP_ERROR', 502],
  ['TURN_CONFLICT', 409],
]);

// Validamos los parámetros antes de pasar datos a PostgreSQL y usamos el mismo contrato de errores de la API.
function validate(handler, schema) {
  return async (req, res) => {
    if (Object.keys(req.query).length || Object.values(req.params).some((value) => !id.safeParse(value).success)) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }
    if (!schema) return handler(req, res);

    if (req.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return res.status(415).json({ error: 'El cuerpo debe enviarse como application/json.' });
    }
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Datos inválidos.' });
    return handler(req, res, body.data);
  };
}

export function createLeadRouter(leads) {
  const router = Router();

  router.post('/leads', validate(async (req, res, body) => {
    try {
      return res.status(201).json(await leads.createLead(body));
    } catch (error) {
      if (error instanceof InvalidLeadError) return res.status(400).json({ error: error.message });
      throw error;
    }
  }, leadBody));
  router.get('/leads', validate(async (req, res) => res.json(await leads.listLeads())));
  router.get('/leads/:leadId', validate(async (req, res) => {
    const lead = await leads.getLead(req.params.leadId);
    return lead ? res.json(lead) : res.status(404).json({ error: 'Lead no encontrado.' });
  }));

  // La conversación toma su lead de la URL y recibe un objeto JSON vacío.
  router.post('/leads/:leadId/conversations', validate(async (req, res) => {
    const conversation = await leads.createConversation(req.params.leadId);
    return conversation ? res.status(201).json(conversation) : res.status(404).json({ error: 'Lead no encontrado.' });
  }, z.strictObject({})));
  router.get('/leads/:leadId/conversations', validate(async (req, res) => {
    const conversations = await leads.listConversations(req.params.leadId);
    return conversations ? res.json(conversations) : res.status(404).json({ error: 'Lead no encontrado.' });
  }));
  router.get('/conversations/:conversationId', validate(async (req, res) => {
    const conversation = await leads.getConversation(req.params.conversationId);
    return conversation ? res.json(conversation) : res.status(404).json({ error: 'Conversación no encontrada.' });
  }));

  router.post('/conversations/:conversationId/messages', validate(async (req, res, body) => {
    const message = await leads.createMessage(req.params.conversationId, body);
    return message ? res.status(201).json(message) : res.status(404).json({ error: 'Conversación no encontrada.' });
  }, messageBody));
  router.get('/conversations/:conversationId/messages', validate(async (req, res) => {
    const messages = await leads.listMessages(req.params.conversationId);
    return messages ? res.json(messages) : res.status(404).json({ error: 'Conversación no encontrada.' });
  }));
  router.get('/conversations/:conversationId/messages/:messageId', validate(async (req, res) => {
    const message = await leads.getMessage(req.params.conversationId, req.params.messageId);
    return message ? res.json(message) : res.status(404).json({ error: 'Mensaje no encontrado.' });
  }));

  // Un turno toma el mensaje del lead, llama al gateway de IA, persiste ambos
  // mensajes con el contexto actualizado y devuelve la próxima pregunta.
  // La respuesta contiene contexto del lead; esta operación queda restringida a administración.
  const protectTurn = requireUserRole(leads.authenticate ?? (async () => null), 'administrador');
  router.post('/conversations/:conversationId/turn', protectTurn, validate(async (req, res, body) => {
    // Igual que el login: si el gateway no está configurado, la operación no
    // existe para el cliente y responde 503 sin tocar la conversación.
    if (!leads.runConversationTurn) {
      return res.status(503).json({ error: 'Asistente no disponible.' });
    }
    try {
      const turn = await leads.runConversationTurn({
        conversationId: req.params.conversationId,
        content: body.content,
      });
      return turn ? res.json(turn) : res.status(404).json({ error: 'Conversación no encontrada.' });
    } catch (error) {
      if (!(error instanceof ConversationTurnError)) throw error;
      const status = turnErrorStatus.get(error.code) ?? 500;
      return res.status(status).json({ error: 'No se pudo completar el turno.' });
    }
  }, turnBody));

  return router;
}
