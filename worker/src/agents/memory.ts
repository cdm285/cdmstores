/**
 * Agent 05 — ShortMemoryAgent    KV / D1 fallback — session context (TTL 30min)
 * Agent 06 — LongMemoryAgent     D1 — conversation history (persistent)
 * Agent 07 — SemanticMemoryAgent Vectorize — RAG context retrieval
 * Agent 08 — EpisodicMemoryAgent D1 — specific events (orders, tickets)
 * Agent 04 — ContextAgent        Assembles context window for AI prompt
 */

import {
  BaseAgent, AgentContext, AgentResult, SessionMessage, SessionState
} from '../core/types.js';

const SESSION_TTL_SECONDS = 1800; // 30 min

// ─── Agent 05 — ShortMemoryAgent ──────────────────────────────────────────────
export class ShortMemoryAgent extends BaseAgent {
  readonly id = '05-short-memory';
  readonly name = 'ShortMemoryAgent';

  async run(ctx: AgentContext, operation: 'read' | 'write', sessionId: string): Promise<AgentResult> {
    const t = this.start();
    const key = `session:${sessionId}`;

    try {
      if (operation === 'read') {
        // Try KV first, fall back to D1
        if (ctx.env.KV) {
          const raw = await ctx.env.KV.get(key);
          if (raw) {
            const state = JSON.parse(raw) as Partial<SessionState>;
            if (state.context) ctx.session.context = state.context;
            if (state.language) ctx.session.language = state.language;
            if (state.turn !== undefined) ctx.session.turn = state.turn;
            return this.ok(this.id, { data: { source: 'kv', found: true } }, t);
          }
        }
        // D1 fallback — session_cache table
        const row = await ctx.env.DB.prepare(
          'SELECT context FROM session_cache WHERE session_id = ? AND expires_at > datetime("now") LIMIT 1'
        ).bind(sessionId).first<{ context: string }>();
        if (row?.context) {
          const state = JSON.parse(row.context) as Partial<SessionState>;
          if (state.context) ctx.session.context = state.context;
          if (state.language) ctx.session.language = state.language;
          if (state.turn !== undefined) ctx.session.turn = state.turn;
          return this.ok(this.id, { data: { source: 'd1', found: true } }, t);
        }
        return this.ok(this.id, { data: { source: 'none', found: false } }, t);
      }

      // Write
      const payload = JSON.stringify({
        context: ctx.session.context.slice(-20), // last 20 messages
        language: ctx.session.language,
        turn: ctx.session.turn,
      });

      if (ctx.env.KV) {
        await ctx.env.KV.put(key, payload, { expirationTtl: SESSION_TTL_SECONDS });
      } else {
        const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
        await ctx.env.DB.prepare(
          `INSERT OR REPLACE INTO session_cache (session_id, context, expires_at, updated_at)
           VALUES (?, ?, ?, datetime("now"))`
        ).bind(sessionId, payload, expiresAt).run();
      }

      return this.ok(this.id, { data: { written: true } }, t);
    } catch {
      return this.ok(this.id, { data: { found: false, error: 'storage_unavailable' } }, t);
    }
  }
}

// ─── Agent 06 — LongMemoryAgent ───────────────────────────────────────────────
export class LongMemoryAgent extends BaseAgent {
  readonly id = '06-long-memory';
  readonly name = 'LongMemoryAgent';

  async run(ctx: AgentContext, operation: 'read' | 'write', sessionId: string, message?: string, response?: string, model?: string): Promise<AgentResult> {
    const t = this.start();

    try {
      if (operation === 'read') {
        // Load or create conversation
        let conv = await ctx.env.DB.prepare(
          'SELECT id FROM ai_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(sessionId).first<{ id: number }>();

        if (!conv) {
          const r = await ctx.env.DB.prepare(
            'INSERT INTO ai_conversations (session_id, user_id, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))'
          ).bind(sessionId, ctx.user?.id ?? null).run();
          conv = { id: r.meta.last_row_id as number };
        }

        ctx.meta.conversation_id = conv.id;

        // Load last 10 messages into session context
        const history = await ctx.env.DB.prepare(
          'SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10'
        ).bind(conv.id).all<{ role: string; content: string }>();

        const loaded: SessionMessage[] = history.results.reverse().map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        // Merge with existing (short memory wins)
        if (ctx.session.context.length === 0) {
          ctx.session.context = loaded;
        }

        return this.ok(this.id, { data: { conversation_id: conv.id, loaded: loaded.length } }, t);
      }

      // Write — save user message + bot response
      const convId = ctx.meta.conversation_id as number;
      if (!convId || !message || !response) {
        return this.ok(this.id, { data: { skipped: true } }, t);
      }

      await ctx.env.DB.batch([
        ctx.env.DB.prepare(
          'INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
        ).bind(convId, 'user', message, model ?? 'orchestrator'),
        ctx.env.DB.prepare(
          'INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
        ).bind(convId, 'assistant', response, model ?? 'orchestrator'),
        ctx.env.DB.prepare(
          'UPDATE ai_conversations SET updated_at = datetime("now") WHERE id = ?'
        ).bind(convId),
      ]);

      // Update turn count
      ctx.session.turn += 1;

      return this.ok(this.id, { data: { saved: true } }, t);
    } catch {
      return this.ok(this.id, { data: { error: 'db_unavailable' } }, t);
    }
  }
}

// ─── Agent 07 — SemanticMemoryAgent ──────────────────────────────────────────
export class SemanticMemoryAgent extends BaseAgent {
  readonly id = '07-semantic-memory';
  readonly name = 'SemanticMemoryAgent';

