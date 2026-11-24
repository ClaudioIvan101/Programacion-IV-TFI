ALTER TABLE messages
  ADD COLUMN turn_result JSONB
  CHECK (turn_result IS NULL OR (role = 'assistant' AND jsonb_typeof(turn_result) = 'object'));
