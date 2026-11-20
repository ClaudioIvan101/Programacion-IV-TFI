// Hash ficticio con el formato de scrypt para hacer la misma verificación si el correo no existe.
const dummyHash = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export function makeLogin({ userRepository, verifyPassword, issueToken }) {
  return async function login({ email, password }) {
    const user = await userRepository.findCredentialsByEmail(email.toLowerCase());
    const matches = await verifyPassword(password, user?.passwordHash ?? dummyHash);
    // Correo desconocido, contraseña incorrecta y cuenta inactiva comparten el mismo error.
    if (!matches || user?.status !== 'active') return null;
    return issueToken(user.id);
  };
}
