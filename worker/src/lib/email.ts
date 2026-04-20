/**
 * CDM STORES — Email sending via Resend
 */
import { logger } from './logger.js';
import type { Env } from './response.js';

export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY não configurado — email não enviado');
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: 'noreply@cdmstores.com', to, subject, html }),
    });
    if (!response.ok) {
      const err = await response.json();
      logger.error('Erro ao enviar email:', err);
      return false;
    }
    logger.log(`✉️ Email enviado para ${to}`);
    return true;
  } catch (error) {
    logger.error(
      'Erro ao enviar email via Resend:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
