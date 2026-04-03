/**
 * Agent 01 — NLPAgent        Extrai entidades (email, código rastreio, cupom, produto)
 * Agent 02 — IntentAgent     Classifica intenção da mensagem
 * Agent 03 — LanguageAgent   Detecta e sincroniza idioma
 */

import {
  BaseAgent, AgentContext, AgentResult,
  Intent, IntentCategory
} from '../core/types.js';

// ─── Agent 01 — NLPAgent ──────────────────────────────────────────────────────
export class NLPAgent extends BaseAgent {
  readonly id = '01-nlp';
  readonly name = 'NLPAgent';

  async run(ctx: AgentContext, message: string): Promise<AgentResult> {
    const t = this.start();
    const entities: Record<string, string | number> = {};

    // Email
    const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) entities.email = emailMatch[1];

    // Tracking code (BR postal / custom CDM)
    const trackMatch = message.match(/\b([A-Z]{2}\d{8,}\w{2}|CDM[A-Z0-9]{6,})\b/i);
    if (trackMatch) entities.tracking_code = trackMatch[1].toUpperCase();

    // Coupon (all-caps word 4–12 chars)
    const couponMatch = message.match(/\b([A-Z]{2,}[A-Z0-9]{2,12})\b/);
    if (couponMatch && !entities.email) entities.coupon = couponMatch[1];

    // Product mentions
    const msg = message.toLowerCase();
    if (msg.includes('fone') || msg.includes('headphone') || msg.includes('auricular')) {
      entities.product_id = 1;
      entities.product_name = 'Fone Bluetooth';
    } else if (msg.includes('carregador') || msg.includes('charger') || msg.includes('cargador')) {
      entities.product_id = 2;
      entities.product_name = 'Carregador USB-C';
    } else if (msg.includes('cabo') || msg.includes('cable') || msg.includes('lightning')) {
      entities.product_id = 3;
      entities.product_name = 'Cabo Lightning';
    } else if (msg.includes('caixa') || msg.includes('speaker') || msg.includes('parlante')) {
      entities.product_id = 4;
      entities.product_name = 'Caixa de Som Portátil';
    }

    // Phone number
    const phoneMatch = message.match(/\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/);
    if (phoneMatch) entities.phone = phoneMatch[0].replace(/\D/g, '');

    return this.ok(this.id, { data: { entities }, confidence: 90 }, t);
  }
}

// ─── Agent 02 — IntentAgent ───────────────────────────────────────────────────
export class IntentAgent extends BaseAgent {
  readonly id = '02-intent';
  readonly name = 'IntentAgent';

