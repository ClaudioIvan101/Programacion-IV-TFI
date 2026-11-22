// Genera el par RSA que firma y verifica el JWT de servicio T4.
// La carpeta secrets/ se mantiene fuera de Git; no se sobrescriben claves.

import { generateKeyPairSync } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';

const directory = new URL('../secrets/', import.meta.url);

async function generateKeys() {
  if (process.argv.length !== 2) {
    throw new Error('Uso: node scripts/generate-service-jwt-keys.mjs');
  }

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keys = [
    ['service-jwt-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }), 0o600],
    ['service-jwt-public.pem', publicKey.export({ type: 'spki', format: 'pem' }), 0o644],
  ];

  const created = [];
  try {
    for (const [name, pem, mode] of keys) {
      const file = new URL(name, directory);
      // La apertura exclusiva también impide sobrescribir en ejecuciones simultáneas.
      const handle = await open(file, 'wx', mode);
      created.push(file);
      try {
        await handle.writeFile(pem);
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    // Si el par queda incompleto, solo se retiran los archivos de esta ejecución.
    await Promise.allSettled(created.map((file) => unlink(file)));
    if (error.code === 'EEXIST') throw new Error('No se generaron claves: ya existe un archivo en secrets/.');
    throw new Error('No se pudo escribir el par de claves en secrets/.');
  }
}

try {
  await generateKeys();
  console.log('Claves de servicio generadas en secrets/.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
