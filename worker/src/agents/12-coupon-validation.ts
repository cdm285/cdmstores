/**
 * Agent 12 — Coupon Validation (Tier 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates a coupon code against the static table and optionally against D1.
 * Returns the discount amount (in BRL) and a human-readable response.
 *
 * Security:
 *   • Code must be uppercase alphanumeric, max 32 chars (validated upstream)
 *   • Timing-safe string comparison where applicable
 *   • No user-supplied data interpolated into SQL without binding
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { ActionRequest, ActionResult } from '../core/action-schema.js';
import { failedResult } from '../core/action-schema.js';
import type { AgentEnv } from '../core/types.js';

// ─── Static coupon table ──────────────────────────────────────────────────────
const COUPONS: Record<string, { discount: number; minOrder?: number; maxUses?: number }> = {
  NEWYEAR: { discount: 10.0 },
  PROMO: { discount: 5.0 },
  DESCONTO10: { discount: 10.0, minOrder: 50 },
  SAVE20: { discount: 20.0, minOrder: 100 },
  CDM10: { discount: 10.0 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function couponListMsg(lang: string): string {
  const list =
    '• NEWYEAR – R$ 10\n• PROMO – R$ 5\n• DESCONTO10 – R$ 10 (pedido mín. R$50)\n• SAVE20 – R$ 20 (pedido mín. R$100)\n• CDM10 – R$ 10';
  if (lang === 'en') {
    return `🎟️ Available coupons:\n${list.replace('pedido mín.', 'min. order')}`;
  }
  if (lang === 'es') {
    return `🎟️ Cupones disponibles:\n${list.replace('pedido mín.', 'pedido mín.')}`;
  }
  return `🎟️ Cupons disponíveis:\n${list}`;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent12CouponValidation {
  readonly id = '12-coupon-validation';
  readonly name = 'CouponValidationAgent';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, req: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    if (req.payload.type !== 'coupon_validate') {
      return failedResult(req, 'Wrong payload type for CouponValidation');
    }

    const { code, cart_total } = req.payload.params;
    const lang = req.language ?? 'pt';
    const upper = code.toUpperCase().trim();

    try {
      // 1. Static lookup (O(1), no DB round-trip)
      const staticEntry = COUPONS[upper];

      if (staticEntry) {
        // Check minimum order
        if (
          staticEntry.minOrder !== undefined &&
          cart_total !== undefined &&
          cart_total < staticEntry.minOrder
        ) {
          const minMsg: Record<string, string> = {
            pt: `❌ Cupom **${upper}** requer pedido mínimo de R$ ${staticEntry.minOrder.toFixed(2)}.`,
            en: `❌ Coupon **${upper}** requires a minimum order of R$ ${staticEntry.minOrder.toFixed(2)}.`,
            es: `❌ El cupón **${upper}** requiere un pedido mínimo de R$ ${staticEntry.minOrder.toFixed(2)}.`,
          };
          const result: ActionResult = {
            id: req.id,
            actionType: 'coupon_validate',
            success: false,
            response: minMsg[lang] ?? minMsg.pt,
            action: 'coupon_applied',
            actionPayload: { coupon_valid: false, discount: 0, code: upper, reason: 'min_order' },
            latencyMs: Date.now() - start,
            ts: Date.now(),
          };
          addTrace(ctx, {
            agentId: this.id,
            agentName: this.name,
            success: false,
            latencyMs: result.latencyMs,
            error: 'min_order_not_met',
          });
          return result;
        }

        const validMsg: Record<string, string> = {
          pt: `✅ Cupom **${upper}** válido! Desconto de R$ ${staticEntry.discount.toFixed(2)} aplicado! 🎉`,
          en: `✅ Coupon **${upper}** valid! R$ ${staticEntry.discount.toFixed(2)} discount applied! 🎉`,
          es: `✅ ¡Cupón **${upper}** válido! ¡Descuento de R$ ${staticEntry.discount.toFixed(2)} aplicado! 🎉`,
        };

        const result: ActionResult = {
          id: req.id,
          actionType: 'coupon_validate',
          success: true,
          response: validMsg[lang] ?? validMsg.pt,
          data: { code: upper, discount: staticEntry.discount },
          action: 'coupon_applied',
          actionPayload: { coupon_valid: true, discount: staticEntry.discount, code: upper },
          latencyMs: Date.now() - start,
          ts: Date.now(),
        };
        addTrace(ctx, {
          agentId: this.id,
          agentName: this.name,
          success: true,
          latencyMs: result.latencyMs,
        });
        return result;
      }

      // 2. D1 lookup for dynamic coupons (optional)
      const env = ctx.env as AgentEnv;
      if (env.DB) {
        try {
          const row = await env.DB.prepare(
            'SELECT code, discount_amount, min_order, active FROM coupons WHERE code = ? AND active = 1 LIMIT 1',
          )
            .bind(upper)
            .first<{
              code: string;
              discount_amount: number;
              min_order: number | null;
              active: number;
            }>();

          if (row) {
            if (row.min_order !== null && cart_total !== undefined && cart_total < row.min_order) {
              const minMsg: Record<string, string> = {
                pt: `❌ Cupom **${upper}** requer pedido mínimo de R$ ${row.min_order.toFixed(2)}.`,
                en: `❌ Coupon **${upper}** requires a minimum order of R$ ${row.min_order.toFixed(2)}.`,
                es: `❌ El cupón **${upper}** requiere un pedido mínimo de R$ ${row.min_order.toFixed(2)}.`,
              };
              const result: ActionResult = {
                id: req.id,
                actionType: 'coupon_validate',
                success: false,
                response: minMsg[lang] ?? minMsg.pt,
                action: 'coupon_applied',
                actionPayload: {
                  coupon_valid: false,
                  discount: 0,
                  code: upper,
                  reason: 'min_order',
                },
                latencyMs: Date.now() - start,
                ts: Date.now(),
              };
              addTrace(ctx, {
                agentId: this.id,
                agentName: this.name,
                success: false,
                latencyMs: result.latencyMs,
                error: 'min_order_not_met',
              });
              return result;
            }

            const validMsg: Record<string, string> = {
              pt: `✅ Cupom **${upper}** válido! Desconto de R$ ${row.discount_amount.toFixed(2)} aplicado! 🎉`,
              en: `✅ Coupon **${upper}** valid! R$ ${row.discount_amount.toFixed(2)} discount applied! 🎉`,
              es: `✅ ¡Cupón **${upper}** válido! ¡Descuento de R$ ${row.discount_amount.toFixed(2)} aplicado! 🎉`,
            };
            const result: ActionResult = {
              id: req.id,
              actionType: 'coupon_validate',
              success: true,
              response: validMsg[lang] ?? validMsg.pt,
              data: { code: upper, discount: row.discount_amount },
              action: 'coupon_applied',
              actionPayload: { coupon_valid: true, discount: row.discount_amount, code: upper },
              latencyMs: Date.now() - start,
              ts: Date.now(),
            };
            addTrace(ctx, {
              agentId: this.id,
              agentName: this.name,
              success: true,
              latencyMs: result.latencyMs,
            });
            return result;
          }
        } catch {
          /* fall through to invalid */
        }
      }

      // 3. Invalid coupon
      const invalidMsg: Record<string, string> = {
        pt: `❌ Cupom **${upper}** inválido.\n\n${couponListMsg('pt')}`,
        en: `❌ Coupon **${upper}** invalid.\n\n${couponListMsg('en')}`,
        es: `❌ Cupón **${upper}** inválido.\n\n${couponListMsg('es')}`,
      };
      const result: ActionResult = {
        id: req.id,
        actionType: 'coupon_validate',
        success: false,
        response: invalidMsg[lang] ?? invalidMsg.pt,
        action: 'coupon_applied',
        actionPayload: { coupon_valid: false, discount: 0, code: upper },
        latencyMs: Date.now() - start,
        ts: Date.now(),
      };
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: result.latencyMs,
        error: 'invalid_code',
      });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: Date.now() - start,
        error,
      });
      return failedResult(req, error, Date.now() - start);
    }
  }
}

export const agent12CouponValidation = new Agent12CouponValidation();
export default agent12CouponValidation;