  private static readonly RULES: Array<{
    category: IntentCategory;
    patterns: RegExp[];
    route: 'fast' | 'full';
    confidence: number;
  }> = [
    {
      category: 'greeting',
      patterns: [/^(oi|olá|ola|hey|hi|hello|bom dia|boa tarde|boa noite|hola|buenos días)\b/i],
      route: 'fast', confidence: 95,
    },
    {
      category: 'farewell',
      patterns: [/\b(tchau|adeus|até logo|bye|goodbye|hasta luego|obrigado|valeu|thanks)\b/i],
      route: 'fast', confidence: 90,
    },
    {
      category: 'tracking',
      patterns: [/\b(rastr\w*|track\w*|onde está|onde ta|cadê|status do pedido|entrega|delivered)\b/i],
      route: 'fast', confidence: 88,
    },
    {
      category: 'coupon',
      patterns: [/\b(cupom|coupon|desconto|código promo|promo code|código de desconto)\b/i],
      route: 'fast', confidence: 90,
    },
    {
      category: 'order_history',
      patterns: [/\b(meu pedido|meus pedidos|ver pedido|histórico|my orders|mis pedidos)\b/i],
      route: 'fast', confidence: 85,
    },
    {
      category: 'cart_action',
      patterns: [/\b(adicionar|add to cart|agregar|quero comprar|comprar|carrinho)\b/i],
      route: 'fast', confidence: 88,
    },
    {
      category: 'product_query',
      patterns: [/\b(produtos?|products?|quanto custa|preço|price|precio|fone|carregador|cabo|caixa)\b/i],
      route: 'fast', confidence: 85,
    },
    {
      category: 'payment',
      patterns: [/\b(pagar|pagamento|payment|stripe|cartão|pix|boleto|credit card)\b/i],
      route: 'fast', confidence: 88,
    },
    {
      category: 'schedule',
      patterns: [/\b(agendar|agendamento|consulta|horário disponível|schedule|appointment)\b/i],
      route: 'fast', confidence: 90,
    },
    {
      category: 'whatsapp',
      patterns: [/\b(whatsapp|wpp|zap|atendimento humano|falar com alguém|human support)\b/i],
      route: 'fast', confidence: 92,
    },
    {
      category: 'notification',
      patterns: [/\b(notif|alerta|aviso|promoções|newsletter|notification)\b/i],
      route: 'fast', confidence: 85,
    },
    {
      category: 'support',
      patterns: [/\b(problema|erro|bug|ajuda|help|suporte|support|não funciona|quebrado|defeito)\b/i],
      route: 'full', confidence: 82,
    },
    {
      category: 'complex',
      patterns: [/\b(por que|como funciona|explica|me conta|quero entender|what is|cómo)\b/i],
      route: 'full', confidence: 70,
    },
  ];

  async run(ctx: AgentContext, message: string, entities: Record<string, string | number>): Promise<AgentResult> {
    const t = this.start();

    for (const rule of IntentAgent.RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          const intent: Intent = {
            category: rule.category,
            confidence: rule.confidence,
            entities,
            route: rule.route,
          };
          ctx.session.intent = intent.category;
          ctx.session.confidence = intent.confidence;
          return this.ok(this.id, { data: { intent }, confidence: rule.confidence }, t);
        }
      }
    }

    // Unknown — use full pipeline for reasoning
    const intent: Intent = {
      category: 'unknown',
      confidence: 40,
      entities,
      route: 'full',
    };
    ctx.session.intent = 'unknown';
    return this.ok(this.id, { data: { intent }, confidence: 40 }, t);
  }
}

// ─── Agent 03 — LanguageAgent ─────────────────────────────────────────────────
export class LanguageAgent extends BaseAgent {
  readonly id = '03-language';
  readonly name = 'LanguageAgent';

  private static readonly PT = /\b(eu|você|ele|ela|nós|eles|que|não|sim|mas|com|para|por|uma|um|isso|este|aqui)\b/i;
  private static readonly EN = /\b(I|you|he|she|we|they|the|is|are|was|were|have|has|do|does|not|yes|but|with|for|this|that|here)\b/i;
  private static readonly ES = /\b(yo|tú|él|ella|nosotros|ellos|que|no|sí|pero|con|para|por|una|un|esto|ese|aquí)\b/i;

  async run(ctx: AgentContext, message: string): Promise<AgentResult> {
    const t = this.start();

    const ptScore = (message.match(LanguageAgent.PT) || []).length;
    const enScore = (message.match(LanguageAgent.EN) || []).length;
    const esScore = (message.match(LanguageAgent.ES) || []).length;

    let detected: 'pt' | 'en' | 'es' = 'pt';
    if (enScore > ptScore && enScore > esScore) detected = 'en';
    else if (esScore > ptScore && esScore > enScore) detected = 'es';

    // Respect session language if already set (user preference wins)
    const finalLang = ctx.session.language || detected;
    ctx.session.language = finalLang;

    return this.ok(this.id, { data: { detected, finalLang }, confidence: 85 }, t);
  }
}

export const nlpAgent = new NLPAgent();
export const intentAgent = new IntentAgent();
export const languageAgent = new LanguageAgent();
