-- Ampliamos leads y reglas de puntaje para soportar zonas prioritarias, financiación,
-- criterios personalizados, umbrales de revisión y estado de versión.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS zone TEXT CHECK (char_length(zone) <= 120 AND zone ~ '[^[:space:]]'),
  ADD COLUMN IF NOT EXISTS financing TEXT CHECK (char_length(financing) <= 120 AND financing ~ '[^[:space:]]'),
  ADD COLUMN IF NOT EXISTS custom_checks JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(custom_checks) = 'object');

ALTER TABLE lead_scoring_rule_sets
  DROP CONSTRAINT IF EXISTS lead_scoring_rule_sets_rules_check,
  ADD COLUMN IF NOT EXISTS name TEXT CHECK (char_length(name) <= 120 AND name ~ '[^[:space:]]'),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'archived'
    CHECK (status IN ('active', 'draft', 'archived')),
  ADD COLUMN IF NOT EXISTS discard_threshold INTEGER CHECK (discard_threshold BETWEEN 0 AND 999999),
  ADD CONSTRAINT lead_scoring_rule_sets_rules_check
    CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) BETWEEN 1 AND 25);

UPDATE lead_scoring_rule_sets
SET name = 'Estándar v' || version
WHERE name IS NULL;

UPDATE lead_scoring_rule_sets
SET status = 'active'
WHERE version = (SELECT MAX(version) FROM lead_scoring_rule_sets)
  AND NOT EXISTS (SELECT 1 FROM lead_scoring_rule_sets WHERE status = 'active');

CREATE UNIQUE INDEX IF NOT EXISTS lead_scoring_rule_sets_one_active_idx
  ON lead_scoring_rule_sets ((1))
  WHERE status = 'active';

ALTER TABLE lead_qualifications
  DROP CONSTRAINT IF EXISTS lead_qualifications_decision_check,
  ADD CONSTRAINT lead_qualifications_decision_check
    CHECK (decision IN ('pending', 'qualified', 'review', 'not_qualified'));
