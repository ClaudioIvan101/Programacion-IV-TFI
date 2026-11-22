-- El contexto T4 acumulado pertenece a la conversación, no al lead.
--
-- Un lead puede tener varias conversaciones (formulario, mensajería simulada) y
-- cada una lleva su propio avance. Guardarlo en `leads` haría que un turno
-- pisara el contexto de la otra conversación.
--
-- NULL significa "esta conversación todavía no tiene contexto propio"; en ese
-- caso el primer turno lo inicializa a partir de los datos ya conocidos del lead.
ALTER TABLE conversations
  ADD COLUMN context JSONB
  CHECK (context IS NULL OR jsonb_typeof(context) = 'object');
