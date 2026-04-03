import { Router } from 'itty-router';
import { json } from 'itty-router';

const router = Router({ base: '/api/ai' });

// ─── Modelos disponíveis ──────────────────────────────────────────────────────
const MODELS = {
  chat: '@cf/meta/llama-3-8b-instruct',
  chat_large: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  embedding: '@cf/baai/bge-m3',
  classification: '@cf/huggingface/distilbert-sst-2-int8',
  image_gen: '@cf/black-forest-labs/flux-1-schnell',
  speech_to_text: '@cf/openai/whisper',
} as const;

interface Env {
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
}

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
// Chat com Llama 3, com memória persistente no D1 + busca semântica Vectorize
router.post('/chat', async (req, env: Env) => {
  try {
    const { message, session_id, user_id, use_large_model } = await req.json() as {
      message: string;
      session_id: string;
      user_id?: number;
      use_large_model?: boolean;
    };

    if (!message || !session_id) {
      return json({ success: false, error: 'message e session_id obrigatórios' }, { status: 400 });
    }

    // Buscar ou criar conversa
    let conversation = await env.DB.prepare(
      'SELECT id FROM ai_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(session_id).first() as { id: number } | null;

    if (!conversation) {
      const result = await env.DB.prepare(
        'INSERT INTO ai_conversations (session_id, user_id, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))'
      ).bind(session_id, user_id ?? null).run();
      conversation = { id: result.meta.last_row_id as number };
    }

    const conversationId = conversation.id;

    // Buscar histórico recente (últimas 10 mensagens)
    const history = await env.DB.prepare(
      'SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10'
    ).bind(conversationId).all() as { results: Array<{ role: string; content: string }> };

    const messages = [
      {
        role: 'system' as const,
        content: 'Você é o assistente da CDM STORES, uma loja online especializada em produtos premium. Seja prestativo, conciso e foque em ajudar o cliente com compras, rastreamento de pedidos e suporte.'
      },
      ...history.results.reverse().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message }
    ];

    // Buscar contexto semântico relacionado via Vectorize
    let semanticContext = '';
    try {
      const queryEmbedding = await env.AI.run(MODELS.embedding, { text: [message] }) as { data: number[][] };
      if (queryEmbedding.data?.[0]) {
        const matches = await env.VECTORIZE.query(queryEmbedding.data[0], { topK: 3, returnMetadata: 'all' });
        if (matches.matches?.length > 0) {
          semanticContext = matches.matches
            .filter(m => m.score > 0.7)
            .map(m => m.metadata?.content as string)
            .filter(Boolean)
            .join('\n');
        }
      }
    } catch {
      // Vectorize falhou, continua sem contexto semântico
    }

    if (semanticContext) {
      messages[0].content += `\n\nContexto relevante:\n${semanticContext}`;
    }

    // Chamar modelo de chat
    const model = use_large_model ? MODELS.chat_large : MODELS.chat;
    const response = await env.AI.run(model, { messages }) as { response: string };
    const assistantMessage = response.response;

    // Salvar mensagem do usuário e resposta no D1
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
      ).bind(conversationId, 'user', message, model),
      env.DB.prepare(
        'INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
      ).bind(conversationId, 'assistant', assistantMessage, model),
      env.DB.prepare(
        'UPDATE ai_conversations SET updated_at = datetime("now") WHERE id = ?'
      ).bind(conversationId),
    ]);

    // Gerar e armazenar embedding da resposta no Vectorize (assíncrono)
    try {
      const contentToEmbed = `User: ${message}\nAssistant: ${assistantMessage}`;
      const embedding = await env.AI.run(MODELS.embedding, { text: [contentToEmbed] }) as { data: number[][] };
      if (embedding.data?.[0]) {
        const vectorId = `msg-${conversationId}-${Date.now()}`;
        await env.VECTORIZE.upsert([{
          id: vectorId,
          values: embedding.data[0],
          metadata: { content: contentToEmbed, conversation_id: conversationId, type: 'message' }
        }]);
      }
    } catch {
      // Falha no Vectorize não bloqueia a resposta
    }

    return json({
      success: true,
      response: assistantMessage,
      conversation_id: conversationId,
      model,
    });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// ─── POST /api/ai/embed ───────────────────────────────────────────────────────
