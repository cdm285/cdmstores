/**
 * Agent 27 — SecurityAgent
 * Agent 28 — ContentFilterAgent
 *
 * First gate in the pipeline. Blocks injection, XSS, oversized messages.
 * ContentFilter uses Llama Guard only when explicitly enabled (cost control).
 */

import { BaseAgent, AgentContext, AgentResult, type AgentEnv } from '../core/types.js';

// ─── Agent 27 — SecurityAgent ─────────────────────────────────────────────────
export class SecurityAgent extends BaseAgent {
  readonly id = '27-security';
  readonly name = 'SecurityAgent';

  private static readonly MAX_LENGTH = 500;

  private static readonly INJECTION_PATTERNS = [
    /ignore previous instructions/i,
    /ignore all instructions/i,
    /you are now/i,
    /act as/i,
    /jailbreak/i,
    /system prompt/i,
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /union\s+select/i,
    /drop\s+table/i,
    /--\s*$/,
    /;\s*delete\s/i,
  ];

  async run(ctx: AgentContext, message: string): Promise<AgentResult> {
    const t = this.start();

    if (typeof message !== 'string' || message.trim().length === 0) {
      return this.fail(this.id, 'Mensagem vazia', t);
    }

    if (message.length > SecurityAgent.MAX_LENGTH) {
      return this.fail(this.id, `Mensagem muito longa (máx ${SecurityAgent.MAX_LENGTH} caracteres)`, t);
    }

    for (const pattern of SecurityAgent.INJECTION_PATTERNS) {
      if (pattern.test(message)) {
        return this.fail(this.id, 'Conteúdo potencialmente inseguro bloqueado', t);
      }
    }

    return this.ok(this.id, { data: { clean: true } }, t);
  }
}

// ─── Agent 28 — ContentFilterAgent ───────────────────────────────────────────
// Only called when USE_CONTENT_FILTER=true to save AI neurons
export class ContentFilterAgent extends BaseAgent {
  readonly id = '28-content-filter';
  readonly name = 'ContentFilterAgent';

  async run(ctx: AgentContext, message: string): Promise<AgentResult> {
    const t = this.start();

    try {
      // Use Llama Guard for explicit content detection
      const result = await ctx.env.AI.run('@cf/meta/llama-guard-3-8b', {
        messages: [{ role: 'user' as const, content: message }],
      }) as { response: string };

      const safe = !result.response?.toLowerCase().includes('unsafe');
      if (!safe) {
        return this.fail(this.id, 'Conteúdo inapropriado detectado', t);
      }

      return this.ok(this.id, { data: { safe: true } }, t);
    } catch {
      // If Llama Guard fails, allow (fail open)
      return this.ok(this.id, { data: { safe: true, filtered: false } }, t);
    }
  }
}

export const securityAgent = new SecurityAgent();
export const contentFilterAgent = new ContentFilterAgent();
