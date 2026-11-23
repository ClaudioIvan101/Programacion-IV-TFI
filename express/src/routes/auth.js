import { Router } from 'express';
import { z } from 'zod';

// Define los datos que acepta el inicio de sesión.
const credentialsSchema = z.strictObject({
  email: z.string().trim().max(254).email(),
  password: z.string().min(1).max(1024),
});

export function createAuthRouter({ login }) {
  const router = Router();
  // Atiende solicitudes POST /auth/login.
  router.post('/login', async (req, res) => {
    // La respuesta puede contener un token y se entrega sin caché.
    res.set('Cache-Control', 'no-store');
    if (req.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return res.status(415).json({ error: 'El cuerpo debe enviarse como application/json.' });
    }
    // Revisa el cuerpo con Zod y rechaza parámetros de consulta.
    const credentials = credentialsSchema.safeParse(req.body);
    if (!credentials.success || Object.keys(req.query).length) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }
    if (!login) return res.status(503).json({ error: 'Inicio de sesión no disponible.' });

    // Intenta iniciar sesión con los datos validados.
    const token = await login(credentials.data);
    if (!token) return res.status(401).json({ error: 'Credenciales inválidas.' });
    return res.json(token);
  });
  return router;
}
