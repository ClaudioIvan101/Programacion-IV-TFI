export const screenApiRoutes = {
  login: [
    ['POST /api/auth/login', 'Verifica las credenciales y devuelve el token de sesión.', 'auth'],
  ],
  resumen: [
    ['GET /api/leads', 'Lista los interesados para calcular el total.', 'leads'],
    ['GET /api/leads/:leadId/qualifications', 'Consulta el historial de cada interesado y toma su última calificación.', 'qualification'],
  ],
  chat: [
    ['GET /api/leads', 'Carga los interesados que se pueden seleccionar.', 'leads'],
    ['POST /api/leads', 'Registra un interesado con sus datos y origen.', 'leads'],
    ['GET /api/campaigns', 'Lista las campañas para el registro de interesados.', 'campaigns'],
    ['GET /api/campaigns/:id/channels', 'Consulta los canales habilitados de la campaña.', 'capture'],
    ['GET /api/campaigns/:id/forms', 'Consulta los formularios de origen de la campaña.', 'capture'],
    ['GET /api/leads/:leadId/conversations', 'Lista las conversaciones del interesado.', 'leads'],
    ['POST /api/leads/:leadId/conversations', 'Abre una conversación para el interesado.', 'leads'],
    ['GET /api/conversations/:conversationId/messages', 'Carga los mensajes de la conversación.', 'leads'],
    ['POST /api/conversations/:conversationId/turn', 'Envía el mensaje y devuelve el contexto del interesado, los campos faltantes y la respuesta del asistente.', 'leads'],
  ],
  campanas: [
    ['GET /api/campaigns', 'Lista las campañas con paginación.', 'campaigns'],
    ['POST /api/campaigns', 'Guarda una campaña nueva.', 'campaigns'],
  ],
  captacion: [
    ['GET /api/campaigns', 'Carga las campañas disponibles para seleccionar.', 'campaigns'],
    ['GET /api/campaigns/:id/channels', 'Lista los canales de la campaña.', 'capture'],
    ['POST /api/campaigns/:id/channels', 'Agrega un canal a la campaña.', 'capture'],
    ['GET /api/campaigns/:id/forms', 'Lista los formularios asociados a la campaña.', 'capture'],
    ['POST /api/forms', 'Crea un formulario asociado a la campaña.', 'capture'],
  ],
  calificacion: [
    ['GET /api/leads', 'Carga los interesados que se pueden calificar.', 'leads'],
    ['GET /api/leads/:leadId/conversations', 'Lista las conversaciones disponibles para registrar datos.', 'leads'],
    ['GET /api/leads/:leadId/qualifications', 'Consulta el historial de calificaciones.', 'qualification'],
    ['PATCH /api/leads/:leadId/conversations/:conversationId/qualification-data', 'Guarda los datos comerciales a partir de la conversación.', 'qualification'],
    ['POST /api/lead-scoring-rule-sets', 'Publica una nueva versión de las reglas de calificación.', 'qualification'],
    ['POST /api/leads/:leadId/qualifications', 'Calcula y guarda la calificación con la versión indicada.', 'qualification'],
  ],
  usuarios: [
    ['GET /api/users', 'Lista las cuentas del equipo.', 'users'],
    ['GET /api/users/:id', 'Carga el detalle de la cuenta seleccionada.', 'users'],
    ['POST /api/users', 'Crea una cuenta con el rol elegido.', 'users'],
  ],
};
