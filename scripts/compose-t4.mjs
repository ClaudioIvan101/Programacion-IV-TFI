// Carga claves locales y delega a Compose sin incluir los PEM en argumentos ni registros.

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);

async function run() {
  if (args.length === 0) throw new Error('Uso: node scripts/compose-t4.mjs <comando de Compose>');

  let privatePem;
  let publicPem;
  try {
    [privatePem, publicPem] = await Promise.all([
      readFile(new URL('secrets/service-jwt-private.pem', root), 'utf8'),
      readFile(new URL('secrets/service-jwt-public.pem', root), 'utf8'),
    ]);
    if (!privatePem.trim() || !publicPem.trim()) throw new Error();
  } catch {
    throw new Error('No se pudieron cargar las claves. Genere el par con node scripts/generate-service-jwt-keys.mjs.');
  }

  // Solo el proceso Compose recibe los PEM; el archivo adicional los monta como secretos.
  const result = spawnSync('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.t4.yaml', ...args], {
    cwd: fileURLToPath(root),
    env: { ...process.env, T4_SERVICE_JWT_PRIVATE_PEM: privatePem, T4_SERVICE_JWT_PUBLIC_PEM: publicPem },
    stdio: 'inherit',
  });
  if (result.error) throw new Error('No se pudo iniciar Docker Compose.');
  return result.status ?? 1;
}

try {
  process.exitCode = await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
