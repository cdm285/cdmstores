/**
 * CDM STORES — Workers AI routes
 * POST /api/ai/chat
 * POST /api/ai/embed
 * POST /api/ai/search
 * POST /api/ai/classify
 * POST /api/ai/image
 * GET  /api/ai/history/:session_id
 */

import type { Env } from '../lib/response.js';
import { internalError, json } from '../lib/response.js';

export async function handleWorkersAI(req: Request, env: Env, path: string): Promise<Response> {
  try {
    // POST /api/ai/chat — Llama 3 with semantic context from Vectorize
    if (path === '/api/ai/chat' && req.method === 'POST') {
      const { message, session_id, user_id, use_large_model } = (await req.json()) as {
        message: string;
        session_id: string;
        user_id?: number;
        use_large_model?: boolean;
      };
      if (!message || !session_id) {
        return json({ success: false, error: 'message e session_id obrigatórios' }, 400);
      }

      const model = use_large_model
        ? '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
        : '@cf/meta/llama-3-8b-instruct';

      let conv = await env.DB.prepare(
        'SELECT id FROM ai_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      )
        .bind(session_id)
        .first<{ id: number }>();
      if (!conv) {
        const r = await env.DB.prepare(
          'INSERT INTO ai_conversations (session_id, user_id, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
        )
          .bind(session_id, user_id ?? null)
          .run();
        conv = { id: r.meta.last_row_id as number };
      }

      const history = await env.DB.prepare(
        'SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10',
      )
        .bind(conv.id)
        .all<{ role: string; content: string }>();

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        {
          role: 'system',
          content:
            'Você é o assistente da CDM STORES, uma loja online de produtos premium. Seja prestativo e conciso.',
        },
        ...history.results
          .reverse()
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message },
      ];

      try {
        const qEmbed = (await env.AI.run('@cf/baai/bge-m3', { text: [message] })) as {
          data: number[][];
        };
        if (qEmbed.data?.[0]) {
          const matches = await env.VECTORIZE.query(qEmbed.data[0], {
            topK: 3,
            returnMetadata: 'all',
          });
          const ctx = matches.matches
            .filter(m => m.score > 0.7)
            .map(m => m.metadata?.content as string)
            .filter(Boolean)
            .join('\n');
          if (ctx) {
            messages[0].content += `\n\nContexto relevante:\n${ctx}`;
          }
        }
      } catch {
        /* Vectorize failed, continue without context */
      }

      const response = (await env.AI.run(model, { messages })) as { response: string };
      const assistantMessage = response.response;

      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
        ).bind(conv.id, 'user', message, model),
        env.DB.prepare(
          'INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
        ).bind(conv.id, 'assistant', assistantMessage, model),
        env.DB.prepare(
          'UPDATE ai_conversations SET updated_at = datetime("now") WHERE id = ?',
        ).bind(conv.id),
      ]);

      try {
        const embed = (await env.AI.run('@cf/baai/bge-m3', {
          text: [`User: ${message}\nAssistant: ${assistantMessage}`],
        })) as { data: number[][] };
        if (embed.data?.[0]) {
          await env.VECTORIZE.upsert([
            {
              id: `msg-${conv.id}-${Date.now()}`,
              values: embed.data[0],
              metadata: {
                content: `User: ${message}\nAssistant: ${assistantMessage}`,
                conversation_id: conv.id,
                type: 'message',
              },
            },
          ]);
        }
      } catch {
        /* non-blocking */
      }

      return json({ success: true, response: assistantMessage, conversation_id: conv.id, model });
    }

    // POST /api/ai/embed — BGE-M3 embeddings into Vectorize
    if (path === '/api/ai/embed' && req.method === 'POST') {
      const { texts, content_type, ref_id } = (await req.json()) as {
        texts: string[];
        content_type: string;
        ref_id?: string;
      };
      if (!texts?.length) {
        return json({ success: false, error: 'texts obrigatório' }, 400);
      }
      const result = (await env.AI.run('@cf/baai/bge-m3', { text: texts })) as { data: number[][] };
      const vectors = result.data.map((values, i) => ({
        id: `${content_type ?? 'doc'}-${ref_id ?? i}-${Date.now()}`,
        values,
        metadata: {
          content: texts[i],
          content_type: content_type ?? 'document',
          ref_id: ref_id ?? '',
        },
      }));
      await env.VECTORIZE.upsert(vectors);
      return json({ success: true, count: vectors.length, ids: vectors.map(v => v.id) });
    }

    // POST /api/ai/search — semantic search via Vectorize
    if (path === '/api/ai/search' && req.method === 'POST') {
      const {
        query,
        top_k = 5,
        min_score = 0.6,
      } = (await req.json()) as { query: string; top_k?: number; min_score?: number };
      if (!query) {
        return json({ success: false, error: 'query obrigatória' }, 400);
      }
      const embedding = (await env.AI.run('@cf/baai/bge-m3', { text: [query] })) as {
        data: number[][];
      };
      const matches = await env.VECTORIZE.query(embedding.data[0], {
        topK: top_k,
        returnMetadata: 'all',
      });
      return json({
        success: true,
        results: matches.matches
          .filter(m => m.score >= min_score)
          .map(m => ({ id: m.id, score: m.score, metadata: m.metadata })),
      });
    }

    // POST /api/ai/classify — DistilBERT sentiment
    if (path === '/api/ai/classify' && req.method === 'POST') {
      const { text } = (await req.json()) as { text: string };
      if (!text) {
        return json({ success: false, error: 'text obrigatório' }, 400);
      }
      const result = (await env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
        text,
      })) as unknown as Array<{ label: string; score: number }>;
      const top = result[0] ?? { label: 'UNKNOWN', score: 0 };
      return json({ success: true, label: top.label, score: top.score });
    }

    // POST /api/ai/image — Flux image generation
    if (path === '/api/ai/image' && req.method === 'POST') {
      const { prompt, steps = 4 } = (await req.json()) as { prompt: string; steps?: number };
      if (!prompt) {
        return json({ success: false, error: 'prompt obrigatório' }, 400);
      }
      const result = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt,
        num_steps: Math.min(steps, 8),
      })) as { image: string };
      return new Response(result.image, { headers: { 'Content-Type': 'image/jpeg' } });
    }

    // GET /api/ai/history/:session_id
    if (path.match(/^\/api\/ai\/history\/[^/]+$/) && req.method === 'GET') {
      // regex guarantees at least one path segment
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const session_id = path.split('/').pop()!;
      const conv = await env.DB.prepare(
        'SELECT id, created_at, updated_at, title FROM ai_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      )
        .bind(session_id)
        .first<{ id: number; created_at: string; updated_at: string; title: string | null }>();
      if (!conv) {
        return json({ success: true, messages: [], conversation: null });
      }
      const msgs = await env.DB.prepare(
        'SELECT role, content, model, created_at, version FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      )
        .bind(conv.id)
        .all();
      return json({ success: true, conversation: conv, messages: msgs.results });
    }

    return json({ error: 'Not found', path }, 404);
  } catch (error) {
    return internalError(error, 'ai');
  }
}
