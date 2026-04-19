/**
 * CDM STORES — Schedule / appointments route
 * POST /api/schedule
 */

import { json, internalError } from '../lib/response.js';
import type { Env } from '../lib/response.js';
import { EMAIL_REGEX } from '../lib/security.js';

export async function handleSchedule(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { customer_email, customer_name, customer_phone, scheduled_date, reason } = body as {
      customer_email?: string; customer_name?: string; customer_phone?: string;
      scheduled_date?: string; reason?: string;
    };

    if (!customer_email || !customer_name || !scheduled_date) {
      return json({ success: false, error: 'Dados incompletos' }, 400);
    }
    if (!EMAIL_REGEX.test(customer_email) || customer_email.length > 254) {
      return json({ success: false, error: 'Email inválido' }, 400);
    }

    const result = await env.DB.prepare(
      'INSERT INTO appointments (customer_email, customer_name, customer_phone, scheduled_date, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, "scheduled", datetime("now"), datetime("now"))'
    ).bind(customer_email, customer_name, customer_phone ?? null, scheduled_date, reason || 'support').run();

    return json({ success: true, appointment_id: result.meta.last_row_id, message: 'Agendamento realizado com sucesso!' });
  } catch (error) {
    return internalError(error, 'schedule');
  }
}
