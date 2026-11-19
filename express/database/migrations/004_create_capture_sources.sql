CREATE TABLE campaign_channels (
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  channel TEXT NOT NULL CHECK (channel IN ('form', 'simulated_messaging')),
  CONSTRAINT campaign_channels_unique UNIQUE (campaign_id, channel)
);

CREATE TABLE forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  campaign_id UUID REFERENCES campaigns(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
