/**
 * Agent 04 — Context Assembler
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 1: Cognitive — assembles the conversation window from session messages,
 * trims to a safe token budget, and prepares the context string used by
 * downstream AI agents.
 *
 * Budget: messages older than 90 minutes are discarded; total character length
 * is capped at ~12 000 chars (≈3 000 tokens at 4 chars/token on average).
 *
 * Writes to ctx:
 *   ctx.session.context          — trimmed conversation window (single string)
 *   ctx.meta.contextTokensEst    — estimated token count
 *   ctx.meta.contextMsgCount     — number of messages kept
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { SessionMessage } from '../core/types.js';

// ─── Tunables ─────────────────────────────────────────────────────────────────
const MAX_CHARS = 12_000; // ≈ 3 000 tokens
const MAX_AGE_MS = 90 * 60 * 1000; // 90 minutes
const TRIM_MARKER = '[... histórico anterior omitido ...]';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Render a SessionMessage to a readable line */
function renderMessage(msg: SessionMessage): string {
  const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
  return `${role}: ${msg.content.trim()}`;
}

/** Estimate token count from character length */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Build the conversation window from a list of session messages */
function buildWindow(messages: SessionMessage[], now = Date.now()): SessionMessage[] {
  return messages.filter(m => {
    if (!m.ts) {
      return true;
    } // keep if no timestamp
    return now - m.ts < MAX_AGE_MS;
  });
}

/** Trim the window from oldest end until it fits within MAX_CHARS */
function trimToLimit(messages: SessionMessage[]): { lines: string[]; trimmed: boolean } {
  const all = messages.map(renderMessage);
  let total = all.join('\n').length;
  let start = 0;

  while (total > MAX_CHARS && start < all.length - 1) {
    total -= all[start].length + 1;
    start++;
  }

  const kept = all.slice(start);
  const trimmed = start > 0;
  if (trimmed) {
    kept.unshift(TRIM_MARKER);
  }
  return { lines: kept, trimmed };
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent04Context {
  readonly id = '04-context';
  readonly name = 'ContextAgent';
  readonly tier = 1;

  execute(ctx: ExtendedAgentContext): void {
    const start = Date.now();

    // Accept messages from session (may have been populated by 06-long-memory)
    const raw: SessionMessage[] = Array.isArray(ctx.session.context)
      ? (ctx.session.context as SessionMessage[])
      : [];

    if (raw.length === 0) {
      ctx.meta.contextStr = '';
      ctx.meta.contextTokensEst = 0;
      ctx.meta.contextMsgCount = 0;
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: true,
        latencyMs: Date.now() - start,
        confidence: 100,
      });
      return;
    }

    // Filter by age and trim to budget
    const window = buildWindow(raw);
    const { lines, trimmed } = trimToLimit(window);
    const contextStr = lines.join('\n');

    // Write formatted string to meta (session.context stays as SessionMessage[])
    ctx.meta.contextStr = contextStr;
    ctx.meta.contextTokensEst = estimateTokens(contextStr);
    ctx.meta.contextMsgCount = window.length;
    ctx.meta.contextTrimmed = trimmed;

    addTrace(ctx, {
      agentId: this.id,
      agentName: this.name,
      success: true,
      latencyMs: Date.now() - start,
      confidence: 100,
    });
  }
}

export const agent04Context = new Agent04Context();
export default agent04Context;
