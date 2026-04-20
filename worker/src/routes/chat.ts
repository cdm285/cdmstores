/**
 * Route: /api/chat  (new modular handler)
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean extraction of the chat endpoint from index.ts.
 * Uses the new MainOrchestrator (agents/00-orchestrator.ts) and the
 * ExtendedAgentContext infrastructure (core/agent-context.ts).
 *
 * Security:
 *   • Rate-limit: 20 req/min per IP, 10 req/min per session (AI cost protection)
 *   • Input validated and trimmed before passing to orchestrator
 *   • debug flag restricted to development environment only
 *   • X-Request-ID on every response for incident traceability
 *   • CORS headers returned on every response (preflight handled in index.ts)
 *
 * Usage in index.ts:
 *   import { handleChatRequest } from './routes/chat.js';
 *   if (path === '/api/chat') return handleChatRequest(request, env);
 */

import { mainOrchestrator }   from '../agents/00-orchestrator.js';
import type { AgentEnv }      from '../core/types.js';
import { checkRateLimit }     from '../lib/security.js';
import type { Env }           from '../lib/response.js';
import { kvRateLimit, withCircuitBreaker, recordMetric } from '../lib/observability.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MSG_LENGTH = 2_000; // characters

const CORS_HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Rate limits — AI inference is expensive; protect against cost exploitation
const RATE_LIMIT_IP_MAX        = 20;  // requests
const RATE_LIMIT_IP_WINDOW     = 60;  // seconds
const RATE_LIMIT_SESSION_MAX   = 10;  // requests
const RATE_LIMIT_SESSION_WINDOW = 60; // seconds

// ─── Typed request body ───────────────────────────────────────────────────────
interface ChatRequestBody {
  message   ?: string;
  session_id?: string;
  language  ?: 'pt' | 'en' | 'es';
  user_id   ?: string;
  debug     ?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(requestId ? { 'X-Request-ID': requestId } : {}),
    },
  });
}

function errorResponse(message: string, status = 400, requestId?: string): Response {
  return jsonResponse({ success: false, response: message, error: message }, status, requestId);
}

function sanitize(text: string): string {
  return text
    .trim()
    .slice(0, MAX_MSG_LENGTH)        // length cap
    .replace(/[\x00-\x08\x0B-\x1F]/g, '');  // strip control chars except \t, \n
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleChatRequest(request: Request, env: AgentEnv): Promise<Response> {
  // Correlation ID — every response carries it for incident traceability
  const requestId = crypto.randomUUID();

  // Parse body
  let body: ChatRequestBody;
  try {
    body = await request.json() as ChatRequestBody;
  } catch {
    return errorResponse('Invalid JSON body', 400, requestId);
  }

  // Validate required fields
  const rawMessage = typeof body.message === 'string' ? body.message : '';
  if (!rawMessage.trim()) {
    return errorResponse('O campo "message" é obrigatório', 400, requestId);
  }

  const message   = sanitize(rawMessage);
  const sessionId = typeof body.session_id === 'string' && body.session_id.trim()
    ? body.session_id.trim().slice(0, 128)
    : `anon-${Date.now()}`;

  // ── Rate limiting: KV-first (fast), fallback to D1 ───────────────────────
  // AI inference is expensive — protect against cost exploitation and DoS
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const kvNs = (env as unknown as Env).RATE_LIMIT;
  const [ipRL, sessRL] = await Promise.all([
    kvNs
      ? kvRateLimit(kvNs, `chat:ip:${ip}`,          RATE_LIMIT_IP_MAX,      RATE_LIMIT_IP_WINDOW)
      : checkRateLimit(env as unknown as Env, `chat:ip:${ip}`,          RATE_LIMIT_IP_MAX,      RATE_LIMIT_IP_WINDOW),
    kvNs
      ? kvRateLimit(kvNs, `chat:sess:${sessionId}`, RATE_LIMIT_SESSION_MAX, RATE_LIMIT_SESSION_WINDOW)
      : checkRateLimit(env as unknown as Env, `chat:sess:${sessionId}`, RATE_LIMIT_SESSION_MAX, RATE_LIMIT_SESSION_WINDOW),
  ]);
  if (!ipRL.allowed || !sessRL.allowed) {
    void recordMetric((env as unknown as Env).METRICS, { ts: Date.now(), path: '/api/chat', method: 'POST', status: 429, latencyMs: 0, requestId, sessionId, ip });
    return jsonResponse(
      { success: false, response: 'Muitas requisições. Aguarde um momento e tente novamente.', error: 'rate_limited' },
      429,
      requestId,
    );
  }

  const language = (['pt', 'en', 'es'] as const).includes(body.language as 'pt')
    ? (body.language as 'pt' | 'en' | 'es')
    : 'pt';

  // debug only available in development — prevents info disclosure in production
  const isDev   = (env as unknown as { ENVIRONMENT?: string }).ENVIRONMENT === 'development';
  const isDebug = body.debug === true && isDev;

  // Build orchestrator input
  const input = {
    message,
    sessionId,
    language,
    userId   : typeof body.user_id === 'string' ? body.user_id : undefined,
    flags    : {
      debug         : isDebug,
      longMemory    : true,
      shortMemory   : true,
      semanticMemory: true,
    },
  };

  try {
    const reqStart = Date.now();

    // Circuit breaker wraps the full orchestrator pipeline
    // Protects against cascading AI failures; falls back to a static response
    const FALLBACK_RESPONSE = { success: false, response: 'Serviço temporáriamente indisponível. Tente novamente em instantes.', action: null, data: null, coupon_valid: null, discount: null, product_id: null, product_name: null, product_price: null, link: null };
    const { result: output, circuitState, error: cbError } = await withCircuitBreaker(
      'orchestrator:main',
      () => mainOrchestrator.process(input, env),
      { timeoutMs: 25_000, failureThreshold: 3, openDurationMs: 30_000 },
      FALLBACK_RESPONSE,
    );

    const latencyMs = Date.now() - reqStart;
    const status    = output?.success === false && cbError ? 503 : 200;

    // Fire-and-forget metrics — never awaited to keep response latency minimal
    void recordMetric((env as unknown as Env).METRICS, {
      ts        : Date.now(),
      path      : '/api/chat',
      method    : 'POST',
      status,
      latencyMs,
      requestId,
      sessionId,
      ip,
      error     : cbError,
    });

    if (circuitState === 'OPEN' || !output) {
      return jsonResponse(FALLBACK_RESPONSE, 503, requestId);
    }

    return jsonResponse(output, status, requestId);
  } catch (err) {
    console.error('[routes/chat] Unhandled error:', err);
    return errorResponse('Erro interno do servidor', 500, requestId);
  }
}
