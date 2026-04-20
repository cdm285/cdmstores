/**
 * Agent 02 — Intent Classifier
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 1: Cognitive — classifies the user's intent from the message + entities.
 *
 * Classification strategy (in order):
 *   1. Entity-based shortcuts  (tracking code → 'tracking', coupon → 'coupon', …)
 *   2. Regex rule set          (13+ categories, multilingual)
 *   3. Fallback                ('unknown' → full reasoning path)
 *
 * Writes to ctx:
 *   ctx.intent       — top-level intent category
 *   ctx.intentRoute  — 'fast' or 'full'
 *   ctx.intentConf   — confidence 0–100
 *   ctx.session.intent, ctx.session.confidence
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { IntentCategory } from '../core/types.js';

// ─── Rule definition ──────────────────────────────────────────────────────────
interface IntentRule {
  category   : IntentCategory;
  route      : 'fast' | 'full';
  confidence : number;
  patterns   : RegExp[];
}

const RULES: IntentRule[] = [
  {
    category  : 'greeting',
    route     : 'fast',
    confidence: 96,
    patterns  : [
      /^(oi|olá|ola|hey|hi|hello|e aí|eai|bom dia|boa tarde|boa noite|hola|buenos|buenas)\b/i,
      /^(what'?s up|howdy|yo\b|sup\b)/i,
    ],
  },
  {
    category  : 'farewell',
    route     : 'fast',
    confidence: 92,
    patterns  : [
      /\b(tchau|adeus|até logo|até mais|bye|goodbye|see you|ciao|hasta luego|hasta pronto)\b/i,
      /\b(obrigad[oa]|valeu|thanks?|gracias|merci)\b/i,
    ],
  },
  {
    category  : 'tracking',
    route     : 'fast',
    confidence: 90,
    patterns  : [
      /\b(rastr\w+|track\w*|onde est[aá]|onde t[aá]|cad[eê]|status do pedido|entrega|delivered|shipping status)\b/i,
      /\b(chegou|quando chega|previs[aã]o de entrega)\b/i,
    ],
  },
  {
    category  : 'coupon',
    route     : 'fast',
    confidence: 92,
    patterns  : [
      /\b(cupom|coupon|c[oó]digo promo|promo code|desconto|código de desconto|voucher)\b/i,
    ],
  },
  {
    category  : 'order_history',
    route     : 'fast',
    confidence: 88,
    patterns  : [
      /\b(meu pedido|meus pedidos|ver pedido|hist[oó]rico|my orders?|mis pedidos?|order history)\b/i,
      /\b(compras anteriores|pedidos feitos|minhas compras)\b/i,
    ],
  },
  {
    category  : 'cart_action',
    route     : 'fast',
    confidence: 90,
    patterns  : [
      /\b(adicionar|add to cart|agregar|quero comprar|comprar|carrinho|cart|checkout)\b/i,
      /\b(colocar no carrinho|quero esse|quero esse produto|buy now)\b/i,
    ],
  },
  {
    category  : 'product_query',
    route     : 'fast',
    confidence: 87,
    patterns  : [
      /\b(produtos?|products?|quanto custa|pre[cç]o|price|precio|cat[aá]logo|catalog)\b/i,
      /\b(fone|carregador|cabo|caixa de som|headphone|speaker|charger|cable)\b/i,
      /\b(tem estoque|disponível|in stock|available)\b/i,
    ],
  },
  {
    category  : 'payment',
    route     : 'fast',
    confidence: 90,
    patterns  : [
      /\b(pagar|pagamento|payment|stripe|cart[aã]o|pix|boleto|credit card|forma de pag)\b/i,
      /\b(pay|how to pay|como pagar|métodos de pagamento)\b/i,
    ],
  },
  {
    category  : 'schedule',
    route     : 'fast',
    confidence: 92,
    patterns  : [
      /\b(agendar|agendamento|consulta|hor[aá]rio disponível|schedule|appointment|booking)\b/i,
    ],
  },
  {
    category  : 'whatsapp',
    route     : 'fast',
    confidence: 94,
    patterns  : [
      /\b(whatsapp|wpp|zap|atendimento humano|falar com algu[eé]m|human support|falar com pessoa)\b/i,
    ],
  },
  {
    category  : 'notification',
    route     : 'fast',
    confidence: 87,
    patterns  : [
      /\b(notif\w*|alerta|aviso|promo[cç][õo]es|newsletter|notification|avisar quando)\b/i,
    ],
  },
  {
    category  : 'support',
    route     : 'full',
    confidence: 84,
    patterns  : [
      /\b(problema|erro|bug|n[aã]o funciona|quebrado|defeito|help|suporte|support|reclamar)\b/i,
      /\b(ajuda|preciso de ajuda|not working|broken|issue|complaint)\b/i,
    ],
  },
  {
    category  : 'complex',
    route     : 'full',
    confidence: 72,
    patterns  : [
      /\b(por que|como funciona|explica|me conta|quero entender|what is|c[oó]mo|why|explain)\b/i,
      /\b(diferença entre|difference between|compare|comparar)\b/i,
    ],
  },
];

// ─── Entity-based shortcuts ────────────────────────────────────────────────────
function entityShortcut(ctx: ExtendedAgentContext): IntentRule | null {
  if (ctx.entities.tracking_code) {
    return { category: 'tracking',      route: 'fast', confidence: 98, patterns: [] };
  }
  if (ctx.entities.coupon && !ctx.entities.email) {
    return { category: 'coupon',         route: 'fast', confidence: 97, patterns: [] };
  }
  if (ctx.entities.email) {
    return { category: 'order_history',  route: 'fast', confidence: 85, patterns: [] };
  }
  if (ctx.entities.product_id) {
    return { category: 'product_query',  route: 'fast', confidence: 85, patterns: [] };
  }
  return null;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent02Intent {
  readonly id   = '02-intent';
  readonly name = 'IntentAgent';
  readonly tier = 1;

  execute(ctx: ExtendedAgentContext, message: string): void {
    const start = Date.now();

    // 1. Entity shortcuts (highest priority)
    const shortcut = entityShortcut(ctx);
    if (shortcut) {
      this.applyIntent(ctx, shortcut);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence: shortcut.confidence });
      return;
    }

    // 2. Regex rules (ordered by priority)
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          this.applyIntent(ctx, rule);
          addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence: rule.confidence });
          return;
        }
      }
    }

    // 3. Fallback
    ctx.intent         = 'unknown';
    ctx.intentRoute    = 'full';
    ctx.intentConf     = 40;
    ctx.session.intent = 'unknown';
    addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence: 40 });
  }

  private applyIntent(ctx: ExtendedAgentContext, rule: Pick<IntentRule, 'category' | 'route' | 'confidence'>): void {
    ctx.intent              = rule.category;
    ctx.intentRoute         = rule.route;
    ctx.intentConf          = rule.confidence;
    ctx.session.intent      = rule.category;
    ctx.session.confidence  = rule.confidence;
  }
}

export const agent02Intent = new Agent02Intent();
export default agent02Intent;
