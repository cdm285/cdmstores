/**
 * Route: /api/organic
 * ─────────────────────────────────────────────────────────────────────────────
 * Organic Traffic Orchestrator — CDM STORES
 * Autoridade: Avançada (nível estratégico)
 *
 * Agentes especializados (todos powered by Cloudflare Workers AI):
 *   • PlannerAgent   — calendário de 30 dias e temas diários com base em tendências
 *   • ContentAgent   — artigo completo gerado por IA
 *   • SEOAgent       — título, meta-description e palavras-chave otimizadas
 *   • SocialAgent    — posts para Instagram, Pinterest, TikTok e LinkedIn
 *   • AnalyticsAgent — rastreia engajamento salvo no D1
 *
 * Endpoints:
 *   POST /api/organic/cycle        — executa o ciclo diário completo
 *   POST /api/organic/calendar     — (re)gera calendário de 30 dias
 *   GET  /api/organic/calendar     — retorna o calendário atual
 *   GET  /api/organic/logs         — retorna histórico de publicações
 *
 * Security:
 *   • Admin-key guard on POST endpoints (header X-Organic-Key)
 *   • All AI inputs are size-capped and sanitised
 *   • D1 writes use prepared statements (no SQLi)
 */

import type { AgentEnv } from '../core/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────
// Cast to `any` because `@cloudflare/workers-types` AiModels map may lag behind
// available runtime models — same pattern used in routes/ai.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AI_MODEL    = '@cf/meta/llama-3.1-8b-instruct-fast' as any;
const MAX_TOKENS  = 512;
const PAGE_LIMIT  = 50;

const CORS_HEADERS = {
  'Content-Type'                : 'application/json',
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Organic-Key',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface AiTextResponse { response: string }

interface Article {
  title: string;
  body: string;
}

interface SeoData {
  title: string;
  keywords: string[];
  metaDescription: string;
}

interface LogRow {
  id: number;
  topic: string;
  article_title: string;
  seo_title: string;
  seo_keywords: string;
  meta_description: string;
  social_posts: string;
  status: string;
  created_at: string;
}

interface CalendarRow {
  id: number;
  topic: string;
  planned_for: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function sanitize(text: string, maxLen = 500): string {
  // eslint-disable-next-line no-control-regex
  return text.trim().slice(0, maxLen).replace(/[\x00-\x08\x0B-\x1F]/g, '');
}

/** Parse AI text response — graceful degradation if run() returns non-standard shape. */
function extractText(raw: unknown): string {
  if (typeof raw === 'string') {return raw;}
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.response === 'string') {return r.response;}
    if (typeof r.result === 'string') {return r.result;}
  }
  return '';
}

/** Verify the shared secret sent as X-Organic-Key header. */
async function adminGuard(request: Request, env: AgentEnv): Promise<boolean> {
  // If no JWT_SECRET is configured, reject all POST requests in production.
  if (!env.JWT_SECRET) {return false;}
  const key = request.headers.get('X-Organic-Key') ?? '';
  // Constant-time comparison using subtle — avoids timing attacks.
  const keyBytes     = new TextEncoder().encode(key);
  const secretBytes  = new TextEncoder().encode(env.JWT_SECRET);
  if (keyBytes.length !== secretBytes.length) {return false;}
  let diff = 0;
  for (let i = 0; i < keyBytes.length; i++) {diff |= keyBytes[i] ^ secretBytes[i];}
  return diff === 0;
}

// ─── PlannerAgent ─────────────────────────────────────────────────────────────
async function plannerGetTopics(env: AgentEnv): Promise<string[]> {
  const prompt = `Você é um especialista em marketing digital para e-commerce.
Liste 3 temas de artigo relevantes para o CDM STORES em 2026.
Cada tema deve ser uma frase curta (máx 8 palavras), separados por quebra de linha.
Não use números, bullets ou caracteres especiais. Apenas os temas.`;

  const raw = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
  }) as AiTextResponse;

  const text = extractText(raw);
  return text.split('\n').map(t => t.trim()).filter(t => t.length > 3).slice(0, 3);
}

async function plannerGenerateCalendar(env: AgentEnv): Promise<string[]> {
  const prompt = `Crie um calendário de 30 temas de conteúdo para um e-commerce (CDM STORES) para os próximos 30 dias a partir de hoje.
Cada linha: apenas o tema (máx 10 palavras). Sem números, sem bullets. Um tema por linha.`;

  const raw = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 512,
  }) as AiTextResponse;

  const text = extractText(raw);
  return text.split('\n').map(t => t.trim()).filter(t => t.length > 3).slice(0, 30);
}

