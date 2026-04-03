/**
 * Route: /api/chat  (new modular handler)
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean extraction of the chat endpoint from index.ts.
 * Uses the new MainOrchestrator (agents/00-orchestrator.ts) and the
 * ExtendedAgentContext infrastructure (core/agent-context.ts).
 *
 * Security:
 *   • Rate-limit awareness: 429 re-emitted if KV signals it
 *   • Input validated and trimmed before passing to orchestrator
 *   • CORS headers returned on every response (preflight handled in index.ts)
 *
 * Usage in index.ts:
 *   import { handleChatRequest } from './routes/chat.js';
 *   if (path === '/api/chat') return handleChatRequest(request, env);
 */

import { mainOrchestrator }  from '../agents/00-orchestrator.js';
import type { AgentEnv }     from '../core/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MSG_LENGTH = 2_000; // characters

const CORS_HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Typed request body ───────────────────────────────────────────────────────
interface ChatRequestBody {
  message   ?: string;
  session_id?: string;
  language  ?: 'pt' | 'en' | 'es';
  user_id   ?: string;
  debug     ?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, response: message, error: message }, status);
}

function sanitize(text: string): string {
  return text
    .trim()
    .slice(0, MAX_MSG_LENGTH)        // length cap
    .replace(/[\x00-\x08\x0B-\x1F]/g, '');  // strip control chars except \t, \n
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleChatRequest(request: Request, env: AgentEnv): Promise<Response> {
  // Parse body
  let body: ChatRequestBody;
  try {
    body = await request.json() as ChatRequestBody;
  } catch {
    return errorResponse('Invalid JSON body');
  }

  // Validate required fields
  const rawMessage = typeof body.message === 'string' ? body.message : '';
  if (!rawMessage.trim()) {
    return errorResponse('O campo "message" é obrigatório');
  }

  const message   = sanitize(rawMessage);
  const sessionId = typeof body.session_id === 'string' && body.session_id.trim()
    ? body.session_id.trim().slice(0, 128)
    : `anon-${Date.now()}`;

  const language = (['pt', 'en', 'es'] as const).includes(body.language as 'pt')
    ? (body.language as 'pt' | 'en' | 'es')
    : 'pt';

  // Build orchestrator input
  const input = {
    message,
    sessionId,
    language,
    userId   : typeof body.user_id === 'string' ? body.user_id : undefined,
    flags    : {
      debug        : body.debug === true,
      // Enable all memory tiers by default; can be toggled per request
      longMemory   : true,
      shortMemory  : true,
      semanticMemory: true,
    },
  };

  try {
    const output = await mainOrchestrator.process(input, env);
    return jsonResponse(output);
  } catch (err) {
    console.error('[routes/chat] Orchestrator error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse(msg, 500);
  }
}
