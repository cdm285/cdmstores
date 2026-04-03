/**
 * Agent 29 — ValidationAgent     Validates response before sending
 * Agent 30 — CoherenceAgent      Checks logical coherence with previous turn
 * Agent 32 — QualityAgent        Scores response quality 0–100
 * Agent 33 — ErrorCorrectionAgent Fixes factual errors
 * Agent 55 — SelfRepairAgent     Repairs low-quality responses
 * Agent 61 — SelfCorrectionAgent Final correction pass
 * Agent 79 — QualityCheckAgent   Gate: block if score < THRESHOLD
 */

import { BaseAgent, AgentContext, AgentResult, QualityReport, QUALITY_THRESHOLD } from '../core/types.js';

// ─── Agent 32 — QualityAgent ──────────────────────────────────────────────────
export class QualityAgent extends BaseAgent {
  readonly id = '32-quality';
  readonly name = 'QualityAgent';

  async run(ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Empty or too short
    if (!response || response.trim().length < 10) {
      issues.push('Response too short');
      score -= 50;
    }

    // Too long (>1200 chars for chat)
    if (response.length > 1200) {
      issues.push('Response may be too long for chat');
      suggestions.push('Consider summarizing');
      score -= 10;
    }

    // Mentions hallucinated prices
    const priceMatches = response.match(/R\$\s*([\d,]+)/g) ?? [];
    for (const p of priceMatches) {
      const val = parseFloat(p.replace('R$', '').replace(',', '.').trim());
      const validPrices = [89.90, 49.90, 29.90, 149.90, 15.00, 10, 5, 20];
      if (!validPrices.some(vp => Math.abs(vp - val) < 0.05)) {
        issues.push(`Possibly incorrect price mentioned: ${p}`);
        score -= 15;
      }
    }

    // No actionable info
    if (score > 50 && !response.includes('R$') && !response.includes('http') &&
        !response.includes('📦') && !response.includes('✅') && !response.includes('❌') &&
        ctx.session.intent !== 'greeting' && ctx.session.intent !== 'farewell') {
      suggestions.push('Response could be more specific/actionable');
      score -= 5;
    }

    // Contains error markers
    if (/\[object Object\]|undefined|null/i.test(response)) {
      issues.push('Response contains debug artifacts');
      score -= 40;
    }

    score = Math.max(0, Math.min(100, score));
    const report: QualityReport = {
      score,
      passed: score >= QUALITY_THRESHOLD,
      issues,
      suggestions,
    };

    ctx.meta.quality_report = report;

    return this.ok(this.id, { data: report as unknown as Record<string, unknown>, confidence: score }, t);
  }
}

// ─── Agent 30 — CoherenceAgent ────────────────────────────────────────────────
export class CoherenceAgent extends BaseAgent {
  readonly id = '30-coherence';
  readonly name = 'CoherenceAgent';

  async run(ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();

    // Compare with last assistant message for topic drift
    const lastAssistant = [...ctx.session.context].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) {
      return this.ok(this.id, { data: { coherent: true, reason: 'first_turn' }, confidence: 95 }, t);
    }

    // Simple coherence: if previous was about tracking and current switches to product, flag it
    const prevIntent = ctx.session.intent;
    const responseHasTracking = /rastreio|track|pedido #/i.test(response);
    const responseHasProduct = /fone|carregador|cabo|caixa|r\$/i.test(response);

    let coherent = true;
    let reason = 'ok';

    if (prevIntent === 'tracking' && responseHasProduct && !responseHasTracking) {
      coherent = false;
      reason = 'topic_drift: switched from tracking to products';
    }

    return this.ok(this.id, { data: { coherent, reason }, confidence: coherent ? 90 : 50 }, t);
  }
}

// ─── Agent 29 — ValidationAgent ───────────────────────────────────────────────
export class ValidationAgent extends BaseAgent {
  readonly id = '29-validation';
  readonly name = 'ValidationAgent';

  async run(ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();

    if (!response || typeof response !== 'string') {
      return this.fail(this.id, 'Response is empty or invalid type', t);
    }

    // Check response doesn't contain sensitive data patterns
    const hasSensitive = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(response) // credit card
      || /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(response); // CPF

    if (hasSensitive) {
      return this.fail(this.id, 'Response contains potentially sensitive data', t);
    }

    // Check for broken markdown
    const openBold = (response.match(/\*\*/g) ?? []).length;
    if (openBold % 2 !== 0) {
      ctx.meta.fix_markdown = true;
    }

    return this.ok(this.id, { data: { valid: true } }, t);
  }
}

