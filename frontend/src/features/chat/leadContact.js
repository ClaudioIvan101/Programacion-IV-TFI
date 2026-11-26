const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const phonePattern = /^\+?[\d\s().-]+$/;

export function isValidEmail(input) {
  const value = String(input ?? '').trim();
  return value.length > 0 && value.length <= 254 && emailPattern.test(value);
}

export function isValidPhone(input) {
  const value = String(input ?? '').trim();
  if (!value || value.length > 40 || !phonePattern.test(value)) return false;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

export function leadContact(input) {
  const value = String(input ?? '').trim();
  if (!value) {
    throw new Error('Ingresá un correo electrónico o un número de teléfono.');
  }
  if (value.includes('@')) {
    if (isValidEmail(value)) {
      return { email: value, phone: null };
    }
    throw new Error('Ingresá un correo electrónico válido (ej. persona@correo.com).');
  }
  if (isValidPhone(value)) {
    return { email: null, phone: value };
  }
  throw new Error('Ingresá un correo o un teléfono válido (entre 7 y 15 dígitos).');
}
