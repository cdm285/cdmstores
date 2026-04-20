// CDM STORES — Cloudflare Worker entry point (dispatcher)
// All business logic lives in src/routes/ and src/lib/

import { CORS_HEADERS, SECURITY_HEADERS, resolveOrigin } from './lib/response.js';
import type { Env } from './lib/response.js';
import { getAggregatedMetrics, getCircuitStates } from './lib/observability.js';

// Route handlers
import { handleRegister, handleLogin, handleMe, handleLogout, handleRefresh, handleForgotPassword, handleResetPassword, handleSendVerificationEmail, handleVerifyEmail, handleChangePassword, handleGoogleAuth, handleFacebookAuth } from './routes/auth.js';
import { handle2FASetup, handle2FAVerifySetup, handle2FADisable, handle2FAVerify } from './routes/twofa.js';
import { handleUpdateProfile, handleGetAddresses, handleCreateAddress, handleUpdateAddress, handleDeleteAddress, handleSetDefaultAddress, handleUserOrders } from './routes/user.js';
import { handleProductList, handleProductGet } from './routes/products.js';
import { handleOrderGet, handleOrderCreate } from './routes/orders.js';
import { handleCartAdd } from './routes/cart.js';
import { handleTracking } from './routes/tracking.js';
import { handleStripeCreatePayment, handleStripeWebhook } from './routes/stripe.js';
import { handleChatRequest } from './routes/chat.js';
import { handleGuardianStatus, handleGuardianReport } from './routes/guardian.js';
import { handleOrganicRequest } from './routes/organic.js';
import { handleWorkersAI } from './routes/workersai.js';
import { handleSchedule } from './routes/schedule.js';
import { json } from './lib/response.js';

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url  = new URL(request.url);
  const path = url.pathname;
  const m    = request.method;

  // ── PREFLIGHT ────────────────────────────────────────────────────────────
  if (m === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── HEALTH CHECK ─────────────────────────────────────────────────────────
  if (path === '/health' || path === '/') {
    // Probe D1 liveness
    let d1Ok = false;
    try { await env.DB.prepare('SELECT 1').first(); d1Ok = true; } catch { /* d1 down */ }

    // Gather last-hour metrics + circuit breaker states (never throw)
    const [metrics, circuits] = await Promise.all([
      getAggregatedMetrics(env.METRICS, 1).catch(() => null),
      Promise.resolve(getCircuitStates()),
    ]);

    const healthy = d1Ok;
    return json({
      status       : healthy ? 'ok' : 'degraded',
      service      : 'CDM Stores API',
      version      : '2.1.0',
      timestamp    : new Date().toISOString(),
      bindings     : { d1: d1Ok, ai: typeof env.AI?.run === 'function', vectorize: typeof env.VECTORIZE?.query === 'function', kv_rate_limit: !!env.RATE_LIMIT, kv_metrics: !!env.METRICS },
      metrics      : metrics ?? {},
      circuits,
    }, healthy ? 200 : 503);
  }

  // ── AUTH ─────────────────────────────────────────────────────────────────
  if (path === '/api/auth/register'                && m === 'POST') return handleRegister(request, env);
  if (path === '/api/auth/login'                   && m === 'POST') return handleLogin(request, env);
  if (path === '/api/auth/me'                      && m === 'GET')  return handleMe(request, env);
  if (path === '/api/auth/logout'                  && m === 'POST') return handleLogout(request, env);
  if (path === '/api/auth/refresh'                 && m === 'POST') return handleRefresh(request, env);
  if (path === '/api/auth/forgot-password'         && m === 'POST') return handleForgotPassword(request, env);
  if (path === '/api/auth/reset-password'          && m === 'POST') return handleResetPassword(request, env);
  if (path === '/api/auth/send-verification-email' && m === 'POST') return handleSendVerificationEmail(request, env);
  if (path === '/api/auth/verify-email'            && m === 'POST') return handleVerifyEmail(request, env);
  if (path === '/api/auth/change-password'         && m === 'POST') return handleChangePassword(request, env);
  if (path === '/api/auth/google'                  && m === 'POST') return handleGoogleAuth(request, env);
  if (path === '/api/auth/facebook'                && m === 'POST') return handleFacebookAuth(request, env);

  // ── 2FA ──────────────────────────────────────────────────────────────────
  if (path === '/api/auth/2fa/setup'         && m === 'POST') return handle2FASetup(request, env);
  if (path === '/api/auth/2fa/verify-setup'  && m === 'POST') return handle2FAVerifySetup(request, env);
  if (path === '/api/auth/2fa/disable'       && m === 'POST') return handle2FADisable(request, env);
  if (path === '/api/auth/2fa/verify'        && m === 'POST') return handle2FAVerify(request, env);

  // ── USER / ADDRESSES ─────────────────────────────────────────────────────
  if (path === '/api/user/profile'    && m === 'PUT') return handleUpdateProfile(request, env);
  if (path === '/api/addresses'       && m === 'GET') return handleGetAddresses(request, env);
  if (path === '/api/addresses'       && m === 'POST') return handleCreateAddress(request, env);
  if (path === '/api/orders/user'     && m === 'GET') return handleUserOrders(request, env);

  const addressMatch = path.match(/^\/api\/addresses\/(\d+)(\/default)?$/);
  if (addressMatch) {
    const id       = addressMatch[1];
    const isDefault = Boolean(addressMatch[2]);
    if (m === 'PUT'    && !isDefault) return handleUpdateAddress(request, env, id);
    if (m === 'DELETE' && !isDefault) return handleDeleteAddress(request, env, id);
    if (m === 'POST'   &&  isDefault) return handleSetDefaultAddress(request, env, id);
  }

  // ── PRODUCTS ─────────────────────────────────────────────────────────────
  if (path === '/api/products' && m === 'GET') return handleProductList(request, env);
  const productMatch = path.match(/^\/api\/products\/(\d+)$/);
  if (productMatch && m === 'GET') return handleProductGet(request, env, productMatch[1]);

  // ── ORDERS ───────────────────────────────────────────────────────────────
  if (path === '/api/orders' && m === 'POST') return handleOrderCreate(request, env);
  const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch && m === 'GET') return handleOrderGet(request, env, orderMatch[1]);

  // ── CART ─────────────────────────────────────────────────────────────────
  if (path === '/api/cart/add' && m === 'POST') return handleCartAdd(request, env);

  // ── TRACKING ─────────────────────────────────────────────────────────────
  const trackingMatch = path.match(/^\/api\/tracking\/([^/]+)$/);
  if (trackingMatch && m === 'GET') return handleTracking(request, env, trackingMatch[1]);

  // ── STRIPE ───────────────────────────────────────────────────────────────
  if (path === '/api/stripe/create-payment' && m === 'POST') return handleStripeCreatePayment(request, env);
  if (path === '/api/stripe/webhook') {
    if (m === 'POST') return handleStripeWebhook(request, env);
    if (m === 'GET' || m === 'HEAD') return new Response('', { status: 200 });
  }

  // ── CHAT ─────────────────────────────────────────────────────────────────
  if (path === '/api/chat' && m === 'POST') return handleChatRequest(request, env);

  // ── GUARDIAN ─────────────────────────────────────────────────────────────
  if (path === '/api/guardian/status' && m === 'GET') return handleGuardianStatus(request, env);
  if (path === '/api/guardian/report' && m === 'GET') return handleGuardianReport(request, env);

  // ── ORGANIC TRAFFIC ──────────────────────────────────────────────────────
  if (path.startsWith('/api/organic')) {
    return handleOrganicRequest(request, env as unknown as import('./core/types.js').AgentEnv);
  }

  // ── WORKERS AI ───────────────────────────────────────────────────────────
  if (path.startsWith('/api/ai/')) return handleWorkersAI(request, env, path);

  // ── SCHEDULE ─────────────────────────────────────────────────────────────
  if (path === '/api/schedule' && m === 'POST') return handleSchedule(request, env);

  return json({ error: 'Not found', path }, 404);
}

