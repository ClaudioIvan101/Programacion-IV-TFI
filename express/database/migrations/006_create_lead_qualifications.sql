-- Una edición de reglas se registra como una versión nueva, nunca reemplaza el historial.
CREATE TABLE lead_scoring_rule_sets (
  version INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  threshold INTEGER NOT NULL CHECK (threshold BETWEEN 1 AND 1000000),
  rules JSONB NOT NULL CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  rule_set_version INTEGER NOT NULL REFERENCES lead_scoring_rule_sets(version),
  decision TEXT NOT NULL CHECK (decision IN ('pending', 'qualified', 'not_qualified')),
  score INTEGER,
  breakdown JSONB NOT NULL CHECK (jsonb_typeof(breakdown) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Pendiente no equivale a una calificación de cero.
  CHECK ((decision = 'pending') = (score IS NULL))
);

CREATE INDEX lead_qualifications_history_idx
  ON lead_qualifications (lead_id, created_at DESC, id DESC);
