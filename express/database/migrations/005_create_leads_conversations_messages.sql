-- La 004 se reserva para captación. En bases compartidas debe aplicarse antes de la 005.
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT CHECK (char_length(name) <= 120 AND name ~ '[^[:space:]]'),
  email TEXT CHECK (char_length(email) <= 254 AND email ~ '[^[:space:]]'),
  phone TEXT CHECK (char_length(phone) <= 40 AND phone ~ '[^[:space:]]'),

  -- La campaña ya existe. Canal y formulario conservan el origen declarado.
  campaign_id UUID REFERENCES campaigns (id),
  channel TEXT CHECK (channel ~ '[^[:space:]]'),
  form_id TEXT CHECK (form_id ~ '[^[:space:]]'),

  needs TEXT CHECK (char_length(needs) <= 2000 AND needs ~ '[^[:space:]]'),
  budget_amount NUMERIC CHECK (budget_amount BETWEEN 0 AND 1000000000000),
  budget_currency TEXT CHECK (budget_currency IN ('ARS', 'USD')),
  urgency TEXT CHECK (char_length(urgency) <= 300 AND urgency ~ '[^[:space:]]'),

  status TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (status IN ('nuevo', 'en calificación', 'calificado', 'no calificado', 'asignado', 'cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (budget_currency IS NULL OR budget_amount IS NOT NULL)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations (id),
  role TEXT NOT NULL CHECK (role IN ('lead', 'assistant')),
  content TEXT NOT NULL
    CHECK (char_length(content) <= 4000 AND content ~ '[^[:space:]]'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX conversations_lead_id_idx ON conversations (lead_id);
CREATE INDEX messages_conversation_history_idx ON messages (conversation_id, created_at, id);