async function fetchWithCors(request: Request, env: Env): Promise<Response> {
  const origin   = resolveOrigin(request);
  const response = await handleRequest(request, env);
  const headers  = new Headers(response.headers);

  // Enforce security headers on ALL responses — single enforcement point
  // regardless of which route handler produced the response (OWASP ASVS 14.4)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  // X-Request-ID: if the route already set one (e.g. /api/chat), preserve it;
  // otherwise generate a new UUID for every response — enables incident tracing
  if (!headers.has('X-Request-ID')) {
    headers.set('X-Request-ID', crypto.randomUUID());
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  fetch: (request: Request, env: Env) => fetchWithCors(request, env),
  scheduled: async (_controller: ScheduledController, env: Env) => {
    // ── GUARDIÃO AUTONOMY: self-healing cron ──────────────────────────────
    // Runs on every cron trigger (wrangler.toml: crons = ["0 * * * *"])
    // 1. DB cleanup   — expire stale sessions, resets, rate limits
    // 2. Self-probe   — hit /health to keep the Worker warm + log result
    // 3. Metrics trim — no-op (KV TTL handles this automatically)

    const ts = Date.now();
    let dbOk = false;

    // 1. Cleanup expired records
    try {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
        env.DB.prepare("DELETE FROM password_resets WHERE expires_at < datetime('now')"),
        env.DB.prepare("DELETE FROM rate_limit_attempts WHERE created_at < datetime('now', '-1 day')"),
        env.DB.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-7 days')"),
        env.DB.prepare("DELETE FROM two_factor_attempts WHERE created_at < datetime('now', '-1 day')"),
      ]);
      dbOk = true;
      console.log('[GUARDIÃO:cron] DB cleanup OK');
    } catch (err) {
      console.error('[GUARDIÃO:cron] DB cleanup FAILED:', err instanceof Error ? err.message : err);
    }

    // 2. Liveness self-probe — record as synthetic metric
    try {
      const probe = await env.DB.prepare('SELECT 1').first();
      const latencyMs = Date.now() - ts;
      if (env.METRICS) {
        // Import inline to avoid circular — write directly
        const hour = Math.floor(Date.now() / 3_600_000);
        const key  = `metrics:hour:${hour}`;
        const raw  = await env.METRICS.get(key);
        const bucket = raw ? JSON.parse(raw) : [];
        bucket.push({ ts, path: '/__cron__', method: 'CRON', status: probe ? 200 : 503, latencyMs, requestId: crypto.randomUUID() });
        await env.METRICS.put(key, JSON.stringify(bucket.slice(-500)), { expirationTtl: 93_600 });
      }
      console.log(`[GUARDIÃO:cron] self-probe OK — db:${dbOk} latency:${Date.now() - ts}ms`);
    } catch (err) {
      console.error('[GUARDIÃO:cron] self-probe FAILED:', err instanceof Error ? err.message : err);
    }
  },
} satisfies ExportedHandler<Env>;
