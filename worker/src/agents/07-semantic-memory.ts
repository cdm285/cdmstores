/**
 * Agent 07 — Semantic Memory (Vectorize RAG)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2: Memory — retrieves semantically similar knowledge chunks from
 * Cloudflare Vectorize to augment the AI reasoning context.
 *
 * Model: @cf/baai/bge-m3 for embeddings
 * Binding: env.VECTORIZE_INDEX (VectorizeIndex)
 * Score threshold: 0.70 — chunks below this are discarded
 *
 * Writes to ctx:
 *   ctx.semanticCtx  — concatenated top-K knowledge snippets
 *   ctx.flags.semanticMemory — true if results found
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { AgentEnv, AiFlex } from '../core/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const EMBED_MODEL = '@cf/baai/bge-m3';
const SCORE_THRESHOLD = 0.7;
const TOP_K = 5;

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent07SemanticMemory {
  readonly id = '07-semantic-memory';
  readonly name = 'SemanticMemoryAgent';
  readonly tier = 2;

  async execute(ctx: ExtendedAgentContext, query: string): Promise<void> {
    const start = Date.now();

    const env = ctx.env as AgentEnv;

    if (!env.AI || !env.VECTORIZE) {
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: 0,
        error: 'AI or VECTORIZE binding missing',
      });
      return;
    }

    try {
      // 1. Generate embedding for the user query
      const embedResponse = await (env.AI as unknown as AiFlex).run(EMBED_MODEL, {
        text: [query],
      });

      // `embedResponse.data` is an array of float[] — one per input text
      const vector: number[] = Array.isArray(embedResponse?.data)
        ? (embedResponse.data[0] as number[])
        : [];

      if (vector.length === 0) {
        addTrace(ctx, {
          agentId: this.id,
          agentName: this.name,
          success: false,
          latencyMs: Date.now() - start,
          error: 'Empty embedding returned',
        });
        return;
      }

      // 2. Query Vectorize
      const queryResult = await env.VECTORIZE.query(vector, {
        topK: TOP_K,
        returnMetadata: 'all',
      });

      const hits = (queryResult.matches ?? []).filter(m => (m.score ?? 0) >= SCORE_THRESHOLD);

      if (hits.length === 0) {
        addTrace(ctx, {
          agentId: this.id,
          agentName: this.name,
          success: true,
          latencyMs: Date.now() - start,
          confidence: 0,
        });
        return;
      }

      // 3. Build semantic context string
      const snippets = hits
        .map(h => {
          const meta = h.metadata as Record<string, string> | undefined;
          return meta?.text ?? meta?.content ?? JSON.stringify(meta);
        })
        .filter(Boolean);

      ctx.semanticCtx = snippets.join('\n---\n');
      ctx.flags.semanticMemory = true;

      const avgScore = hits.reduce((acc, h) => acc + (h.score ?? 0), 0) / hits.length;
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: true,
        latencyMs: Date.now() - start,
        confidence: Math.round(avgScore * 100),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: Date.now() - start,
        error,
      });
    }
  }
}

export const agent07SemanticMemory = new Agent07SemanticMemory();
export default agent07SemanticMemory;
