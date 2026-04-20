/**
 * CDM STORES — Shared HTTP response utilities
 * Env interface, CORS headers, response helpers, cookie helpers.
 */

import { logger } from './logger.js';

// ─── Env interface ────────────────────────────────────────────────────────────
export interface Env {
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  RATE_LIMIT?: KVNamespace;
  METRICS?: KVNamespace;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  APP_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  // GOOGLE_CLIENT_SECRET removed — Google auth uses idToken/accessToken validation only (no server-side OAuth code exchange)
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Shared secret for POST /api/organic endpoints (X-Organic-Key header). Must differ from JWT_SECRET. */
  ORGANIC_ADMIN_KEY?: string;
  ENVIRONMENT?: string;
}

// ─── Security headers (OWASP ASVS 14.4, PCI-DSS 6.2.4, HSTS RFC 6797) ─────────
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self)',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  // HSTS — force HTTPS, 1 year, all subdomains, preload-eligible (RFC 6797)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  // CSP — API responses must never be rendered as HTML (OWASP A05)
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  // Cross-origin isolation (Spectre mitigation)
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Allow fetch from any origin (REST API), but disallow embedding
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export const ALLOWED_ORIGINS = new Set([
  'https://cdmstores.com',
  'https://www.cdmstores.com',
  'http://localhost',
  'http://localhost:8787',
  'http://localhost:3000',
]);

export function resolveOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://cdmstores.com';
}

export const CORS_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  'Access-Control-Allow-Origin': 'https://cdmstores.com', // overridden dynamically
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Token',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

// ─── Response helpers ─────────────────────────────────────────────────────────
export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = { ...CORS_HEADERS, ...extraHeaders };
  return new Response(JSON.stringify(data), { status, headers });
}

/** Sanitised 500 — never leaks internal error.message to the client (OWASP ASVS 7.4.2). */
export function internalError(error: unknown, context?: string): Response {
  const msg = error instanceof Error ? error.message : String(error);
  logger.error(`[INTERNAL ERROR]${context ? ' ' + context : ''}:`, msg);
  return json({ success: false, error: 'Erro interno do servidor' }, 500);
}

/** JSON response that also sets multiple Set-Cookie headers (OWASP 3.4.2). */
export function jsonWithCookies(data: unknown, status: number, cookies: string[]): Response {
  const headers = new Headers(CORS_HEADERS as HeadersInit);
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

// ─── Cookie helpers (OWASP ASVS 3.4) ─────────────────────────────────────────
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function buildSetCookieHeaders(token: string, refreshToken: string): string[] {
  const secure = '; Secure; SameSite=Strict; HttpOnly; Path=/';
  return [
    `auth_token=${token}; Max-Age=${ACCESS_TOKEN_TTL_SECONDS}${secure}`,
    `refresh_token=${refreshToken}; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}${secure}`,
  ];
}

export function buildClearCookieHeaders(): string[] {
  return [
    'auth_token=; Max-Age=0; Secure; SameSite=Strict; HttpOnly; Path=/',
    'refresh_token=; Max-Age=0; Secure; SameSite=Strict; HttpOnly; Path=/',
  ];
}