// ─── ContentAgent ─────────────────────────────────────────────────────────────
async function contentGenerateArticle(topic: string, env: AgentEnv): Promise<Article> {
  const safeTopic = sanitize(topic, 120);
  const prompt = `Escreva um artigo de blog em português sobre o tema: "${safeTopic}".
Formato JSON com as chaves "title" e "body".
- title: título criativo (máx 80 caracteres)
- body: texto do artigo (2–3 parágrafos, máx 400 palavras)
Responda APENAS com JSON válido, sem texto adicional.`;

  const raw = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: MAX_TOKENS,
  }) as AiTextResponse;

  try {
    const text = extractText(raw);
    // Extract JSON from AI response (may include surrounding text)
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { title?: string; body?: string };
      return {
        title: sanitize(parsed.title ?? `Como ${safeTopic} está revolucionando o e-commerce`, 120),
        body:  sanitize(parsed.body  ?? '', 2000),
      };
    }
  } catch { /* fall through to default */ }

  return {
    title: `Como ${safeTopic} está revolucionando o e-commerce`,
    body:  `O mercado de ${safeTopic} cresce exponencialmente. Veja como CDM STORES está liderando essa transformação.`,
  };
}

// ─── SEOAgent ─────────────────────────────────────────────────────────────────
async function seoOptimize(article: Article, env: AgentEnv): Promise<SeoData> {
  const safeTitle = sanitize(article.title, 120);
  const prompt = `Você é um especialista em SEO para e-commerce.
Dado o título de artigo: "${safeTitle}"
Responda APENAS com JSON válido contendo:
- "title": título SEO otimizado (máx 60 caracteres)
- "keywords": array de 5 palavras-chave relevantes
- "metaDescription": meta description (máx 155 caracteres)`;

  const raw = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
  }) as AiTextResponse;

  try {
    const text = extractText(raw);
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as {
        title?: string; keywords?: unknown; metaDescription?: string;
      };
      return {
        title: sanitize(parsed.title ?? safeTitle, 60),
        keywords: Array.isArray(parsed.keywords)
          ? (parsed.keywords as unknown[]).map(k => sanitize(String(k), 40)).slice(0, 5)
          : ['ecommerce', 'CDM STORES', 'compras online', 'tendências 2026', 'dropshipping'],
        metaDescription: sanitize(parsed.metaDescription ?? `Descubra ${safeTitle} — CDM STORES`, 155),
      };
    }
  } catch { /* fall through */ }

  return {
    title: `${safeTitle.slice(0, 57)}...`,
    keywords: ['ecommerce', 'CDM STORES', 'compras online', 'tendências 2026', 'dropshipping'],
    metaDescription: `Descubra ${safeTitle} — conteúdo otimizado para tráfego orgânico. CDM STORES.`,
  };
}

// ─── SocialAgent ──────────────────────────────────────────────────────────────
async function socialCreatePosts(article: Article, seo: SeoData, env: AgentEnv): Promise<string[]> {
  const safeTitle = sanitize(article.title, 120);
  const prompt = `Crie 3 posts de redes sociais em português (Instagram, Pinterest, LinkedIn) sobre: "${safeTitle}".
Inclua emojis relevantes. Cada post em uma linha separada. Máx 240 caracteres por post.
Adicione o link cdmstores.com no último post.`;

  const raw = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
  }) as AiTextResponse;

  const text  = extractText(raw);
  const posts = text.split('\n').map(p => sanitize(p, 280)).filter(p => p.length > 5).slice(0, 3);

  if (posts.length === 0) {
    return [
      `🔥 ${seo.title} — saiba mais em cdmstores.com`,
      `💡 ${seo.metaDescription}`,
    ];
  }
  return posts;
}

