export class InvalidUserError extends Error {}
export class DuplicateEmailError extends Error {}

// Devuelve solo los datos públicos del usuario.
export function publicUser(user) {
  if (!user) return null;
  const { id, name, email, role, status, createdAt, updatedAt } = user;
  return { id, name, email, role, status, createdAt, updatedAt };
}

export function makeCreateUser({ userRepository, hashPassword }) {
  return async function createUser(input) {
    // Revisa el nombre, el email, la contraseña y el rol antes de crear el usuario.
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 ||
        typeof input.email !== 'string' || input.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
        typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 1024 ||
        !['administrador', 'supervisor', 'vendedor'].includes(input.role)) {
      throw new InvalidUserError('Datos de usuario inválidos.');
    }
    // Genera el hash de la contraseña para guardar ese valor en la base de datos.
    const passwordHash = await hashPassword(input.password);
    // Quita espacios de los extremos, pasa el email a minúsculas y guarda el usuario.
    const user = await userRepository.create({ name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash, role: input.role });
    return publicUser(user);
  };
}
