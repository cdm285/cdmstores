/**
 * Agent 06 — Long-Term Memory (conversations + messages)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2: Memory — persists multi-turn conversations in D1:
 *   table `ai_conversations` — one row per session/conversation
 *   table `ai_messages`      — one row per user/assistant turn
 *
 * Operations:
 *   load  — fetches or creates the conversation, loads last N messages into
 *            ctx.session.messages and sets ctx.conversationId
 *   save  — appends the current user+assistant turn to ai_messages and
 *            updates the conversation's updated_at timestamp
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { AgentEnv, SessionMessage } from '../core/types.js';

// ─── Tunables ─────────────────────────────────────────────────────────────────
const RECENT_MSG_LIMIT = 10; // how many past messages to load

// ─── Types ────────────────────────────────────────────────────────────────────
export type LongMemoryOp = 'load' | 'save';

interface ConversationRow {
  id         : number;
  session_id : string;
  language   : string;
  updated_at : string;
}

interface MessageRow {
  id              : number;
  conversation_id : number;
  role            : 'user' | 'assistant';
  content         : string;
  created_at      : string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
async function getOrCreateConversation(env: AgentEnv, sessionId: string, language = 'pt'): Promise<number> {
  // Try to fetch existing conversation
  const existing = await env.DB.prepare(
    'SELECT id FROM ai_conversations WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1'
  ).bind(sessionId).first<ConversationRow>();

  if (existing) {return existing.id;}

  // Create new one
  const result = await env.DB.prepare(
    'INSERT INTO ai_conversations (session_id, language) VALUES (?, ?) RETURNING id'
  ).bind(sessionId, language).first<{ id: number }>();

  return result?.id ?? 0;
}

async function loadMessages(env: AgentEnv, conversationId: number): Promise<SessionMessage[]> {
  const { results } = await env.DB.prepare(
    `SELECT role, content, created_at FROM ai_messages
     WHERE conversation_id = ?
     ORDER BY id DESC
     LIMIT ?`
  ).bind(conversationId, RECENT_MSG_LIMIT).all<MessageRow>();

  // Reverse so oldest is first (DESC → reverse)
  return (results ?? [])
    .reverse()
    .map(r => ({
      role   : r.role,
      content: r.content,
      ts     : new Date(r.created_at).getTime(),
    }));
}

async function saveMessages(env: AgentEnv, conversationId: number, userMsg: string, assistantMsg: string): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)'
  );

  await env.DB.batch([
    stmt.bind(conversationId, 'user',      userMsg),
    stmt.bind(conversationId, 'assistant', assistantMsg),
    env.DB.prepare('UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId),
  ]);
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent06LongMemory {
  readonly id   = '06-long-memory';
  readonly name = 'LongMemoryAgent';
  readonly tier = 2;

  /**
   * @param op      'load' — read history into ctx | 'save' — persist turn
   * @param sessionId  The session identifier (from cookie / header)
   * @param userMsg    (save only) The user's message for this turn
   * @param assistantMsg (save only) The assistant's reply
   */
  async execute(
    ctx          : ExtendedAgentContext,
    sessionId    : string,
    op           : LongMemoryOp = 'load',
    userMsg      = '',
    assistantMsg = '',
  ): Promise<void> {
    const start = Date.now();

    if (!ctx.env.DB) {
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: 0, error: 'D1 binding missing' });
      return;
    }

    const env = ctx.env as AgentEnv;

    try {
      if (op === 'load') {
        const convId = await getOrCreateConversation(env, sessionId, ctx.session.language ?? 'pt');
        ctx.conversationId = convId;

        const msgs = await loadMessages(env, convId);
        ctx.session.context = msgs;
        ctx.flags.longMemory = true;
      } else if (op === 'save') {
        if (!ctx.conversationId) {return;} // nothing to save to
        const convId = ctx.conversationId; // already a number
        if (convId > 0 && userMsg && assistantMsg) {
          await saveMessages(env, convId, userMsg, assistantMsg);
        }
      }

      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: Date.now() - start, confidence: 100 });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
    }
  }
}

export const agent06LongMemory = new Agent06LongMemory();
export default agent06LongMemory;