  async run(ctx: AgentContext, operation: 'read' | 'write', query?: string, content?: string): Promise<AgentResult> {
    const t = this.start();

    try {
      if (operation === 'read' && query) {
        const embedding = await ctx.env.AI.run('@cf/baai/bge-m3', { text: [query] }) as { data: number[][] };
        if (!embedding.data?.[0]) return this.ok(this.id, { data: { results: [] } }, t);

        const matches = await ctx.env.VECTORIZE.query(embedding.data[0], {
          topK: 3,
          returnMetadata: 'all',
        });

        const results = matches.matches
          .filter(m => m.score > 0.70)
          .map(m => m.metadata?.content as string)
          .filter(Boolean);

        ctx.meta.semantic_context = results.join('\n');
        return this.ok(this.id, { data: { results, count: results.length } }, t);
      }

      if (operation === 'write' && content) {
        const embedding = await ctx.env.AI.run('@cf/baai/bge-m3', { text: [content] }) as { data: number[][] };
        if (!embedding.data?.[0]) return this.ok(this.id, { data: { stored: false } }, t);

        const vectorId = `conv-${ctx.meta.conversation_id ?? 'anon'}-${Date.now()}`;
        await ctx.env.VECTORIZE.upsert([{
          id: vectorId,
          values: embedding.data[0],
          metadata: { content, type: 'conversation' },
        }]);

        return this.ok(this.id, { data: { stored: true, vectorId } }, t);
      }

      return this.ok(this.id, { data: { noop: true } }, t);
    } catch {
      return this.ok(this.id, { data: { results: [] } }, t);
    }
  }
}

// ─── Agent 08 — EpisodicMemoryAgent ──────────────────────────────────────────
export class EpisodicMemoryAgent extends BaseAgent {
  readonly id = '08-episodic-memory';
  readonly name = 'EpisodicMemoryAgent';

  async run(ctx: AgentContext, email?: string): Promise<AgentResult> {
    const t = this.start();
    if (!email && !ctx.user?.email) {
      return this.ok(this.id, { data: { episodes: [] } }, t);
    }

    const targetEmail = email ?? ctx.user!.email;

    try {
      const orders = await ctx.env.DB.prepare(
        'SELECT id, total, status, created_at FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT 3'
      ).bind(targetEmail).all<{ id: number; total: number; status: string; created_at: string }>();

      const episodes = orders.results.map(o => ({
        type: 'order',
        id: o.id,
        total: o.total,
        status: o.status,
        date: o.created_at,
      }));

      ctx.meta.recent_orders = episodes;
      return this.ok(this.id, { data: { episodes, count: episodes.length } }, t);
    } catch {
      return this.ok(this.id, { data: { episodes: [] } }, t);
    }
  }
}

// ─── Agent 04 — ContextAgent ──────────────────────────────────────────────────
// Assembles the final context window for the AI prompt
export class ContextAgent extends BaseAgent {
  readonly id = '04-context';
  readonly name = 'ContextAgent';

  private static readonly MAX_TOKENS_APPROX = 3000; // ~12K chars
  private static readonly CHARS_PER_TOKEN = 4;

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();

    // Trim context to fit within token budget
    let totalChars = 0;
    const trimmed: SessionMessage[] = [];

    for (let i = ctx.session.context.length - 1; i >= 0; i--) {
      const msg = ctx.session.context[i];
      totalChars += msg.content.length;
      if (totalChars / ContextAgent.CHARS_PER_TOKEN > ContextAgent.MAX_TOKENS_APPROX) break;
      trimmed.unshift(msg);
    }

    ctx.session.context = trimmed;
    ctx.meta.context_trimmed = ctx.session.context.length !== trimmed.length;

    return this.ok(this.id, { data: { messages: trimmed.length, estimatedTokens: Math.round(totalChars / ContextAgent.CHARS_PER_TOKEN) } }, t);
  }
}

export const shortMemoryAgent = new ShortMemoryAgent();
export const longMemoryAgent = new LongMemoryAgent();
export const semanticMemoryAgent = new SemanticMemoryAgent();
export const episodicMemoryAgent = new EpisodicMemoryAgent();
export const contextAgent = new ContextAgent();
