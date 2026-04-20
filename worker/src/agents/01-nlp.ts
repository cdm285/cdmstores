/**
 * Agent 01 — NLP
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 1: Cognitive pre-processing
 *
 * Responsibilities:
 *   • Tokenize and normalize the raw user message
 *   • Extract named entities: email, tracking code, coupon, product, phone
 *   • Populate ctx.entities for downstream agents
 *   • Record product context (id + name) for cart / product query agents
 *
 * Writes to ctx:
 *   ctx.entities            — all extracted entities
 *   ctx.meta.rawTokens      — normalized token array
 *   ctx.meta.normalizedMsg  — lowercased, trimmed message
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';

// ─── Product dictionary for entity resolution ─────────────────────────────────
const PRODUCT_MAP: Array<{
  id       : number;
  name     : string;
  triggers : string[];
}> = [
  { id: 1, name: 'Fone Bluetooth',          triggers: ['fone', 'headphone', 'auricular', 'bluetooth headphone'] },
  { id: 2, name: 'Carregador USB-C 65W',    triggers: ['carregador', 'charger', 'cargador', 'usb', 'usbc'] },
  { id: 3, name: 'Cabo Lightning 2m',       triggers: ['cabo', 'cable', 'lightning', 'cabo lightning'] },
  { id: 4, name: 'Caixa de Som Portátil',   triggers: ['caixa', 'speaker', 'parlante', 'caixa de som', 'som portátil'] },
];

// ─── Patterns ─────────────────────────────────────────────────────────────────
const PATTERNS = {
  email       : /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
  tracking    : /\b([A-Z]{2}\d{8,}\w{2}|CDM[A-Z0-9]{4,})\b/i,
  coupon      : /\b([A-Z]{2,}[A-Z0-9]{2,12})\b/,
  phone       : /\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/,
  orderId     : /#?(\d{4,8})\b/,
  postalBR    : /\b\d{5}-?\d{3}\b/,
};

// ─── Tokenizer ────────────────────────────────────────────────────────────────
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics for matching
    .replace(/[^\w\s@.-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent01NLP {
  readonly id   = '01-nlp';
  readonly name = 'NLPAgent';
  readonly tier = 1;

  async execute(ctx: ExtendedAgentContext, message: string): Promise<void> {
    const start = Date.now();
    const entities: Record<string, string | number> = {};

    // Normalize
    const normalized = message.trim();
    const lower = normalized.toLowerCase();
    const tokens = tokenize(normalized);

    ctx.meta.normalizedMsg = lower;
    ctx.meta.rawTokens     = tokens;

    // ── Entity extraction ──────────────────────────────────────────────────

    // Email (before coupon so we don't pick up domain as coupon)
    const emailM = normalized.match(PATTERNS.email);
    if (emailM) {entities.email = emailM[1].toLowerCase();}

    // Tracking code
    const trackM = normalized.match(PATTERNS.tracking);
    if (trackM) {entities.tracking_code = trackM[1].toUpperCase();}

    // Coupon — only if no email detected (avoid false positives)
    if (!entities.email) {
      const couponM = normalized.match(PATTERNS.coupon);
      // Reject tokens that look like tracking codes
      if (couponM && !PATTERNS.tracking.test(couponM[1])) {
        entities.coupon = couponM[1].toUpperCase();
      }
    }

    // Phone
    const phoneM = normalized.match(PATTERNS.phone);
    if (phoneM) {entities.phone = phoneM[0].replace(/\D/g, '');}

    // Order ID (#1234 or standalone number 4-8 digits)
    const orderM = lower.match(PATTERNS.orderId);
    if (orderM) {entities.order_id = Number(orderM[1]);}

    // Postal code (CEP)
    const cepM = normalized.match(PATTERNS.postalBR);
    if (cepM) {entities.cep = cepM[0].replace('-', '');}

    // Product (longest match wins)
    const bestProduct: { id: number; name: string } | null = null;
    for (const product of PRODUCT_MAP) {
      for (const trigger of product.triggers) {
        if (lower.includes(trigger)) {
          // Prefer longer trigger match (more specific)
          if (!bestProduct || trigger.length > (bestProduct as { id: number; name: string; _trigLen?: number })._trigLen!) {
            (bestProduct as unknown as { id: number; name: string; _trigLen: number })
              = { id: product.id, name: product.name, _trigLen: trigger.length };
          }
        }
      }
    }
    if (bestProduct) {
      entities.product_id   = (bestProduct as { id: number }).id;
      entities.product_name = (bestProduct as { name: string }).name;
    }

    // Quantity hint ("2 fones", "três cabos")
    const qtyM = lower.match(/\b([2-9]|[1-9]\d)\s+(?:fone|carregador|cabo|caixa)/);
    if (qtyM) {entities.quantity = Number(qtyM[1]);}

    // ── Commit to context ──────────────────────────────────────────────────
    ctx.entities = entities;
    ctx.meta.entities = entities;

    addTrace(ctx, {
      agentId    : this.id,
      agentName  : this.name,
      success    : true,
      latencyMs  : Date.now() - start,
      confidence : 90,
    });
  }
}

export const agent01NLP = new Agent01NLP();
export default agent01NLP;
