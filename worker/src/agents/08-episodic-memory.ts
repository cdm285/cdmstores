/**
 * Agent 08 — Episodic Memory (order history by email)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2: Memory — looks up the customer's recent order history from D1 using
 * the email address extracted by Agent 01 (NLP).
 *
 * This "episodic" context lets the AI personalise responses with real data
 * (e.g., "your last order was X, placed on Y, status Z").
 *
 * Writes to ctx:
 *   ctx.recentOrders  — array of order summary objects (up to 3)
 */

import { addTrace, ExtendedAgentContext } from '../core/agent-context.js';
import type { AgentEnv } from '../core/types.js';

// ─── Tunables ─────────────────────────────────────────────────────────────────
const ORDER_LIMIT = 3;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface OrderSummary {
  orderId       : string;
  status        : string;
  total         : number;
  currency      : string;
  createdAt     : string;
  trackingCode ?: string;
}

interface OrderRow {
  id           : number;
  status       : string;
  total        : number;
  currency     : string;
  created_at   : string;
  tracking_code: string | null;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent08EpisodicMemory {
  readonly id   = '08-episodic-memory';
  readonly name = 'EpisodicMemoryAgent';
  readonly tier = 2;

  async execute(ctx: ExtendedAgentContext): Promise<void> {
    const start = Date.now();

    // Only run if we have a customer email
    const email = ctx.entities?.email as string | undefined;
    if (!email) {
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence: 100 });
      return;
    }

    if (!ctx.env.DB) {
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: 0, error: 'D1 binding missing' });
      return;
    }

    const env = ctx.env as AgentEnv;

    try {
      const { results } = await env.DB.prepare(
        `SELECT o.id, o.status, o.total, o.currency, o.created_at, o.tracking_code
         FROM orders o
         WHERE o.customer_email = ?
         ORDER BY o.created_at DESC
         LIMIT ?`
      ).bind(email.toLowerCase(), ORDER_LIMIT).all<OrderRow>();

      ctx.recentOrders = (results ?? []).map<OrderSummary>(r => ({
        orderId     : String(r.id),
        status      : r.status,
        total       : r.total,
        currency    : r.currency ?? 'BRL',
        createdAt   : r.created_at,
        trackingCode: r.tracking_code ?? undefined,
      }));

      addTrace(ctx, {
        agentId   : this.id,
        agentName : this.name,
        success   : true,
        latencyMs : Date.now() - start,
        confidence: 100,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
      ctx.recentOrders = [];
    }
  }
}

export const agent08EpisodicMemory = new Agent08EpisodicMemory();
export default agent08EpisodicMemory;
