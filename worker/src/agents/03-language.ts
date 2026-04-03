/**
 * Agent 03 — Language Detector
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 1: Cognitive — detects the user's language from the message text using
 * word-frequency scoring (no external deps, works on Edge).
 *
 * Supported languages: Portuguese (pt-BR), English (en), Spanish (es).
 * Priority: session preference > message score > default (pt-BR).
 *
 * Writes to ctx:
 *   ctx.detectedLang          — 'pt' | 'en' | 'es'
 *   ctx.session.language      — same value, persisted in session
 */

import { addTrace, ExtendedAgentContext } from '../core/agent-context.js';

// ─── Word banks ───────────────────────────────────────────────────────────────
const WORDS_PT = new Set([
  'olá','oi','bom','boa','obrigado','obrigada','por','favor','quero','meu','minha',
  'preciso','tenho','você','para','que','não','sim','como','onde','quando','quanto',
  'pedido','entrega','comprar','produto','preço','estoque','disponível','carrinho',
  'dia','tarde','noite','rastrear','ajuda','problema','suporte','pagamento','frete',
  'de','em','com','mas','uma','um','ser','ter','ao','às','dos','das','nos','nas',
]);

const WORDS_EN = new Set([
  'hello','hi','hey','good','morning','evening','thank','you','please','want','my',
  'need','have','what','where','when','how','much','order','delivery','buy','product',
  'price','stock','available','cart','tracking','help','problem','support','payment',
  'shipping','the','and','for','not','yes','no','is','are','can','where','get','do',
]);

const WORDS_ES = new Set([
  'hola','buenos','buenas','días','tardes','noches','gracias','por','favor','quiero',
  'mío','mi','necesito','tengo','qué','dónde','cuándo','cuánto','pedido','entrega',
  'comprar','producto','precio','disponible','carrito','rastrear','ayuda','problema',
  'soporte','pago','envío','los','las','del','con','para','sí','no','es','está',
]);

type LangCode = 'pt' | 'en' | 'es';

// ─── Scoring ──────────────────────────────────────────────────────────────────
function scoreText(text: string): Record<LangCode, number> {
  const tokens = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .split(/\s+/);

  const scores: Record<LangCode, number> = { pt: 0, en: 0, es: 0 };
  for (const token of tokens) {
    if (WORDS_PT.has(token)) scores.pt++;
    if (WORDS_EN.has(token)) scores.en++;
    if (WORDS_ES.has(token)) scores.es++;
  }
  return scores;
}

function pickLanguage(scores: Record<LangCode, number>): LangCode {
  const entries = Object.entries(scores) as [LangCode, number][];
  entries.sort(([, a], [, b]) => b - a);
  const [top]    = entries;
  // Only override default if there is a clear signal (at least 1 matched word)
  return top[1] > 0 ? top[0] : 'pt';
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent03Language {
  readonly id   = '03-language';
  readonly name = 'LanguageAgent';
  readonly tier = 1;

  execute(ctx: ExtendedAgentContext, message: string): void {
    const start = Date.now();

    // 1. Honour an existing session preference
    const preferred = ctx.session.language as LangCode | undefined;
    if (preferred && ['pt', 'en', 'es'].includes(preferred)) {
      ctx.detectedLang = preferred;
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence: 100 });
      return;
    }

    // 2. Score the message
    const scores = scoreText(message);
    const lang   = pickLanguage(scores);

    // Simple confidence: proportion of tokens matched
    const totalWords = message.trim().split(/\s+/).length;
    const matched    = scores[lang];
    const confidence = totalWords > 0 ? Math.min(99, Math.round((matched / totalWords) * 100) + 60) : 70;

    ctx.detectedLang     = lang;
    ctx.session.language = lang;

    addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence });
  }
}

export const agent03Language = new Agent03Language();
export default agent03Language;
