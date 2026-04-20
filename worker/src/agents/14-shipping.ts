/**
 * Agent 14 — Shipping Estimate (Tier 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates shipping cost and estimated delivery window for a Brazilian
 * postal code (CEP). Uses a tiered cost model without external HTTP calls
 * (Cloudflare Workers free plan does not guaranteed subrequest budgets).
 *
 * Tiered model (by CEP region prefix):
 *   01–09 (SP capital)      → R$ 10,00 · 2–3 business days
 *   10–19 (SP interior)     → R$ 12,00 · 3–5 business days
 *   20–28 (RJ)              → R$ 14,00 · 3–5 business days
 *   29–39 (ES + MG)         → R$ 16,00 · 4–6 business days
 *   40–48 (BA)              → R$ 18,00 · 5–7 business days
 *   Everything else         → R$ 20,00 · 5–8 business days
 *
 * Free shipping threshold: R$ 200,00+
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace }   from '../core/agent-context.js';
import type { ActionRequest, ActionResult } from '../core/action-schema.js';
import { failedResult }                     from '../core/action-schema.js';

// ─── Rate table ───────────────────────────────────────────────────────────────
interface ShippingTier {
  min   : number;  // CEP prefix (first 2 digits), inclusive lower bound
  max   : number;  // inclusive upper bound
  cost  : number;
  daysMin: number;
  daysMax: number;
  region: string;
}

const TIERS: ShippingTier[] = [
  { min:  1, max:  9, cost: 10.00, daysMin: 2, daysMax: 3, region: 'São Paulo Capital' },
  { min: 10, max: 19, cost: 12.00, daysMin: 3, daysMax: 5, region: 'São Paulo Interior' },
  { min: 20, max: 28, cost: 14.00, daysMin: 3, daysMax: 5, region: 'Rio de Janeiro' },
  { min: 29, max: 39, cost: 16.00, daysMin: 4, daysMax: 6, region: 'ES / MG' },
  { min: 40, max: 48, cost: 18.00, daysMin: 5, daysMax: 7, region: 'Bahia' },
];
const DEFAULT_TIER: Omit<ShippingTier, 'min' | 'max' | 'region'> = { cost: 20.00, daysMin: 5, daysMax: 8 };
const FREE_SHIPPING_THRESHOLD = 200.00;

function lookupTier(cep: string): { cost: number; daysMin: number; daysMax: number; region: string } {
  const prefix = parseInt(cep.slice(0, 2), 10);
  const tier = TIERS.find(t => prefix >= t.min && prefix <= t.max);
  return tier
    ? { cost: tier.cost, daysMin: tier.daysMin, daysMax: tier.daysMax, region: tier.region }
    : { cost: DEFAULT_TIER.cost, daysMin: DEFAULT_TIER.daysMin, daysMax: DEFAULT_TIER.daysMax, region: 'Brasil' };
}

// ─── Format response ──────────────────────────────────────────────────────────
function buildResponse(cep: string, tier: ReturnType<typeof lookupTier>, isFree: boolean, lang: string): string {
  const formatted = `${cep.slice(0, 5)}-${cep.slice(5)}`;
  const costStr   = isFree ? (lang === 'en' ? 'FREE 🎉' : lang === 'es' ? 'GRATIS 🎉' : 'GRÁTIS 🎉') : `R$ ${tier.cost.toFixed(2)}`;
  const days      = `${tier.daysMin}–${tier.daysMax}`;

  if (lang === 'en') {
    return `📦 **Shipping to ${formatted}** (${tier.region})\n💵 Cost: **${costStr}**\n🗓 Estimated delivery: **${days} business days**${isFree ? '' : `\n\n💡 Orders over R$ ${FREE_SHIPPING_THRESHOLD.toFixed(2)} get FREE shipping!`}`;
  }
  if (lang === 'es') {
    return `📦 **Envío a ${formatted}** (${tier.region})\n💵 Costo: **${costStr}**\n🗓 Entrega estimada: **${days} días hábiles**${isFree ? '' : `\n\n💡 ¡Pedidos superiores a R$ ${FREE_SHIPPING_THRESHOLD.toFixed(2)} tienen envío GRATIS!`}`;
  }
  return `📦 **Frete para ${formatted}** (${tier.region})\n💵 Custo: **${costStr}**\n🗓 Prazo estimado: **${days} dias úteis**${isFree ? '' : `\n\n💡 Pedidos acima de R$ ${FREE_SHIPPING_THRESHOLD.toFixed(2)} têm frete GRÁTIS!`}`;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent14Shipping {
  readonly id   = '14-shipping';
  readonly name = 'ShippingAgent';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, req: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    if (req.payload.type !== 'shipping_estimate') {
      return failedResult(req, 'Wrong payload type for Shipping');
    }

    const { postal_code, cart_total } = req.payload.params;
    const lang   = req.language ?? 'pt';
    const cep    = postal_code.replace(/\D/g, '');

    if (!/^\d{8}$/.test(cep)) {
      return failedResult(req, `Invalid CEP: ${postal_code}`, Date.now() - start);
    }

    try {
      const tier   = lookupTier(cep);
      const isFree = cart_total !== undefined && cart_total >= FREE_SHIPPING_THRESHOLD;
      const cost   = isFree ? 0 : tier.cost;

      const response = buildResponse(cep, tier, isFree, lang);

      const result: ActionResult = {
        id           : req.id,
        actionType   : 'shipping_estimate',
        success      : true,
        response,
        data         : { cep, region: tier.region, cost, isFree, daysMin: tier.daysMin, daysMax: tier.daysMax },
        action       : 'shipping_estimated',
        actionPayload: { postal_code: cep, shipping_cost: cost, estimated_days_min: tier.daysMin, estimated_days_max: tier.daysMax },
        latencyMs    : Date.now() - start,
        ts           : Date.now(),
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

export const agent14Shipping = new Agent14Shipping();
export default agent14Shipping;