// Gerar embedding e armazenar no Vectorize
router.post('/embed', async (req, env: Env) => {
  try {
    const { texts, content_type, ref_id } = await req.json() as {
      texts: string[];
      content_type: 'message' | 'product' | 'document';
      ref_id?: string;
    };

    if (!texts?.length || !content_type) {
      return json({ success: false, error: 'texts e content_type obrigatórios' }, { status: 400 });
    }

    const result = await env.AI.run(MODELS.embedding, { text: texts }) as { data: number[][] };

    const vectors = result.data.map((values, i) => ({
      id: `${content_type}-${ref_id ?? i}-${Date.now()}`,
      values,
      metadata: { content: texts[i], content_type, ref_id: ref_id ?? '' }
    }));

    await env.VECTORIZE.upsert(vectors);

    return json({ success: true, count: vectors.length, ids: vectors.map(v => v.id) });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// ─── POST /api/ai/search ──────────────────────────────────────────────────────
// Busca semântica via Vectorize
router.post('/search', async (req, env: Env) => {
  try {
    const { query, top_k = 5, min_score = 0.6 } = await req.json() as {
      query: string;
      top_k?: number;
      min_score?: number;
    };

    if (!query) {
      return json({ success: false, error: 'query obrigatória' }, { status: 400 });
    }

    const embedding = await env.AI.run(MODELS.embedding, { text: [query] }) as { data: number[][] };
    const matches = await env.VECTORIZE.query(embedding.data[0], { topK: top_k, returnMetadata: 'all' });

    const results = matches.matches
      .filter(m => m.score >= min_score)
      .map(m => ({ id: m.id, score: m.score, metadata: m.metadata }));

    return json({ success: true, results });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// ─── POST /api/ai/classify ────────────────────────────────────────────────────
// Classificação de texto (sentimento, categoria)
router.post('/classify', async (req, env: Env) => {
  try {
    const { text } = await req.json() as { text: string };

    if (!text) {
      return json({ success: false, error: 'text obrigatório' }, { status: 400 });
    }

    const result = await env.AI.run(MODELS.classification, { text }) as unknown as Array<{ label: string; score: number }>;
    const top = result[0] ?? { label: 'UNKNOWN', score: 0 };
    return json({ success: true, label: top.label, score: top.score });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// ─── POST /api/ai/image ───────────────────────────────────────────────────────
// Geração de imagem via Flux
router.post('/image', async (req, env: Env) => {
  try {
    const { prompt, steps = 4 } = await req.json() as { prompt: string; steps?: number };

    if (!prompt) {
      return json({ success: false, error: 'prompt obrigatório' }, { status: 400 });
    }

    const result = await env.AI.run(MODELS.image_gen, { prompt, num_steps: Math.min(steps, 8) }) as { image: string };

    return new Response(result.image, {
      headers: { 'Content-Type': 'image/jpeg' }
    });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// ─── POST /api/ai/transcribe ──────────────────────────────────────────────────
// Speech-to-text via Whisper
router.post('/transcribe', async (req, env: Env) => {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return json({ success: false, error: 'arquivo de áudio obrigatório (campo "audio")' }, { status: 400 });
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const result = await env.AI.run(MODELS.speech_to_text, {
      audio: [...new Uint8Array(audioBuffer)]
    }) as { text: string };

    return json({ success: true, text: result.text });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// ─── GET /api/ai/history/:session_id ─────────────────────────────────────────
// Histórico de conversas de uma sessão
router.get('/history/:session_id', async (req, env: Env) => {
  try {
    const { session_id } = req.params;

    const conversation = await env.DB.prepare(
      'SELECT id, created_at, updated_at, title FROM ai_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(session_id).first() as { id: number; created_at: string; updated_at: string; title: string | null } | null;

    if (!conversation) {
      return json({ success: true, messages: [], conversation: null });
    }

    const messages = await env.DB.prepare(
      'SELECT role, content, model, created_at, version FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(conversation.id).all();

    return json({ success: true, conversation, messages: messages.results });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

export default router;
