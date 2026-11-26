export function leadContact(input) {
  const value = input.trim();
  if (!value) return { email: null, phone: null };
  if (value.includes('@')) {
    if (value.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)) {
      return { email: value, phone: null };
    }
  } else if (value.length <= 40 && /^\+?[\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 3) {
    return { email: null, phone: value };
  }
  throw new Error('Ingrese un correo o teléfono válido.');
}
