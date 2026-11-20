import { z } from 'zod';
import { makeEvaluateLeadBudget } from '../domain/leads/evaluateLeadBudget.js';
import { makePreviewLeadQualification } from '../domain/leads/previewLeadQualification.js';
import { createPostgresLeadRepository } from '../infra/leadRepository.js';
import { createPostgresPool } from '../infra/postgres.js';

async function main(args) {
  const [leadId, currency, minimumAmount, points, threshold] = args;

  if (args.length !== 5 || args.some((value) => !value.trim()) ||
      !z.uuid().safeParse(leadId).success) {
    console.error('Uso: previewLeadQualification.js <uuid> <moneda> <monto mínimo> <puntos> <umbral>');
    return 1;
  }

  const pool = createPostgresPool();
  try {
    // Solo el CLI conoce PostgreSQL. El caso de uso recibe sus dependencias.
    const leadRepository = createPostgresLeadRepository(pool);
    const evaluateLeadBudget = makeEvaluateLeadBudget({ leadRepository });
    const preview = makePreviewLeadQualification({ evaluateLeadBudget });

    const result = await preview(leadId, {
      budgetRule: { currency, minimumAmount: Number(minimumAmount), points: Number(points) },
      threshold: Number(threshold),
    });

    if (result === null) {
      console.error('Lead no encontrado.');
      return 1;
    }

    console.log(JSON.stringify(result, null, 2));
    return 0;
  } finally {
    await pool.end();
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof TypeError ? error.message : 'No se pudo evaluar el lead.');
  process.exitCode = 1;
}