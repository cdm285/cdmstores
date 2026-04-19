/**
 * CDM STORES — Security utilities
 * Rate limiting, account lockout, audit log, Stripe webhook verification,
 * Cloudflare Turnstile bot protection, input validation helpers.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { Env } from './response.js';

// ─── Validation helpers ───────────────────────────────────────────────────────
/** RFC 5321 compliant — rejects local-only addresses */
export const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** Returns an error string on failure, null on success. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8)   return 'Senha deve ter no mínimo 8 caracteres';
  if (password.length > 128) return 'Senha muito longa (máx. 128 caracteres)';
  if (!/[0-9!@#$%^&*()\-_=+[\]{}|;:,.<>?]/.test(password)) {
    return 'Senha deve conter pelo menos um número ou caractere especial';
  }
  return null;
}

// ─── Rate limiting (D1-backed sliding window) ─────────────────────────────────
export async function checkRateLimit(
  env          : Env,
  key          : string,
  maxRequests  : number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM rate_limit_attempts WHERE key = ? AND created_at > ?'
    ).bind(key, windowStart).first<{ count: number }>();

    const count = result?.count ?? 0;
    if (count >= maxRequests) return { allowed: false, remaining: 0 };

    await env.DB.prepare(
      'INSERT INTO rate_limit_attempts (key, created_at) VALUES (?, datetime("now"))'
    ).bind(key).run();

    return { allowed: true, remaining: maxRequests - count - 1 };
  } catch {
    return { allowed: true, remaining: maxRequests };
  }
}

// ─── Account lockout (NIST SP 800-63B) ───────────────────────────────────────
export async function isAccountLocked(env: Env, email: string): Promise<boolean> {
  try {
    const lockout = await env.DB.prepare(
      "SELECT locked_until FROM account_lockouts WHERE email = ? AND locked_until > datetime('now') LIMIT 1"
    ).bind(email.toLowerCase()).first<{ locked_until: string }>();
    return !!lockout;
  } catch {
    return false;
  }
}

export async function recordLoginAttempt(env: Env, email: string, success: boolean, ip?: string): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO login_attempts (email, success, ip_address, created_at) VALUES (?, ?, ?, datetime("now"))'
    ).bind(email.toLowerCase(), success ? 1 : 0, ip || null).run();

    if (success) {
      await env.DB.prepare('DELETE FROM account_lockouts WHERE email = ?').bind(email.toLowerCase()).run();
      return;
    }

    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM login_attempts WHERE email = ? AND success = 0 AND created_at > ?'
    ).bind(email.toLowerCase(), windowStart).first<{ count: number }>();

    if ((result?.count ?? 0) >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await env.DB.prepare(
        'INSERT OR REPLACE INTO account_lockouts (email, locked_until, created_at) VALUES (?, ?, datetime("now"))'
      ).bind(email.toLowerCase(), lockedUntil).run();
    }
  } catch {
    // Silent — must not interrupt main flow
  }
}

// ─── Audit log (OWASP ASVS 7.4.1) ────────────────────────────────────────────
export async function auditLog(
  env    : Env,
  userId : number | null,
  action : string,
  details: Record<string, unknown>,
  ip    ?: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO audit_log (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
    ).bind(userId, action, JSON.stringify(details), ip || null).run();
  } catch {
    // Silent — audit log must not crash main flow
  }
}

// ─── Stripe webhook signature (HMAC-SHA256 + anti-replay) ────────────────────
/**
 * [CRÍTICO-01] Validates Stripe webhook signatures.
 * Rejects events older than 5 minutes to prevent replay attacks.
 */
export function verifyStripeWebhookSignature(body: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader || !body || !secret) return false;
  try {
    const parts: Record<string, string> = {};
    for (const part of sigHeader.split(',')) {
      const [k, ...v] = part.split('=');
      parts[k.trim()] = v.join('=').trim();
    }
    const { t: timestamp, v1: signature } = parts;
    if (!timestamp || !signature) return false;

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

    const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const sigA = Buffer.from(signature, 'hex');
    const sigB = Buffer.from(expected,  'hex');
    if (sigA.length !== sigB.length || sigA.length === 0) return false;
    return timingSafeEqual(sigA, sigB);
  } catch {
    return false;
  }
}

// ─── Cloudflare Turnstile ─────────────────────────────────────────────────────
export async function verifyTurnstile(env: Env, token: string | undefined, ip?: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // dev mode — not configured
  if (!token) return false;
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    });
    const data = await resp.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
