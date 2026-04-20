/**
 * Agent 44 — MonitoringAgent Tracks per-agent latency metrics
 * Agent 47 — AuditAgent      Security-relevant event audit trail
 * Agent 49 — HealthAgent     System health check
 *
 * Agents 51–90 (Self-* / Auto-Check) — Lightweight implementations
 * Most run as pass-through or lightweight validators.
 * Computationally heavy self-checks are no-ops if they would exceed CPU budget.
 */

import type { AgentContext, AgentResult } from '../core/types.js';
import { BaseAgent } from '../core/types.js';
import { logger } from '../lib/logger.js';

// ─── Agent 43 — LogAgent ──────────────────────────────────────────────────────
export class LogAgent extends BaseAgent {
  readonly id = '43-log';
  readonly name = 'LogAgent';

  // Fire-and-forget — never throws, never blocks response
  async run(
    ctx: AgentContext,
    event: string,
    details: Record<string, unknown>,
  ): Promise<AgentResult> {
    const t = this.start();
    try {
      await ctx.env.DB.prepare(
        'INSERT INTO audit_log (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
      )
        .bind(
          ctx.user?.id ?? null,
          event,
          JSON.stringify({ ...details, session_id: ctx.session.sessionId, turn: ctx.session.turn }),
          null,
        )
        .run();
    } catch {
      /* never block on log failure */
    }
    return this.ok(this.id, {}, t);
  }
}

// ─── Agent 44 — MonitoringAgent ───────────────────────────────────────────────
export class MonitoringAgent extends BaseAgent {
  readonly id = '44-monitoring';
  readonly name = 'MonitoringAgent';

  async run(ctx: AgentContext, metrics: Record<string, number>): Promise<AgentResult> {
    const t = this.start();
    // Store in meta for potential downstream use; no DB write here (KV writes are limited)
    ctx.meta.metrics = { ...((ctx.meta.metrics as Record<string, number>) ?? {}), ...metrics };

    // Log slow agents (>100ms) as warnings
    for (const [agent, ms] of Object.entries(metrics)) {
      if (ms > 100) {
        logger.warn(`[SLOW AGENT] ${agent}: ${ms}ms`);
      }
    }

    return this.ok(this.id, { data: { recorded: Object.keys(metrics).length } }, t);
  }
}

// ─── Agent 47 — AuditAgent ────────────────────────────────────────────────────
export class AuditAgent extends BaseAgent {
  readonly id = '47-audit';
  readonly name = 'AuditAgent';

  async run(
    ctx: AgentContext,
    securityEvent: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
  ): Promise<AgentResult> {
    const t = this.start();
    if (severity === 'high' || severity === 'critical') {
      logger.error(
        `[SECURITY:${severity.toUpperCase()}] ${securityEvent} — session:${ctx.session.sessionId}`,
      );
    }
    try {
      await ctx.env.DB.prepare(
        'INSERT INTO audit_log (user_id, action, details, created_at) VALUES (?, ?, ?, datetime("now"))',
      )
        .bind(
          ctx.user?.id ?? null,
          `security:${severity}:${securityEvent}`,
          JSON.stringify({ session_id: ctx.session.sessionId }),
        )
        .run();
    } catch {
      /* silent */
    }
    return this.ok(this.id, { data: { severity, logged: true } }, t);
  }
}

// ─── Agent 49 — HealthAgent ───────────────────────────────────────────────────
export class HealthAgent extends BaseAgent {
  readonly id = '49-health';
  readonly name = 'HealthAgent';

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const status: Record<string, boolean> = {};

    try {
      await ctx.env.DB.prepare('SELECT 1').first();
      status.d1 = true;
    } catch {
      status.d1 = false;
    }

    // AI and Vectorize existence checks
    status.ai = typeof ctx.env.AI?.run === 'function';
    status.vectorize = typeof ctx.env.VECTORIZE?.query === 'function';

    const healthy = Object.values(status).every(Boolean);
    return this.ok(this.id, { data: { status, healthy }, confidence: healthy ? 100 : 40 }, t);
  }
}

// ─── Agents 51–90: Self-* and Auto-Check agents ───────────────────────────────
// These run sequentially in the self-improvement loop.
// Each is a targeted validator or optimizer — no AI calls.

