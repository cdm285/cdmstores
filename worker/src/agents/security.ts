/**
 * Agent 27 — SecurityAgent
 * Agent 28 — ContentFilterAgent
 *
 * First gate in the pipeline. Blocks injection, XSS, oversized messages.
 * ContentFilter uses Llama Guard only when explicitly enabled (cost control).
 */

import type { AgentContext, AgentResult} from '../core/types.js';
import { BaseAgent, type AgentEnv } from '../core/types.js';

// ─── Agent 27 — SecurityAgent ─────────────────────────────────────────────────
export class SecurityAgent extends BaseAgent {
  readonly id = '27-security';
  readonly name = 'SecurityAgent';

  // Aligned with chat.ts MAX_MSG_LENGTH — messages up to 2000 chars are valid
  private static readonly MAX_LENGTH = 2_000;

  private static readonly INJECTION_PATTERNS = [
    // Classic prompt injection / jailbreak
    /ignore\s+(previous|all|prior)\s+instructions/i,
    /disregard\s+(all|previous|prior)\s+instructions/i,
    /\bjailbreak\b/i,
    /\bDAN\b/,                                     // "Do Anything Now" jailbreak
    /\bsystem\s+prompt\b/i,
    // Role override attempts
    /\byou\s+are\s+now\s+(a|an|the)\b/i,
    /\bact\s+as\s+(a|an|the)\s+\w+\s+(without|with\s+no)\b/i,
    /\bpretend\s+(you\s+are|to\s+be)\b/i,
    /\bfrom\s+now\s+on\s+(you|ignore|forget)\b/i,
    // XSS
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /vbscript:/i,
    // SQL injection
    /union\s+select/i,
    /drop\s+table/i,
    /;\s*delete\s/i,
    /--\s*$/,
    /'\s*or\s+'1'\s*=\s*'1/i,
    // Template / SSTI injection
    /\{\{.*\}\}/,                                  // Handlebars / Jinja-style
    /\$\{.*\}/,                                    // JS template literal in input
    // SSRF probing
    /\bfile:\/\//i,
    /\b(169\.254\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/,
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