// ─── Agent 33 — ErrorCorrectionAgent ─────────────────────────────────────────
export class ErrorCorrectionAgent extends BaseAgent {
  readonly id = '33-error-correction';
  readonly name = 'ErrorCorrectionAgent';

  async run(ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();

    let corrected = response;

    // Fix broken markdown
    if (ctx.meta.fix_markdown) {
      const boldCount = (corrected.match(/\*\*/g) ?? []).length;
      if (boldCount % 2 !== 0) corrected += '**';
    }

    // Remove debug artifacts
    corrected = corrected.replace(/\[object Object\]/g, '').replace(/\bundefined\b/g, '').replace(/\bnull\b(?!\s*$)/g, '');

    // Trim
    corrected = corrected.trim();

    return this.ok(this.id, { response: corrected || response }, t);
  }
}

// ─── Agent 55 — SelfRepairAgent ───────────────────────────────────────────────
// Called when quality score < THRESHOLD — attempts to improve response
export class SelfRepairAgent extends BaseAgent {
  readonly id = '55-self-repair';
  readonly name = 'SelfRepairAgent';

  async run(ctx: AgentContext, originalResponse: string): Promise<AgentResult> {
    const t = this.start();
    const report = ctx.meta.quality_report as QualityReport | undefined;

    // If low quality, regenerate with more specific prompt
    if (report && !report.passed) {
      const repairPrompt = [
        { role: 'system' as const, content: `Você é o assistente da CDM STORES. Responda de forma útil, clara e direta. Idioma: ${ctx.session.language}.` },
        { role: 'user' as const, content: ctx.session.context[ctx.session.context.length - 1]?.content ?? 'Olá' },
      ];

      try {
        // Cast required: Workers AI TypeScript types may lag behind available models
        type AiFlex = { run(model: string, params: unknown): Promise<{ response: string }> };
        const result = await (ctx.env.AI as unknown as AiFlex).run('@cf/meta/llama-3.1-8b-instruct-fp8', { messages: repairPrompt });
        const repaired = result.response?.trim();
        if (repaired && repaired.length > 20) {
          ctx.meta.was_repaired = true;
          return this.ok(this.id, { response: repaired, confidence: 65 }, t);
        }
      } catch { /* fall through to original */ }
    }

    return this.ok(this.id, { response: originalResponse, confidence: 50 }, t);
  }
}

// ─── Agent 61 — SelfCorrectionAgent ──────────────────────────────────────────
export class SelfCorrectionAgent extends BaseAgent {
  readonly id = '61-self-correction';
  readonly name = 'SelfCorrectionAgent';

  async run(ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();

    // Final pass: ensure correct language
    const lang = ctx.session.language;
    let corrected = response;

    // If EN session but response has Portuguese keywords (AI hallucination)
    if (lang === 'en') {
      const ptOnly = /\bpedido\b|\bcarrinho\b|\bprodutos\b/i.test(corrected)
        && !/\border\b|\bcart\b|\bproducts\b/i.test(corrected);
      if (ptOnly) {
        // Mark for logging but don't auto-translate (would cost neurons)
        ctx.meta.lang_mismatch_detected = true;
      }
    }

    return this.ok(this.id, { response: corrected }, t);
  }
}

// ─── Agent 79 — QualityCheckAgent (Gate) ─────────────────────────────────────
export class QualityCheckAgent extends BaseAgent {
  readonly id = '79-quality-check';
  readonly name = 'QualityCheckAgent';

  async run(ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();
    const report = ctx.meta.quality_report as QualityReport | undefined;

    if (!report) {
      return this.ok(this.id, { data: { gate: 'pass', reason: 'no_report' }, confidence: 70 }, t);
    }

    if (!report.passed) {
      return this.fail(this.id, `Quality gate failed: score=${report.score}, issues=${report.issues.join(', ')}`, t);
    }

    return this.ok(this.id, {
      data: { gate: 'pass', score: report.score },
      confidence: report.score,
    }, t);
  }
}

export const qualityAgent = new QualityAgent();
export const coherenceAgent = new CoherenceAgent();
export const validationAgent = new ValidationAgent();
export const errorCorrectionAgent = new ErrorCorrectionAgent();
export const selfRepairAgent = new SelfRepairAgent();
export const selfCorrectionAgent = new SelfCorrectionAgent();
export const qualityCheckAgent = new QualityCheckAgent();
