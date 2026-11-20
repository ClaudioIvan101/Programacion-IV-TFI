import { DuplicateEmailError } from '../domain/users/createUser.js';

const publicColumns = 'id, name, email, role, status, created_at AS "createdAt", updated_at AS "updatedAt"';

export function createPostgresUserRepository(pool) {
  return {
    async create({ name, email, passwordHash, role }) {
      try {
        const result = await pool.query(
          `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${publicColumns}`,
          [name, email, passwordHash, role],
        );
        return result.rows[0];
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'users_email_unique') {
          throw new DuplicateEmailError('El correo ya está registrado.');
        }
        throw error;
      }
    },
    async list() {
      return (await pool.query(`SELECT ${publicColumns} FROM users ORDER BY created_at, id`)).rows;
    },
    async findById(id) {
      return (await pool.query(`SELECT ${publicColumns} FROM users WHERE id = $1`, [id])).rows[0] ?? null;
    },
    async findCredentialsByEmail(email) {
      // Solo el login necesita leer el hash. La búsqueda usa el índice de lower(email).
      return (await pool.query(
        'SELECT id, status, password_hash AS "passwordHash" FROM users WHERE lower(email) = $1',
        [email],
      )).rows[0] ?? null;
    },
  };
}
