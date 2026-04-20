/**
 * Agent 13 — PersonalityAgent  Applies CDM STORES brand voice
 * Agent 14 — StyleAgent        Formats response for channel (web/mobile)
 * Agent 15 — EmotionAgent      Detects sentiment, adjusts tone
 */

import type { AgentContext, AgentResult, SentimentResult } from '../core/types.js';
import { BaseAgent } from '../core/types.js';

// ─── Agent 15 — EmotionAgent ──────────────────────────────────────────────────
export class EmotionAgent extends BaseAgent {
  readonly id = '15-emotion';
  readonly name = 'EmotionAgent';

  private static readonly POSITIVE = [
    'bom',
    'ótimo',
    'excelente',
    'amei',
    'gostei',
    'adorei',
    'perfeito',
    'top',
    'show',
    'boa',
    'legal',
    'great',
    'love',
    'perfect',
    'amazing',
    'genial',
    'bueno',
    'perfecto',
  ];
  private static readonly NEGATIVE = [
    'ruim',
    'péssimo',
    'horrível',
    'odeio',
    'problema',
    'erro',
    'falha',
    'decepção',
    'triste',
    'chato',
    'lento',
    'broken',
    'bad',
    'terrible',
    'awful',
    'horrible',
    'malo',
    'terrible',
  ];
  private static readonly ESCALATION_TRIGGERS = [
    'reembolso',
    'refund',
    'processar',
    'processo judicial',
    'fraude',
    'chargebak',
    'chargeback',
    'reclame aqui',
    'procon',
  ];

  async run(ctx: AgentContext, message: string): Promise<AgentResult> {
    const t = this.start();
    const lower = message.toLowerCase();

    let score = 0;
    let negativeHits = 0;

    EmotionAgent.POSITIVE.forEach(w => {
      if (lower.includes(w)) {
        score += 1;
      }
    });
    EmotionAgent.NEGATIVE.forEach(w => {
      if (lower.includes(w)) {
        score -= 1;
        negativeHits++;
      }
    });

    const sentiment: SentimentResult['sentiment'] =
      score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
    const shouldEscalate =
      negativeHits >= 2 || EmotionAgent.ESCALATION_TRIGGERS.some(t => lower.includes(t));

    const result: SentimentResult = { sentiment, score, shouldEscalate };
    ctx.session.sentiment = sentiment;
    ctx.meta.should_escalate = shouldEscalate;

    return this.ok(
      this.id,
      { data: result as unknown as Record<string, unknown>, confidence: 80 },
      t,
    );
  }
}

// ─── Agent 13 — PersonalityAgent ─────────────────────────────────────────────
export class PersonalityAgent extends BaseAgent {
  readonly id = '13-personality';
  readonly name = 'PersonalityAgent';

  async run(ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();

    if (!response) {
      return this.fail(this.id, 'Empty response', t);
    }

    let adjusted = response;

    // Adjust tone based on sentiment
    if (ctx.session.sentiment === 'negative') {
      // Add empathy opener if response doesn't already have one
      const empathyPrefixes: Record<string, string> = {
        pt: 'Entendo sua situação. ',
        en: 'I understand your concern. ',
        es: 'Entiendo tu situación. ',
      };
      const prefix = empathyPrefixes[ctx.session.language] ?? empathyPrefixes.pt;
      if (!adjusted.startsWith(prefix.slice(0, 10))) {
        adjusted = prefix + adjusted;
      }
    }

    // Ensure response ends with a friendly close when positive/neutral
    if (ctx.session.sentiment !== 'negative') {
      const closings: Record<string, string[]> = {
        pt: ['Posso ajudar com mais algo? 😊', 'Há algo mais em que posso ajudar?', ''],
        en: ['Can I help with anything else? 😊', 'Is there anything else I can help with?', ''],
        es: ['¿Puedo ayudarte con algo más? 😊', '¿Hay algo más en que pueda ayudarte?', ''],
      };
      const lang = ctx.session.language;
      const closing = closings[lang]?.[ctx.session.turn % 2] ?? '';
      // Only add if response doesn't already end with a question
      if (
        closing &&
        !adjusted.trimEnd().endsWith('?') &&
        !adjusted.trimEnd().endsWith('!') &&
        adjusted.length < 300
      ) {
        adjusted = adjusted.trimEnd() + '\n\n' + closing;
      }
    }

    return this.ok(this.id, { response: adjusted.trim(), confidence: 90 }, t);
  }
}

// ─── Agent 14 — StyleAgent ────────────────────────────────────────────────────
export class StyleAgent extends BaseAgent {
  readonly id = '14-style';
  readonly name = 'StyleAgent';

  async run(
    _ctx: AgentContext,
    response: string,
    channel: 'web' | 'mobile' = 'web',
  ): Promise<AgentResult> {
    const t = this.start();

    if (!response) {
      return this.fail(this.id, 'Empty response', t);
    }

    let styled = response;

    // Mobile: shorter, no heavy markdown
    if (channel === 'mobile' && styled.length > 400) {
      // Truncate at sentence boundary
      const sentences = styled.split(/(?<=[.!?])\s+/);
      let truncated = '';
      for (const s of sentences) {
        if ((truncated + s).length > 380) {
          break;
        }
        truncated += s + ' ';
      }
      styled = truncated.trim() + (styled.length > truncated.length ? '...' : '');
    }

    // Clean up excess newlines
    styled = styled.replace(/\n{3,}/g, '\n\n').trim();

    return this.ok(this.id, { response: styled, confidence: 95 }, t);
  }
}

export const emotionAgent = new EmotionAgent();
export const personalityAgent = new PersonalityAgent();
export const styleAgent = new StyleAgent();
