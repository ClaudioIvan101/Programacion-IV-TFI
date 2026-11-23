-- La migración 004 define los canales de campaña y los formularios de captación.
-- 1. Crea la tabla que guarda los datos de cada lead.
CREATE TABLE leads (
  -- 2. PostgreSQL genera un ID único para cada lead cuando no se indica uno.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 3. Guarda los datos de contacto y limita la longitud de cada campo.
  name TEXT CHECK (char_length(name) <= 120 AND name ~ '[^[:space:]]'),
  email TEXT CHECK (char_length(email) <= 254 AND email ~ '[^[:space:]]'),
  phone TEXT CHECK (char_length(phone) <= 40 AND phone ~ '[^[:space:]]'),

  -- Cada referencia conserva el origen informado, incluso si falta la campaña.
  -- 4. Si se indica una campaña, su ID tiene que existir en la tabla campaigns.
  campaign_id UUID REFERENCES campaigns (id),
  -- 5. El canal indica si el lead llegó por formulario o mensajería simulada.
  channel TEXT CHECK (channel IN ('form', 'simulated_messaging')),
  -- 6. Si se indica un formulario, su ID tiene que existir en la tabla forms.
  form_id UUID REFERENCES forms (id),

  -- 7. Guarda qué busca el lead, su presupuesto y la urgencia de la consulta.
  needs TEXT CHECK (char_length(needs) <= 2000 AND needs ~ '[^[:space:]]'),
  budget_amount NUMERIC CHECK (budget_amount BETWEEN 0 AND 1000000000000),
  budget_currency TEXT CHECK (budget_currency IN ('ARS', 'USD')),
  urgency TEXT CHECK (char_length(urgency) <= 300 AND urgency ~ '[^[:space:]]'),

  -- 8. Por defecto, el lead empieza como 'nuevo' y se registra su fecha de creación.
  status TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (status IN ('nuevo', 'en calificación', 'calificado', 'no calificado', 'asignado', 'cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 9. Si se informa una moneda, también se tiene que informar un monto.
  CHECK (budget_currency IS NULL OR budget_amount IS NOT NULL),
  -- 10. Si se informa un formulario, el canal debe ser 'form'.
  CHECK (form_id IS NULL OR channel IS NOT DISTINCT FROM 'form'),
  -- 11. Si se informan campaña y canal, ese canal debe estar habilitado para la campaña.
  FOREIGN KEY (campaign_id, channel) REFERENCES campaign_channels (campaign_id, channel)
);

-- 12. Crea la tabla de conversaciones y vincula cada conversación con su lead.
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Crea la tabla de mensajes y vincula cada mensaje con su conversación.
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations (id),
  -- 14. El rol indica quién escribió el mensaje y el contenido debe tener texto.
  role TEXT NOT NULL CHECK (role IN ('lead', 'assistant')),
  content TEXT NOT NULL
    CHECK (char_length(content) <= 4000 AND content ~ '[^[:space:]]'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. Este índice facilita buscar todas las conversaciones de un lead.
CREATE INDEX conversations_lead_id_idx ON conversations (lead_id);
-- 16. Este índice facilita consultar el historial en orden de creación.
CREATE INDEX messages_conversation_history_idx ON messages (conversation_id, created_at, id);
