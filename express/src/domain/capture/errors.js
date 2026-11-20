// Los errores del dominio permiten distinguir datos inválidos, recursos ausentes y duplicados sin depender de HTTP ni de SQL.
export class InvalidCaptureError extends Error {}
export class CampaignNotFoundError extends Error {}
export class FormNotFoundError extends Error {}
export class DuplicateChannelError extends Error {}