// ─── AnalyticsAgent ───────────────────────────────────────────────────────────
async function analyticsTrack(logId: number, env: AgentEnv): Promise<{ views: number; clicks: number; conversions: number }> {
  // Placeholder metrics — in production this would integrate with Cloudflare Analytics / Google Analytics API
  const metrics = { views: 0, clicks: 0, conversions: 0 };
  await env.DB.prepare(
    'INSERT INTO organic_analytics (log_id, views, clicks, conversions) VALUES (?, ?, ?, ?)'
  ).bind(logId, metrics.views, metrics.clicks, metrics.conversions).run();
  return metrics;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleOrganicRequest(request: Request, env: AgentEnv): Promise<Response> {
  const { method, url } = request;
  const { pathname }    = new URL(url);

  // ── OPTIONS preflight ──────────────────────────────────────────────────────
  if (method === 'OPTIONS') {return new Response(null, { status: 204, headers: CORS_HEADERS });}

  // ── GET /api/organic/logs ──────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/organic/logs') {
    const rows = await env.DB.prepare(
      `SELECT id, topic, article_title, seo_title, seo_keywords, meta_description,
              social_posts, status, created_at
       FROM organic_logs
       ORDER BY created_at DESC
       LIMIT ?`
    ).bind(PAGE_LIMIT).all<LogRow>();

    const logs = rows.results.map(r => ({
      id:              r.id,
      topic:           r.topic,
      articleTitle:    r.article_title,
      seoTitle:        r.seo_title,
      keywords:        JSON.parse(r.seo_keywords) as string[],
      metaDescription: r.meta_description,
      socialPosts:     JSON.parse(r.social_posts) as string[],
      status:          r.status,
      date:            r.created_at,
    }));

    return json({ success: true, count: logs.length, logs });
  }

  // ── GET /api/organic/calendar ──────────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/organic/calendar') {
    const rows = await env.DB.prepare(
      `SELECT id, topic, planned_for, status
       FROM organic_calendar
       ORDER BY planned_for ASC
       LIMIT 31`
    ).all<CalendarRow>();

    return json({ success: true, count: rows.results.length, calendar: rows.results });
  }

  // ── Admin-guarded POST endpoints ───────────────────────────────────────────
  if (method === 'POST') {
    const allowed = await adminGuard(request, env);
    if (!allowed) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    // ── POST /api/organic/calendar ─────────────────────────────────────────
    if (pathname === '/api/organic/calendar') {
      const topics = await plannerGenerateCalendar(env);

      // Clear old pending entries and insert fresh calendar
      await env.DB.prepare("DELETE FROM organic_calendar WHERE status = 'pending'").run();

      const today = new Date();
      const batch = topics.map((topic, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        return env.DB.prepare(
          "INSERT INTO organic_calendar (topic, planned_for, status) VALUES (?, ?, 'pending')"
        ).bind(sanitize(topic, 200), dateStr);
      });

      await env.DB.batch(batch);

      return json({ success: true, message: `Calendário gerado com ${topics.length} temas.`, topics });
    }

    // ── POST /api/organic/cycle ────────────────────────────────────────────
    if (pathname === '/api/organic/cycle') {
      const topics = await plannerGetTopics(env);
      const results: Array<{
        topic: string; articleTitle: string; seoTitle: string;
        keywords: string[]; socialPosts: string[]; status: string;
      }> = [];

      for (const topic of topics) {
        try {
          // 1. Generate article
          const article = await contentGenerateArticle(topic, env);

          // 2. SEO optimisation
          const seo = await seoOptimize(article, env);

          // 3. Social posts
          const posts = await socialCreatePosts(article, seo, env);

          // 4. Persist log
          const insertResult = await env.DB.prepare(
            `INSERT INTO organic_logs
               (topic, article_title, article_body, seo_title, seo_keywords,
                meta_description, social_posts, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`
          ).bind(
            sanitize(topic, 200),
            article.title,
            article.body,
            seo.title,
            JSON.stringify(seo.keywords),
            seo.metaDescription,
            JSON.stringify(posts),
          ).run();

          const logId = insertResult.meta.last_row_id as number;

          // 5. Track analytics (baseline zeroes — to be updated by external integrations)
          await analyticsTrack(logId, env);

          // 6. Mark calendar entry as published if it exists for today
          const today = new Date().toISOString().split('T')[0];
          await env.DB.prepare(
            "UPDATE organic_calendar SET status = 'published' WHERE topic = ? AND planned_for = ? AND status = 'pending'"
          ).bind(sanitize(topic, 200), today).run();

          results.push({
            topic,
            articleTitle: article.title,
            seoTitle:     seo.title,
            keywords:     seo.keywords,
            socialPosts:  posts,
            status:       'published',
          });
        } catch (err) {
          results.push({ topic, articleTitle: '', seoTitle: '', keywords: [], socialPosts: [], status: `error: ${String(err)}` });
        }
      }

      return json({
        success: true,
        message : `Ciclo concluído — ${results.filter(r => r.status === 'published').length}/${topics.length} temas publicados.`,
        results,
      });
    }
  }

  return json({ success: false, error: 'Rota não encontrada' }, 404);
}
