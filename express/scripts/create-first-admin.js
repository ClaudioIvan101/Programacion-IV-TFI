import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { DuplicateEmailError, InvalidUserError } from '../src/domain/users/createUser.js';
import { createFirstAdmin } from '../src/infra/createFirstAdmin.js';
import { createPostgresPool } from '../src/infra/postgres.js';

async function readCredentials() {
  let hidden = false;
  // readline conserva la edición de línea y deja de enviar caracteres a la terminal durante la contraseña.
  const output = new Writable({
    write(chunk, encoding, done) {
      if (hidden) done();
      else stdout.write(chunk, encoding, done);
    },
  });
  const terminal = createInterface({ input: stdin, output, terminal: true, historySize: 0 });
  const cancellation = new AbortController();
  terminal.on('SIGINT', () => cancellation.abort());
  terminal.on('close', () => cancellation.abort());
  const options = { signal: cancellation.signal };
  try {
    const name = await terminal.question('Nombre: ', options);
    const email = await terminal.question('Email: ', options);
    stdout.write('Contraseña (entrada oculta): ');
    hidden = true;
    const password = await terminal.question('', options);
    return { name, email, password };
  } finally {
    terminal.close();
    if (hidden) stdout.write('\n');
  }
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error('Ejecutá el comando en una terminal interactiva.');
    return 1;
  }

  let pool;
  try {
    const input = await readCredentials();
    pool = createPostgresPool();
    const user = await createFirstAdmin(pool, input);
    if (!user) {
      console.error('Ya existe un administrador.');
      return 1;
    }
    console.log('Primer administrador creado.');
    return 0;
  } catch (error) {
    // Se reportan mensajes fijos para evitar exponer datos ingresados o detalles de la base.
    if (error.name === 'AbortError') console.error('Alta cancelada.');
    else if (error instanceof InvalidUserError) console.error('Revisá el nombre, el email y la contraseña (12 a 1024 caracteres).');
    else if (error instanceof DuplicateEmailError) console.error('El email ya está registrado.');
    else console.error('No se pudo crear el administrador. Revisá la conexión y las migraciones de PostgreSQL.');
    return 1;
  } finally {
    await pool?.end();
  }
}

process.exitCode = await main();
