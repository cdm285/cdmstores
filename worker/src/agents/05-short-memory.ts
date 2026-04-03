/**
 * Agent 05 — Short-Term Memory (session cache)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2: Memory — reads and writes the short-lived session state stored in
 * the D1 table `session_cache`.
 *
 * TTL: 30 minutes (1 800 seconds by default).
 *
 * Operations:
 *   read  — loads cached session JSON into ctx.session (merge strategy)
 *   write — persists ctx.session back to cache (upsert)
 *   clear — removes a session entry
 *
 * Writes to ctx when operation='read':
 *   ctx.session.*             — merged from cache
 *   ctx.conversationId        — if stored in cache
 */

import { addTrace, ExtendedAgentContext } from '../core/agent-context.js';
import type { AgentEnv } from '../core/types.js';

// ─── TTL ──────────────────────────────────────────────────────────────────────
const DEFAULT_TTL_S = 1_800; // 30 min

// ─── Types ────────────────────────────────────────────────────────────────────
export type ShortMemoryOp = 'read' | 'write' | 'clear';

interface CacheRow {
  session_id  : string;
  data        : string;  // JSON
  expires_at  : number;  // unix epoch seconds
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
async function dbRead(env: AgentEnv, sessionId: string): Promise<Record<string, unknown> | null> {
  try {
    const row = await env.DB.prepare(
      'SELECT data, expires_at FROM session_cache WHERE session_id = ? LIMIT 1'
    ).bind(sessionId).first<CacheRow>();

    if (!row) return null;

    const nowS = Math.floor(Date.now() / 1000);
    if (row.expires_at < nowS) {
      // Expired — clean up and return null
      env.DB.prepare('DELETE FROM session_cache WHERE session_id = ?').bind(sessionId).run().catch(() => void 0);
      return null;
    }

    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function dbWrite(env: AgentEnv, sessionId: string, data: Record<string, unknown>, ttlS = DEFAULT_TTL_S): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlS;
  await env.DB.prepare(
    `INSERT INTO session_cache (session_id, data, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
  ).bind(sessionId, JSON.stringify(data), expiresAt).run();
}

async function dbClear(env: AgentEnv, sessionId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM session_cache WHERE session_id = ?').bind(sessionId).run();
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent05ShortMemory {
  readonly id   = '05-short-memory';
  readonly name = 'ShortMemoryAgent';
  readonly tier = 2;

  async execute(ctx: ExtendedAgentContext, sessionId: string, op: ShortMemoryOp = 'read', ttlS = DEFAULT_TTL_S): Promise<void> {
    const start = Date.now();

    if (!ctx.env.DB) {
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: 0, error: 'D1 binding missing' });
      return;
    }

    const env = ctx.env as AgentEnv;

    try {
      switch (op) {
        case 'read': {
          const cached = await dbRead(env, sessionId);
          if (cached) {
            // Merge cached data into session (cached data wins for persistent fields)
            const { conversationId, language, ...rest } = cached;
            if (typeof conversationId === 'number') ctx.conversationId = conversationId;
            if (typeof language === 'string' && ['pt','en','es'].includes(language)) {
              ctx.session.language = language as 'pt' | 'en' | 'es';
            }
            // Merge any additional safe meta keys
            for (const [k, v] of Object.entries(rest)) {
              if (k !== 'updatedAt') (ctx.meta as Record<string, unknown>)[k] = v;
            }
            ctx.flags.shortMemory = true;
          }
          break;
        }

        case 'write': {
          const snapshot: Record<string, unknown> = {
            conversationId : ctx.conversationId ?? null,
            language       : ctx.session.language ?? 'pt',
            intent         : ctx.session.intent   ?? null,
            updatedAt      : Date.now(),
          };
          await dbWrite(env, sessionId, snapshot, ttlS);
          break;
        }

        case 'clear': {
          await dbClear(env, sessionId);
          break;
        }
      }

      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence: 100 });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
    }
  }
}

export const agent05ShortMemory = new Agent05ShortMemory();
export default agent05ShortMemory;