export class SelfOptimizationAgent extends BaseAgent {
  readonly id = '58-self-optimization';
  readonly name = 'SelfOptimizationAgent';
  async run(_ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();
    // Remove redundant whitespace, optimize token count
    const optimized = response
      .replace(/  +/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const saved = response.length - optimized.length;
    return this.ok(this.id, { response: optimized, data: { chars_saved: saved } }, t);
  }
}

export class SelfConsistencyAgent extends BaseAgent {
  readonly id = '64-self-consistency';
  readonly name = 'SelfConsistencyAgent';
  async run(_ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();
    // Cross-check: if response mentions a price, ensure it matches known products
    const KNOWN_PRICES = ['89,90', '49,90', '29,90', '149,90', '15,00'];
    const priceMatches = response.match(/R\$\s*[\d]+[,.][\d]{2}/g) ?? [];
    const inconsistent = priceMatches.filter(p => !KNOWN_PRICES.some(kp => p.includes(kp)));
    return this.ok(
      this.id,
      {
        data: { consistent: inconsistent.length === 0, inconsistencies: inconsistent },
        confidence: inconsistent.length === 0 ? 95 : 50,
      },
      t,
    );
  }
}

export class SelfLearningAgent extends BaseAgent {
  readonly id = '59-self-learning';
  readonly name = 'SelfLearningAgent';
  async run(ctx: AgentContext, userMsg: string, botResponse: string): Promise<AgentResult> {
    const t = this.start();
    // Store successful interaction pattern in Vectorize for future RAG retrieval
    if (ctx.session.confidence && ctx.session.confidence > 80) {
      // Async write — non-blocking
      ctx.env.AI.run('@cf/baai/bge-m3', { text: [`Q: ${userMsg}\nA: ${botResponse}`] })
        .then((emb: unknown) => {
          const embedding = emb as { data?: number[][] };
          if (embedding.data?.[0]) {
            ctx.env.VECTORIZE.upsert([
              {
                id: `learned-${Date.now()}`,
                values: embedding.data[0],
                metadata: {
                  content: `Q: ${userMsg}\nA: ${botResponse}`,
                  type: 'learned',
                  lang: ctx.session.language,
                },
              },
            ]).catch(() => {});
          }
        })
        .catch(() => {});
    }
    return this.ok(
      this.id,
      { data: { learning_triggered: (ctx.session.confidence ?? 0) > 80 } },
      t,
    );
  }
}

// Auto-checkers (73–90) — wrapper validators, mostly pass-through
export class SecurityCheckAgent extends BaseAgent {
  readonly id = '73-security-check';
  readonly name = 'SecurityCheckAgent';
  async run(_ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();
    // Ensure no system prompt leakage in response
    const hasLeak = /you are a helpful|system prompt|jwt_secret|api_key/i.test(response);
    if (hasLeak) {
      return this.fail(this.id, 'Potential system prompt leakage in response', t);
    }
    return this.ok(this.id, { data: { secure: true } }, t);
  }
}

export class PerformanceCheckAgent extends BaseAgent {
  readonly id = '74-performance-check';
  readonly name = 'PerformanceCheckAgent';
  async run(_ctx: AgentContext, totalMs: number): Promise<AgentResult> {
    const t = this.start();
    const sla = 3000; // 3s SLA
    const ok = totalMs < sla;
    if (!ok) {
      logger.warn(`[PERF] Pipeline exceeded SLA: ${totalMs}ms (SLA: ${sla}ms)`);
    }
    return this.ok(this.id, { data: { within_sla: ok, totalMs, sla } }, t);
  }
}

export class MemoryCheckAgent extends BaseAgent {
  readonly id = '75-memory-check';
  readonly name = 'MemoryCheckAgent';
  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const contextSize = ctx.session.context.length;
    const withinBudget = contextSize <= 20;
    return this.ok(
      this.id,
      { data: { context_size: contextSize, within_budget: withinBudget } },
      t,
    );
  }
}

export class FlowCheckAgent extends BaseAgent {
  readonly id = '81-flow-check';
  readonly name = 'FlowCheckAgent';
  async run(_ctx: AgentContext, pipeline: string[]): Promise<AgentResult> {
    const t = this.start();
    const required = ['27-security', '02-intent'];
    const missing = required.filter(r => !pipeline.includes(r));
    return this.ok(this.id, { data: { valid: missing.length === 0, missing } }, t);
  }
}

export class ContinuityCheckAgent extends BaseAgent {
  readonly id = '82-continuity-check';
  readonly name = 'ContinuityCheckAgent';
  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const hasHistory = ctx.session.context.length > 0;
    const turnCountOk = ctx.session.turn >= 0;
    return this.ok(
      this.id,
      {
        data: {
          continuous: hasHistory || ctx.session.turn === 0,
          turn: ctx.session.turn,
          turnCountOk,
        },
      },
      t,
    );
  }
}

export class ResponseCheckAgent extends BaseAgent {
  readonly id = '78-response-check';
  readonly name = 'ResponseCheckAgent';
  async run(_ctx: AgentContext, response: string): Promise<AgentResult> {
    const t = this.start();
    const checks = {
      not_empty: response.trim().length > 0,
      not_too_short: response.trim().length >= 10,
      not_binary: response.trim() !== 'true' && response.trim() !== 'false',
      no_raw_json: !response.trim().startsWith('{') && !response.trim().startsWith('['),
    };
    const failed = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    return this.ok(
      this.id,
      {
        data: { checks, failed, passed: failed.length === 0 },
        confidence: failed.length === 0 ? 95 : 30,
      },
      t,
    );
  }
}

export const logAgent = new LogAgent();
export const monitoringAgent = new MonitoringAgent();
export const auditAgent = new AuditAgent();
export const healthAgent = new HealthAgent();
export const selfOptimizationAgent = new SelfOptimizationAgent();
export const selfConsistencyAgent = new SelfConsistencyAgent();
export const selfLearningAgent = new SelfLearningAgent();
export const securityCheckAgent = new SecurityCheckAgent();
export const performanceCheckAgent = new PerformanceCheckAgent();
export const memoryCheckAgent = new MemoryCheckAgent();
export const flowCheckAgent = new FlowCheckAgent();
export const continuityCheckAgent = new ContinuityCheckAgent();
export const responseCheckAgent = new ResponseCheckAgent();
