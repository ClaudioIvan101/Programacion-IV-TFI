# Contrato de origen para integrar con leads

El futuro módulo de leads acuerda `campaignId` (UUID o null), `channel` (texto o null) y `formId` (UUID o null). Los tres pueden ser null; no se infieren campañas ni formularios.

Una clave foránea válida no demuestra coherencia entre los tres campos. Al integrar la creación de leads, Express debe comprobar que el formulario pertenezca a la campaña si ambos se informan, y que el canal esté asociado a la campaña si ambos se informan. Esta integración y la migración 005 pertenecen al módulo de leads y no están implementadas aquí.
