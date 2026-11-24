-- Up Migration
CREATE TABLE lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES leads(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  qualification_id UUID NOT NULL REFERENCES lead_qualifications(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  first_contact_at TIMESTAMPTZ CHECK (first_contact_at >= assigned_at),
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sending', 'sent', 'failed', 'uncertain')),
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts BETWEEN 0 AND 3),
  notification_sent_at TIMESTAMPTZ,
  CHECK ((notification_status = 'sent') = (notification_sent_at IS NOT NULL))
);

CREATE INDEX lead_assignments_seller_idx ON lead_assignments (seller_id, assigned_at DESC);

-- Down Migration
DROP TABLE lead_assignments;
