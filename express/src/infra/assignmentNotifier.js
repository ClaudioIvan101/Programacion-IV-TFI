import nodemailer from 'nodemailer';
import { z } from 'zod';

// Envía texto plano y nunca usa los datos del interesado como destinatario.
export function createAssignmentNotifier(smtpUrl) {
  if (!smtpUrl) return async () => 'failed';

  const url = new URL(smtpUrl);
  if (!['smtp:', 'smtps:'].includes(url.protocol) || !url.hostname || url.search || url.hash) {
    throw new Error('ASSIGNMENT_SMTP_URL debe ser una URL SMTP sin parámetros.');
  }
  const transport = nodemailer.createTransport({
    url: smtpUrl,
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 4000,
    dnsTimeout: 4000,
    disableFileAccess: true,
    disableUrlAccess: true,
    maxRecipients: 1,
    // Mailpit puede ejecutarse en la propia máquina o en la red privada de Compose.
    allowInternalNetworkInterfaces: true,
  });
  const notDelivered = new Set(['EDNS', 'EAUTH', 'EENVELOPE']);
  return async function notify(message) {
    if (!z.email().safeParse(message.sellerEmail).success) return 'failed';
    try {
      const result = await transport.sendMail({
        from: 'LeadQual <derivaciones@leadqual.local>',
        to: { name: message.sellerName, address: message.sellerEmail },
        subject: 'Nuevo interesado derivado',
        messageId: '<asignacion-' + message.id + '@leadqual.local>',
        text: [
          'Tiene un nuevo interesado en el tablero de Derivación.',
          'Interesado: ' + (message.leadName ?? 'Sin nombre'),
          'Necesidad: ' + (message.needs ?? 'No registrada'),
          'Puntaje: ' + message.score + ' · Regla v' + message.ruleSetVersion,
          'Campaña: ' + (message.campaignName ?? 'Sin campaña'),
        ].join('\n'),
      });
      return result.accepted.length === 1 ? 'sent' : 'failed';
    } catch (error) {
      // Solo un fallo inequívoco permite reintentar; un timeout puede ocultar una entrega aceptada.
      return notDelivered.has(error.code) || error.originalCode === 'ECONNREFUSED' ? 'failed' : 'uncertain';
    }
  };
}
