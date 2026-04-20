import { json, internalError } from '../lib/response.js';
import type { Env } from '../lib/response.js';

// GET /api/tracking/:code — public endpoint, does NOT expose customer_name [BAIXA-04]
export async function handleTracking(_req: Request, env: Env, code: string): Promise<Response> {
  try {
    if (!code) return json({ success: false, error: 'Código de rastreio obrigatório' }, 400);
    const order = await env.DB.prepare(
      'SELECT id, tracking_code, status, created_at, updated_at FROM orders WHERE tracking_code = ?'
    ).bind(code).first();
    if (!order) return json({ success: false, error: 'Código não encontrado' }, 404);
    return json({ success: true, data: order });
  } catch (error) {
    return internalError(error, 'tracking');
  }
}
