export function publicCapture(formId, fetcher = fetch) {
  const path = '/api/public/forms/' + encodeURIComponent(formId);

  async function request(options) {
    const response = await fetcher(path, options);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(response.status === 404 ? 'El formulario no existe.' :
      data?.error || 'No se pudo procesar la consulta.');
    return data;
  }

  return {
    async load(signal) {
      const data = await request({ signal });
      if (typeof data?.name !== 'string') throw new Error('No se pudo cargar el formulario.');
      return data;
    },
    async submit(fields) {
      const body = Object.fromEntries(['name', 'email', 'phone', 'needs']
        .map((key) => [key, fields[key]?.trim()]).filter(([, value]) => value));
      if (!body.name) throw new Error('Ingrese el nombre.');
      if (!body.email && !body.phone) throw new Error('Ingrese un correo o teléfono de contacto.');
      const result = await request({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (result?.received !== true) throw new Error('No se pudo confirmar la recepción de la consulta.');
    },
  };
}
