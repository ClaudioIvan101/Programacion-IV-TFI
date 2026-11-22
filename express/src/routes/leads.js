import { Router } from 'express';
import { z } from 'zod'; // Libreria para validar los datos
import { InvalidLeadError } from '../domain/leads/createLead.js';

const id = z.string().uuid();
// Evitamos que la codificación UTF-8 reemplace caracteres inválidos o envíe un carácter nulo a PostgreSQL.
const validPostgresText = (value) => value.isWellFormed() && !value.includes('\0');
const text = (max) => z.string().trim().min(1).max(max).refine(validPostgresText);
//Define la regla de los campos del LEAD
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
  //el campo role define si lo escribio un lead o el assitant
  role: z.enum(['lead', 'assistant']),
  content: z.string().max(4000).refine((value) => value.trim().length > 0 && validPostgresText(value)),
});

// Validamos los parámetros antes de pasar datos a PostgreSQL y usamos el mismo contrato de errores de la API.
function validate(handler, schema) {
  return async (req, res) => {
    // Rechaza parámetros como ?page=1 e IDs de la URL que no sean UUID válidos.
    if (Object.keys(req.query).length || Object.values(req.params).some((value) => !id.safeParse(value).success)) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }
    // Si la ruta no tiene un esquema para el cuerpo, ya puede atender el pedido.
    if (!schema) return handler(req, res);

    // Si hay un esquema para el cuerpo, el cliente debe enviarlo como JSON.
    if (req.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return res.status(415).json({ error: 'El cuerpo debe enviarse como application/json.' });
    }
    // Comprueba los datos del cuerpo y frena el pedido si no cumplen el esquema.
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Datos inválidos.' });
    // Ejecuta la función de la ruta con los datos que procesó el esquema.
    return handler(req, res, body.data);
  };
}

export function createLeadRouter(leads) {
  const router = Router();

  // Crea un lead con los datos del cuerpo de la petición.
  router.post('/leads', validate(async (req, res, body) => {
    try {
      return res.status(201).json(await leads.createLead(body));
    } catch (error) {
      if (error instanceof InvalidLeadError) return res.status(400).json({ error: error.message });
      throw error;
    }
  }, leadBody));

  // Lista todos los leads registrados.
  router.get('/leads', validate(async (req, res) => res.json(await leads.listLeads())));
  // Consultamos un lead especifico por su id.
  router.get('/leads/:leadId', validate(async (req, res) => {
    const lead = await leads.getLead(req.params.leadId);
    return lead ? res.json(lead) : res.status(404).json({ error: 'Lead no encontrado.' });
  }));

  // Crea una conversación para el lead indicado en la URL y recibe un objeto JSON vacío.
  router.post('/leads/:leadId/conversations', validate(async (req, res) => {
    const conversation = await leads.createConversation(req.params.leadId);
    return conversation ? res.status(201).json(conversation) : res.status(404).json({ error: 'Lead no encontrado.' });
  }, z.strictObject({})));
  // Express guarda el ID de la URL en req.params.leadId para listar las conversaciones de ese lead.
  router.get('/leads/:leadId/conversations', validate(async (req, res) => {
    const conversations = await leads.listConversations(req.params.leadId);
    return conversations ? res.json(conversations) : res.status(404).json({ error: 'Lead no encontrado.' });
  }));

  // Consulta una conversación específica por el ID que viene en la URL.
  router.get('/conversations/:conversationId', validate(async (req, res) => {
    const conversation = await leads.getConversation(req.params.conversationId);
    return conversation ? res.json(conversation) : res.status(404).json({ error: 'Conversación no encontrada.' });
  }));

  // Agrega un mensaje a la conversación indicada en la URL.
  router.post('/conversations/:conversationId/messages', validate(async (req, res, body) => {
    const message = await leads.createMessage(req.params.conversationId, body);
    return message ? res.status(201).json(message) : res.status(404).json({ error: 'Conversación no encontrada.' });
  }, messageBody));
  // Lista los mensajes de la conversación indicada en la URL.
  router.get('/conversations/:conversationId/messages', validate(async (req, res) => {
    const messages = await leads.listMessages(req.params.conversationId);
    return messages ? res.json(messages) : res.status(404).json({ error: 'Conversación no encontrada.' });
  }));
  //Busca un mensaje específico dentro de la conversación y lo devuelve como JSON si lo encuentra.
  router.get('/conversations/:conversationId/messages/:messageId', validate(async (req, res) => {
    const message = await leads.getMessage(req.params.conversationId, req.params.messageId);
    return message ? res.json(message) : res.status(404).json({ error: 'Mensaje no encontrado.' });
  }));

  return router;
}
