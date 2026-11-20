import { makeCreateUser } from '../domain/users/createUser.js';
import { hashPassword } from './passwordHasher.js';
import { createPostgresUserRepository } from './userRepository.js';

export async function createFirstAdmin(pool, input) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    // El bloqueo cubre la comprobación y el alta, incluso con otros procesos escribiendo en users.
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const { rowCount } = await client.query("SELECT 1 FROM users WHERE role = 'administrador' LIMIT 1");

    const createUser = makeCreateUser({ userRepository: createPostgresUserRepository(client), hashPassword });
    const user = rowCount ? null : await createUser({ ...input, role: 'administrador' });
    await client.query('COMMIT');
    return user;
  } catch (error) {
    // Si la conexión no confirma el rollback, el pool la descarta.
    await client.query('ROLLBACK').catch(() => { discard = true; });
    throw error;
  } finally {
    client.release(discard);
  }
}
