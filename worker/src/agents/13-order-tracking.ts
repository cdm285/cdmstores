/**
 * Agent 13 — Order Tracking (Tier 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches order status from D1 by tracking code, order id, or email.
 * Returns a structured and formatted tracking result.
 *
 * Security:
 *   • All DB queries use prepared statements with bound parameters
 *   • Email is lowercased before binding (normalisation, not encryption)
 *   • Order data is never logged in detail
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace }   from '../core/agent-context.js';
import type { ActionRequest, ActionResult } from '../core/action-schema.js';
import { failedResult }                     from '../core/action-schema.js';
import type { AgentEnv }                    from '../core/types.js';

// ─── D1 row shapes ────────────────────────────────────────────────────────────
interface OrderRow {
  id            : number;
  status        : string;
  tracking_code : string | null;
  created_at    : string;
  updated_at    : string;
  customer_email: string;
  total         : number;
}

// ─── Status display map ───────────────────────────────────────────────────────
const STATUS_ICONS: Record<string, string> = {
  pending    : '⏳',
  processing : '📦',
  shipped    : '🚚',
  delivered  : '✅',
  cancelled  : '❌',
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  pending    : { pt: 'Pendente',    en: 'Pending',    es: 'Pendiente'   },
  processing : { pt: 'Processando', en: 'Processing', es: 'Procesando'  },
  shipped    : { pt: 'Enviado',     en: 'Shipped',    es: 'Enviado'     },
  delivered  : { pt: 'Entregue',    en: 'Delivered',  es: 'Entregado'   },
  cancelled  : { pt: 'Cancelado',   en: 'Cancelled',  es: 'Cancelado'   },
};

function renderOrder(order: OrderRow, lang: string): string {
  const icon   = STATUS_ICONS[order.status] ?? '📦';
  const label  = STATUS_LABELS[order.status]?.[lang] ?? order.status;
  const track  = order.tracking_code ? `\n🔍 Código de rastreio: \`${order.tracking_code}\`` : '';
  const update = order.updated_at.split('T')[0]; // YYYY-MM-DD

  if (lang === 'en') {
    return `📦 **Order #${order.id}**\n${icon} Status: ${label}\n🗓 Updated: ${update}${track.replace('Código de rastreio', 'Tracking code')}`;
  }
  if (lang === 'es') {
    return `📦 **Pedido #${order.id}**\n${icon} Estado: ${label}\n🗓 Actualizado: ${update}${track.replace('Código de rastreio', 'Código de seguimiento')}`;
  }
  return `📦 **Pedido #${order.id}**\n${icon} Status: ${label}\n🗓 Atualizado: ${update}${track}`;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent13OrderTracking {
  readonly id   = '13-order-tracking';
  readonly name = 'OrderTrackingAgent';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, req: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    if (req.payload.type !== 'order_track') {
      return failedResult(req, 'Wrong payload type for OrderTracking');
    }

    const { tracking_code, order_id, email } = req.payload.params;
    const lang = req.language ?? 'pt';
    const env  = ctx.env as AgentEnv;

    if (!env.DB) {
      return failedResult(req, 'D1 binding missing', Date.now() - start);
    }

    try {
      let order: OrderRow | null = null;

      // 1. By tracking code (most specific)
      if (tracking_code) {
        order = await env.DB
          .prepare('SELECT id, status, tracking_code, created_at, updated_at, customer_email, total FROM orders WHERE tracking_code = ? LIMIT 1')
          .bind(tracking_code.toUpperCase())
          .first<OrderRow>();
      }

      // 2. By internal order id
      if (!order && order_id) {
        order = await env.DB
          .prepare('SELECT id, status, tracking_code, created_at, updated_at, customer_email, total FROM orders WHERE id = ? LIMIT 1')
          .bind(order_id)
          .first<OrderRow>();
      }

      // 3. By email — return most recent order
      if (!order && email) {
        order = await env.DB
          .prepare('SELECT id, status, tracking_code, created_at, updated_at, customer_email, total FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT 1')
          .bind(email.toLowerCase())
          .first<OrderRow>();
      }

      if (!order) {
        const key  = tracking_code ?? (order_id ? `#${order_id}` : email ?? '—');
        const msgs: Record<string, string> = {
          pt: `❌ Nenhum pedido encontrado para **${key}**.\n\nVerifique os dados e tente novamente, ou envie seu email para buscarmos o pedido.`,
          en: `❌ No order found for **${key}**.\n\nCheck the details and try again, or send your email so we can look up your order.`,
          es: `❌ No se encontró ningún pedido para **${key}**.\n\nVerifica los datos e inténtalo de nuevo, o envía tu email para buscar tu pedido.`,
        };
        const result: ActionResult = { id: req.id, actionType: 'order_track', success: false, response: msgs[lang] ?? msgs.pt, error: 'not_found', latencyMs: Date.now() - start, ts: Date.now() };
        addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: result.latencyMs, error: 'not_found' });
        return result;
      }

      const response = renderOrder(order, lang);
      const result: ActionResult = {
        id: req.id, actionType: 'order_track', success: true,
        response,
        data          : { orderId: order.id, status: order.status, trackingCode: order.tracking_code, updatedAt: order.updated_at },
        action        : 'tracking_found',
        actionPayload : { data: { id: order.id, status: order.status, tracking_code: order.tracking_code } },
        latencyMs     : Date.now() - start,
        ts            : Date.now(),
      };
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
      return result;

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
      return failedResult(req, error, Date.now() - start);
    }
  }
}

export const agent13OrderTracking = new Agent13OrderTracking();
export default agent13OrderTracking;
