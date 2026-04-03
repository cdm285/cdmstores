import { Router } from 'itty-router';
import { json } from 'itty-router';

const router = Router({ base: '/api/ai' });

// ─── Catálogo completo de modelos Cloudflare Workers AI ──────────────────────
const MODELS = {
  // ── Text Generation ───────────────────────────────────────────────────────
  // Modelos principais (recomendados)
  chat:                  '@cf/meta/llama-3-8b-instruct',
  chat_fast:             '@cf/meta/llama-3.1-8b-instruct-fast',
  chat_fp8:              '@cf/meta/llama-3.1-8b-instruct-fp8',
  chat_awq:              '@cf/meta/llama-3.1-8b-instruct-awq',
  chat_large:            '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  chat_70b:              '@cf/meta/llama-3.1-70b-instruct',
  // Llama 4
  llama4_scout:          '@cf/meta/llama-4-scout-17b-16e-instruct',   // Vision + Function calling
  // Llama 3.2
  llama32_vision:        '@cf/meta/llama-3.2-11b-vision-instruct',    // Vision
  llama32_3b:            '@cf/meta/llama-3.2-3b-instruct',
  llama32_1b:            '@cf/meta/llama-3.2-1b-instruct',
  // Raciocínio avançado
  deepseek_r1:           '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  qwq_32b:               '@cf/qwen/qwq-32b',
  // Modelos de alta capacidade (Partner/externo)
  kimi_k2_5:             '@cf/moonshotai/kimi-k2.5',                  // 256K ctx, Vision, Batch
  nemotron:              '@cf/nvidia/nemotron-3-120b-a12b',            // 256K ctx
  glm_flash:             '@cf/zai-org/glm-4.7-flash',                 // 131K ctx
  gpt_oss_120b:          '@cf/openai/gpt-oss-120b',
  gpt_oss_20b:           '@cf/openai/gpt-oss-20b',
  // Modelos especializados
  granite_micro:         '@cf/ibm-granite/granite-4.0-h-micro',       // Function calling
  gemma3_12b:            '@cf/google/gemma-3-12b-it',
  gemma4_26b:            '@cf/google/gemma-4-26b-a4b-it' as string,   // Mais recente Google
  gemma_sea_lion:        '@cf/aisingapore/gemma-sea-lion-v4-27b-it',  // Sudeste Asiático
  mistral_small:         '@cf/mistralai/mistral-small-3.1-24b-instruct',
  qwen3_30b:             '@cf/qwen/qwen3-30b-a3b-fp8',
  qwen_coder:            '@cf/qwen/qwen2.5-coder-32b-instruct',
  llama_guard:           '@cf/meta/llama-guard-3-8b',                 // Segurança de conteúdo
  // Legacy
  mistral_7b:            '@cf/mistral/mistral-7b-instruct-v0.1',
  llama2_7b:             '@cf/meta/llama-2-7b-chat-fp16',

  // ── Text Embeddings ───────────────────────────────────────────────────────
  embedding:             '@cf/baai/bge-m3',                           // Principal (multilíngue)
  embedding_large:       '@cf/baai/bge-large-en-v1.5',
  embedding_base:        '@cf/baai/bge-base-en-v1.5',
  embedding_small:       '@cf/baai/bge-small-en-v1.5',
  embedding_gemma:       '@cf/google/embeddinggemma-300m',
  embedding_qwen3:       '@cf/qwen/qwen3-embedding-0.6b',
  embedding_plamo:       '@cf/pfnet/plamo-embedding-1b',              // Japonês
  reranker:              '@cf/baai/bge-reranker-base',

  // ── Text Classification ───────────────────────────────────────────────────
  classification:        '@cf/huggingface/distilbert-sst-2-int8',

  // ── Text-to-Image ─────────────────────────────────────────────────────────
  image_gen:             '@cf/black-forest-labs/flux-1-schnell',      // Rápido (padrão)
  image_flux2_4b:        '@cf/black-forest-labs/flux-2-klein-4b',     // Partner - Ultra-rápido
  image_flux2_9b:        '@cf/black-forest-labs/flux-2-klein-9b',     // Partner - Alta qualidade
  image_flux2_dev:       '@cf/black-forest-labs/flux-2-dev',          // Partner - Multi-referência
  image_sdxl:            '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  image_sdxl_lightning:  '@cf/bytedance/stable-diffusion-xl-lightning',
  image_dreamshaper:     '@cf/lykon/dreamshaper-8-lcm',
  image_phoenix:         '@cf/leonardo/phoenix-1.0',                  // Partner
  image_lucid:           '@cf/leonardo/lucid-origin',                 // Partner

  // ── Text-to-Speech ────────────────────────────────────────────────────────
  tts_en:                '@cf/deepgram/aura-2-en',                    // Partner, Real-time
  tts_es:                '@cf/deepgram/aura-2-es',                    // Partner, Real-time (PT similaridade alta)
  tts_aura1:             '@cf/deepgram/aura-1',                       // Partner
  tts_melo:              '@cf/myshell-ai/melotts',                    // Multi-língua

  // ── Automatic Speech Recognition ──────────────────────────────────────────
  speech_to_text:        '@cf/openai/whisper',                        // Principal
  speech_to_text_turbo:  '@cf/openai/whisper-large-v3-turbo',        // Mais rápido
  speech_nova3:          '@cf/deepgram/nova-3',                       // Partner, Real-time
  speech_deepgram_flux:  '@cf/deepgram/flux',                         // Partner, Real-time (agentes de voz)

  // ── Image-to-Text ─────────────────────────────────────────────────────────
  image_to_text:         '@cf/llava-hf/llava-1.5-7b-hf',

  // ── Object Detection ──────────────────────────────────────────────────────
  object_detection:      '@cf/facebook/detr-resnet-50',

  // ── Image Classification ──────────────────────────────────────────────────
  image_class:           '@cf/microsoft/resnet-50',

  // ── Summarization ─────────────────────────────────────────────────────────
  summarization:         '@cf/facebook/bart-large-cnn',

  // ── Translation ───────────────────────────────────────────────────────────
  translation:           '@cf/meta/m2m100-1.2b',                      // 100+ idiomas
  translation_indic:     '@cf/ai4bharat/indictrans2-en-indic-1B',     // Inglês → 22 idiomas Índicos

  // ── Voice Activity Detection ──────────────────────────────────────────────
  vad:                   '@cf/pipecat-ai/smart-turn-v2',
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

// ─── GET /api/ai/models ───────────────────────────────────────────────────────
// Lista todos os modelos disponíveis organizados por categoria
router.get('/models', () => {
  return json({
    success: true,
    total: 90,
    categories: {
      text_generation: {
        recommended: [
          { key: 'chat',          id: MODELS.chat,           desc: 'Llama 3 8B - padrão' },
          { key: 'chat_fast',     id: MODELS.chat_fast,      desc: 'Llama 3.1 8B Fast' },
          { key: 'chat_fp8',     id: MODELS.chat_fp8,       desc: 'Llama 3.1 8B FP8' },
          { key: 'chat_large',    id: MODELS.chat_large,     desc: 'Llama 3.3 70B FP8 - grande' },
          { key: 'chat_70b',      id: MODELS.chat_70b,       desc: 'Llama 3.1 70B' },
          { key: 'llama4_scout',  id: MODELS.llama4_scout,   desc: 'Llama 4 Scout 17B - Vision + Function calling' },
          { key: 'llama32_vision',id: MODELS.llama32_vision, desc: 'Llama 3.2 11B Vision' },
          { key: 'llama32_3b',    id: MODELS.llama32_3b,     desc: 'Llama 3.2 3B' },
          { key: 'llama32_1b',    id: MODELS.llama32_1b,     desc: 'Llama 3.2 1B - compacto' },
        ],
        reasoning: [
          { key: 'deepseek_r1',  id: MODELS.deepseek_r1,    desc: 'DeepSeek R1 32B - raciocínio' },
          { key: 'qwq_32b',      id: MODELS.qwq_32b,        desc: 'QwQ 32B - raciocínio' },
          { key: 'kimi_k2_5',    id: MODELS.kimi_k2_5,      desc: 'Kimi K2.5 - 256K ctx, Vision (Partner)' },
          { key: 'nemotron',     id: MODELS.nemotron,        desc: 'Nemotron 3 120B - 256K ctx' },
          { key: 'gpt_oss_120b', id: MODELS.gpt_oss_120b,   desc: 'OpenAI GPT OSS 120B' },
          { key: 'gpt_oss_20b',  id: MODELS.gpt_oss_20b,    desc: 'OpenAI GPT OSS 20B' },
        ],
        specialized: [
          { key: 'glm_flash',    id: MODELS.glm_flash,      desc: 'GLM 4.7 Flash - 131K ctx, multilíngue' },
          { key: 'granite_micro',id: MODELS.granite_micro,   desc: 'IBM Granite 4.0 Micro - Function calling' },
          { key: 'gemma3_12b',   id: MODELS.gemma3_12b,     desc: 'Gemma 3 12B' },
          { key: 'gemma4_26b',   id: MODELS.gemma4_26b,     desc: 'Gemma 4 26B - mais recente Google' },
          { key: 'gemma_sea_lion',id: MODELS.gemma_sea_lion, desc: 'SEA-LION - Sudeste Asiático' },
          { key: 'mistral_small',id: MODELS.mistral_small,   desc: 'Mistral Small 3.1 24B - Vision, 128K ctx' },
          { key: 'qwen3_30b',    id: MODELS.qwen3_30b,      desc: 'Qwen3 30B MoE - Function calling' },
          { key: 'qwen_coder',   id: MODELS.qwen_coder,     desc: 'Qwen 2.5 Coder 32B' },
          { key: 'llama_guard',  id: MODELS.llama_guard,    desc: 'Llama Guard 3 8B - segurança de conteúdo' },
        ],
      },
      text_to_image: [
        { key: 'image_gen',           id: MODELS.image_gen,           desc: 'FLUX.1 Schnell - padrão' },
        { key: 'image_flux2_4b',      id: MODELS.image_flux2_4b,      desc: 'FLUX.2 Klein 4B - ultra-rápido (Partner)' },
        { key: 'image_flux2_9b',      id: MODELS.image_flux2_9b,      desc: 'FLUX.2 Klein 9B - alta qualidade (Partner)' },
        { key: 'image_flux2_dev',     id: MODELS.image_flux2_dev,     desc: 'FLUX.2 Dev - multi-referência (Partner)' },
        { key: 'image_sdxl',          id: MODELS.image_sdxl,          desc: 'Stable Diffusion XL Base 1.0' },
        { key: 'image_sdxl_lightning',id: MODELS.image_sdxl_lightning,desc: 'SDXL Lightning - rápido' },
        { key: 'image_dreamshaper',   id: MODELS.image_dreamshaper,   desc: 'Dreamshaper 8 LCM - fotorrealismo' },
        { key: 'image_phoenix',       id: MODELS.image_phoenix,       desc: 'Leonardo Phoenix 1.0 (Partner)' },
        { key: 'image_lucid',         id: MODELS.image_lucid,         desc: 'Leonardo Lucid Origin (Partner)' },
      ],
      text_to_speech: [
        { key: 'tts_en',    id: MODELS.tts_en,    desc: 'Deepgram Aura-2 EN - inglês (Partner)' },
        { key: 'tts_es',    id: MODELS.tts_es,    desc: 'Deepgram Aura-2 ES - espanhol/português (Partner)' },
        { key: 'tts_aura1', id: MODELS.tts_aura1, desc: 'Deepgram Aura-1 (Partner)' },
        { key: 'tts_melo',  id: MODELS.tts_melo,  desc: 'MeloTTS - multi-língua' },
      ],
      speech_recognition: [
        { key: 'speech_to_text',      id: MODELS.speech_to_text,      desc: 'OpenAI Whisper - padrão' },
        { key: 'speech_to_text_turbo',id: MODELS.speech_to_text_turbo,desc: 'Whisper Large v3 Turbo - rápido' },
        { key: 'speech_nova3',        id: MODELS.speech_nova3,        desc: 'Deepgram Nova-3 (Partner, Real-time)' },
        { key: 'speech_deepgram_flux',id: MODELS.speech_deepgram_flux,desc: 'Deepgram Flux - agentes de voz (Partner)' },
      ],
      embeddings: [
        { key: 'embedding',       id: MODELS.embedding,       desc: 'BGE-M3 - multilíngue (padrão)' },
        { key: 'embedding_large', id: MODELS.embedding_large, desc: 'BGE Large EN v1.5' },
        { key: 'embedding_base',  id: MODELS.embedding_base,  desc: 'BGE Base EN v1.5' },
        { key: 'embedding_small', id: MODELS.embedding_small, desc: 'BGE Small EN v1.5' },
        { key: 'embedding_gemma', id: MODELS.embedding_gemma, desc: 'EmbeddingGemma 300M - 100+ idiomas' },
        { key: 'embedding_qwen3', id: MODELS.embedding_qwen3, desc: 'Qwen3 Embedding 0.6B' },
        { key: 'embedding_plamo', id: MODELS.embedding_plamo, desc: 'PLaMo Embedding 1B - japonês' },
        { key: 'reranker',        id: MODELS.reranker,        desc: 'BGE Reranker Base' },
      ],
      other: [
        { key: 'classification',    id: MODELS.classification,    desc: 'DistilBERT SST-2 - classificação de sentimento' },
        { key: 'image_to_text',     id: MODELS.image_to_text,     desc: 'LLaVA 1.5 7B - imagem para texto' },
        { key: 'object_detection',  id: MODELS.object_detection,  desc: 'DETR ResNet-50 - detecção de objetos' },
        { key: 'image_class',       id: MODELS.image_class,       desc: 'ResNet-50 - classificação de imagem' },
        { key: 'summarization',     id: MODELS.summarization,     desc: 'BART Large CNN - resumo de texto' },
        { key: 'translation',       id: MODELS.translation,       desc: 'M2M100 1.2B - tradução 100+ idiomas' },
        { key: 'translation_indic', id: MODELS.translation_indic, desc: 'IndicTrans2 - EN para 22 idiomas indicos' },
        { key: 'vad',               id: MODELS.vad,               desc: 'SmartTurn v2 - detecção de atividade de voz' },
      ],
    },
  });
});

// ─── POST /api/ai/tts ─────────────────────────────────────────────────────────
// Text-to-Speech
router.post('/tts', async (req, env: Env) => {
  try {
    const { text, model_key = 'tts_en' } = await req.json() as {
      text: string;
      model_key?: keyof typeof MODELS;
    };

    if (!text) {
      return json({ success: false, error: 'text obrigatório' }, { status: 400 });
    }

    const modelId = MODELS[model_key] ?? MODELS.tts_en;
    const result = await env.AI.run(modelId as '@cf/deepgram/aura-2-en', { text }) as string;

    return new Response(result, {
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// ─── POST /api/ai/translate ───────────────────────────────────────────────────
// Tradução de texto (M2M100 suporta 100+ idiomas)
router.post('/translate', async (req, env: Env) => {
  try {
    const { text, source_lang = 'portuguese', target_lang = 'english' } = await req.json() as {
      text: string;
      source_lang?: string;
      target_lang?: string;
    };

    if (!text) {
      return json({ success: false, error: 'text obrigatório' }, { status: 400 });
    }

    const result = await env.AI.run(MODELS.translation, {
      text,
      source_lang,
      target_lang,
    }) as { translated_text: string };

    return json({ success: true, translated_text: result.translated_text, source_lang, target_lang });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

export default router;
