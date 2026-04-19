// CDM STORES — Cloudflare Worker entry point (dispatcher)
// All business logic lives in src/routes/ and src/lib/

import { CORS_HEADERS, resolveOrigin } from './lib/response.js';
import type { Env } from './lib/response.js';

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
    return json({ status: 'ok', service: 'CDM Stores API', version: '2.0.0', timestamp: new Date().toISOString() });
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
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  fetch: (request: Request, env: Env) => fetchWithCors(request, env),
  scheduled: async (_controller: ScheduledController, env: Env) => {
    // Cron job: cleanup expired DB records
    try {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
        env.DB.prepare("DELETE FROM password_resets WHERE expires_at < datetime('now')"),
        env.DB.prepare("DELETE FROM rate_limit_attempts WHERE created_at < datetime('now', '-1 day')"),
        env.DB.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-7 days')"),
        env.DB.prepare("DELETE FROM two_factor_attempts WHERE created_at < datetime('now', '-1 day')"),
      ]);
    } catch (err) {
      console.error('[Scheduled] Cleanup error:', err instanceof Error ? err.message : err);
    }
  },
} satisfies ExportedHandler<Env>;
