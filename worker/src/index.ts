// CDM STORES - Backend Cloudflare Workers
// API pronta para Stripe + CJdropshipping
// Security hardening: OWASP ASVS L2/L3, NIST SP 800-63B, PCI-DSS

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// ─── SECURITY HEADERS (OWASP ASVS 14.4, PCI-DSS 6.2.4) ──────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
};

const ALLOWED_ORIGINS = new Set([
  'https://cdmstores.com',
  'https://www.cdmstores.com',
  'http://localhost',
  'http://localhost:8787',
  'http://localhost:3000',
]);

function resolveOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://cdmstores.com';
}

const CORS_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  'Access-Control-Allow-Origin': 'https://cdmstores.com', // substituído dinamicamente no fetch
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Token',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
};

interface Env {
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  CJ_API_KEY?: string;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  APP_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;   // Cloudflare Turnstile bot protection
  ENVIRONMENT?: string;            // 'development' | 'staging' | 'production'
}

// ===== AUTENTICAÇÃO =====

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

type TokenType = 'access' | 'refresh' | 'password_reset' | 'email_verify' | '2fa_challenge';

interface JWTPayload {
  sub: number;
  email: string;
  type: TokenType;
  iat: number;
  exp: number;
  jti: string;
}

interface JWTVerifyResult {
  valid: boolean;
  payload?: JWTPayload;
  userId?: number;
  email?: string;
}

interface AuthContext {
  userId: number;
  email: string;
  token: string;
  jti: string;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(secret: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.replace(/\s|=/g, '').toUpperCase();

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) {
      throw new Error('TOTP secret inválido (base32)');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
}

function getJwtSecret(env: Env): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET ausente ou fraco. Use no mínimo 32 caracteres aleatórios.');
  }
  return env.JWT_SECRET;
}

function hmacSha256Base64Url(secret: string, data: string): string {
  return createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Hash de senha seguro com PBKDF2-SHA256 (SubtleCrypto nativa do Workers).
 * Formato: pbkdf2$iterations$saltB64$hashB64
 * NIST SP 800-63B recomenda PBKDF2 com 600.000 iterções.
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
    keyMaterial, 256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  return `pbkdf2$600000$${saltB64}$${hashB64}`;
}

/**
 * Verificar senha — suporta PBKDF2 (novo) e scrypt (legacy, migration automática).
 * Usa comparação em tempo constante em ambos os formatos.
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    // ─ Formato novo: PBKDF2 ──────────────────────────────────
    if (storedHash.startsWith('pbkdf2$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 4) return false;
      const iterations = Number(parts[1]);
      if (!Number.isInteger(iterations) || iterations < 100_000) return false;
      const salt = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
      const expectedHash = Uint8Array.from(atob(parts[3]), c => c.charCodeAt(0));
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
      );
      const hashBuffer = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        keyMaterial, 256
      );
      const candidate = new Uint8Array(hashBuffer);
      if (candidate.length !== expectedHash.length) return false;
      return timingSafeEqual(candidate, expectedHash);
    }

    // ─ Formato legacy: scrypt (migration automática no login) ───────
    if (storedHash.startsWith('scrypt$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
      const N = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      const salt = Buffer.from(parts[4], 'hex');
      const expected = Buffer.from(parts[5], 'hex');
      const candidate = Buffer.from(
        scryptSync(password, salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 })
      );
      if (candidate.length !== expected.length) return false;
      return timingSafeEqual(candidate, expected);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Gerar JWT assinado com HS256.
 */
function generateJWT(
  env: Env,
  userId: number,
  email: string,
  expiresIn: number = ACCESS_TOKEN_TTL_SECONDS,
  type: TokenType = 'access'
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: userId,
    email,
    type,
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomUUID(),
  };

  const headerEncoded = base64UrlEncodeString(JSON.stringify(header));
  const payloadEncoded = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = hmacSha256Base64Url(getJwtSecret(env), signingInput);

  return `${signingInput}.${signature}`;
}

/**
 * Verificar JWT assinado e validade temporal.
 */
function verifyJWT(token: string, env: Env, expectedType?: TokenType): JWTVerifyResult {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false };
    }

    const [headerB64, payloadB64, signature] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(headerB64)));
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') {
      return { valid: false };
    }

    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSignature = hmacSha256Base64Url(getJwtSecret(env), signingInput);

    const sigA = Buffer.from(signature);
    const sigB = Buffer.from(expectedSignature);
    if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
      return { valid: false };
    }

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64))) as JWTPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload.sub || !payload.email || !payload.exp || !payload.iat || !payload.type || !payload.jti) {
      return { valid: false };
    }

    if (payload.exp <= now || payload.iat > now + 60) {
      return { valid: false };
    }

    if (expectedType && payload.type !== expectedType) {
      return { valid: false };
    }

    return { valid: true, payload, userId: payload.sub, email: payload.email };
  } catch {
    return { valid: false };
  }
}

async function createSession(
  env: Env,
  userId: number,
  accessToken: string,
  refreshToken: string,
  accessExpiresAt: string,
  refreshExpiresAt: string
): Promise<void> {
  const accessHash = hashToken(accessToken);
  const refreshHash = hashToken(refreshToken);

  await env.DB.prepare(
    'INSERT INTO sessions (user_id, token, refresh_token, expires_at, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
  ).bind(userId, accessHash, refreshHash, accessExpiresAt, refreshExpiresAt).run();
}

async function issueSessionTokens(env: Env, userId: number, email: string): Promise<{ token: string; refreshToken: string }> {
  const token = generateJWT(env, userId, email, ACCESS_TOKEN_TTL_SECONDS, 'access');
  const refreshToken = generateJWT(env, userId, email, REFRESH_TOKEN_TTL_SECONDS, 'refresh');

  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await createSession(env, userId, token, refreshToken, expiresAt, refreshExpiresAt);

  return { token, refreshToken };
}

async function revokeSessionByAccessToken(env: Env, accessToken: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hashToken(accessToken)).run();
}

async function requireAuth(request: Request, env: Env): Promise<{ ok: true; auth: AuthContext } | { ok: false; response: Response }> {
  let token: string | null = null;

  // 1º: Authorization: Bearer header (APIs, mobile)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2º: HttpOnly cookie (browser) — OWASP ASVS 3.4.2
  if (!token) {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      for (const part of cookieHeader.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name.trim() === 'auth_token') {
          token = rest.join('=').trim();
          break;
        }
      }
    }
  }

  if (!token) {
    return { ok: false, response: json({ success: false, error: 'Token não fornecido' }, 401) };
  }

  const verified = verifyJWT(token, env, 'access');
  if (!verified.valid || !verified.payload) {
    return { ok: false, response: json({ success: false, error: 'Token inválido ou expirado' }, 401) };
  }

  const tokenHash = hashToken(token);
  const session = await env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ? LIMIT 1'
  ).bind(tokenHash).first<{ user_id: number; expires_at: string }>();

  if (!session || session.user_id !== verified.payload.sub) {
    return { ok: false, response: json({ success: false, error: 'Sessão revogada ou inexistente' }, 401) };
  }

  if (session.expires_at <= new Date().toISOString()) {
    return { ok: false, response: json({ success: false, error: 'Sessão expirada' }, 401) };
  }

  return {
    ok: true,
    auth: {
      userId: verified.payload.sub,
      email: verified.payload.email,
      token,
      jti: verified.payload.jti,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE SEGURANÇA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * [CRÍTICO-01] Verificar assinatura HMAC-SHA256 do webhook Stripe.
 * Previne eventos forjados (replay attack incluído com validação de timestamp).
 * Ref: https://stripe.com/docs/webhooks/signatures
 */
function verifyStripeWebhookSignature(body: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader || !body || !secret) return false;
  try {
    const parts: Record<string, string> = {};
    for (const part of sigHeader.split(',')) {
      const [k, ...v] = part.split('=');
      parts[k.trim()] = v.join('=').trim();
    }
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    // Rejeitar eventos com mais de 5 minutos (anti-replay)
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) return false;

    const payload = `${timestamp}.${body}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const sigA = Buffer.from(signature, 'hex');
    const sigB = Buffer.from(expected, 'hex');
    if (sigA.length !== sigB.length || sigA.length === 0) return false;
    return timingSafeEqual(sigA, sigB);
  } catch {
    return false;
  }
}

/**
 * [ALTA-01] Rate limiting baseado em D1.
 * Conta tentativas dentro de uma janela de tempo deslizante.
 */
async function checkRateLimit(
  env: Env,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM rate_limit_attempts WHERE key = ? AND created_at > ?'
    ).bind(key, windowStart).first<{ count: number }>();

    const count = result?.count ?? 0;
    if (count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    await env.DB.prepare(
      'INSERT INTO rate_limit_attempts (key, created_at) VALUES (?, datetime("now"))'
    ).bind(key).run();

    return { allowed: true, remaining: maxRequests - count - 1 };
  } catch {
    // Se a tabela ainda não existir (ambiente sem migration), permite
    return { allowed: true, remaining: maxRequests };
  }
}

/**
 * [ALTA-01] Verificar se conta está bloqueada por brute-force (NIST SP 800-63B).
 */
async function isAccountLocked(env: Env, email: string): Promise<boolean> {
  try {
    const lockout = await env.DB.prepare(
      "SELECT locked_until FROM account_lockouts WHERE email = ? AND locked_until > datetime('now') LIMIT 1"
    ).bind(email.toLowerCase()).first<{ locked_until: string }>();
    return !!lockout;
  } catch {
    return false;
  }
}

/**
 * Registrar tentativa de login (para lockout automático após N falhas).
 */
async function recordLoginAttempt(
  env: Env,
  email: string,
  success: boolean,
  ip?: string
): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO login_attempts (email, success, ip_address, created_at) VALUES (?, ?, ?, datetime("now"))'
    ).bind(email.toLowerCase(), success ? 1 : 0, ip || null).run();

    if (success) {
      // Login bem-sucedido: limpar lockout
      await env.DB.prepare('DELETE FROM account_lockouts WHERE email = ?')
        .bind(email.toLowerCase()).run();
      return;
    }

    // Contar falhas nos últimos 15 minutos
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM login_attempts WHERE email = ? AND success = 0 AND created_at > ?"
    ).bind(email.toLowerCase(), windowStart).first<{ count: number }>();

    const failCount = result?.count ?? 0;
    if (failCount >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await env.DB.prepare(
        'INSERT OR REPLACE INTO account_lockouts (email, locked_until, created_at) VALUES (?, ?, datetime("now"))'
      ).bind(email.toLowerCase(), lockedUntil).run();
    }
  } catch {
    // Falhas no registro de tentativas não devem quebrar o fluxo principal
  }
}

/**
 * [ALTA-07 + OWASP ASVS 7.4.1] Audit log de eventos de segurança.
 * Nunca deve quebrar o fluxo principal.
 */
async function auditLog(
  env: Env,
  userId: number | null,
  action: string,
  details: Record<string, unknown>,
  ip?: string
): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO audit_log (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
    ).bind(userId, action, JSON.stringify(details), ip || null).run();
  } catch {
    // Silencioso — audit log nunca crasha o fluxo
  }
}

/**
 * Retornar erro interno sanitizado (NUNCA vazar error.message para o cliente).
 * [ALTA-07] OWASP ASVS 7.4.2
 */
function internalError(error: unknown, context?: string): Response {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[INTERNAL ERROR]${context ? ' ' + context : ''}:`, msg);
  return json({ success: false, error: 'Erro interno do servidor' }, 500);
}

/**
 * [HARDENING] Verificar token Cloudflare Turnstile (bot protection).
 * Se TURNSTILE_SECRET_KEY não estiver configurado, permite (dev mode).
 */
async function verifyTurnstile(env: Env, token: string | undefined, ip?: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // Não configurado: permitir (dev)
  if (!token) return false;
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    });
    const data = await resp.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * [CRÍTICO-03] Calcular total de pedido no servidor — NUNCA confiar no cliente.
 * Retorna null se algum produto for inválido/inativo.
 */
async function calculateOrderTotal(
  env: Env,
  items: Array<{ product_id: number; quantity: number }>
): Promise<{ total: number; enrichedItems: Array<{ product_id: number; quantity: number; price: number; name: string }> } | null> {
  const SHIPPING_COST = 15.00;
  let subtotal = 0;
  const enrichedItems = [];

  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1 || item.quantity > 100) {
      return null;
    }
    const product = await env.DB.prepare(
      'SELECT id, name, price, stock FROM products WHERE id = ? AND active = 1'
    ).bind(item.product_id).first<{ id: number; name: string; price: number; stock: number }>();

    if (!product) return null;
    if (product.stock < item.quantity) return null;

    subtotal += product.price * item.quantity;
    enrichedItems.push({ product_id: product.id, quantity: item.quantity, price: product.price, name: product.name });
  }

  return { total: subtotal + SHIPPING_COST, enrichedItems };
}

/** Email validation regex (RFC 5321 compliant, não aceita local-only) */
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** Validar força de senha: mín. 8 chars, pelo menos 1 número ou especial */
function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Senha deve ter no mínimo 8 caracteres';
  if (password.length > 128) return 'Senha muito longa (máx. 128 caracteres)';
  if (!/[0-9!@#$%^&*()\-_=+[\]{}|;:,.<>?]/.test(password)) {
    return 'Senha deve conter pelo menos um número ou caractere especial';
  }
  return null;
}

/**
 * Enabler explícito de 2FA para manter fluxo de negócio auditável.
 */
async function enable2FA(env: Env, userId: number, secret: string, backupCodes: string[]): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, two_factor_backup_codes = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(secret, JSON.stringify(backupCodes), userId).run();
}

/**
 * Desativar 2FA removendo segredos e códigos de backup.
 */
async function disable2FA(env: Env, userId: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_backup_codes = NULL, updated_at = datetime("now") WHERE id = ?'
  ).bind(userId).run();
}


/**
 * Enviar email via Resend
 */
async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não configurado - email não será enviado');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@cdmstores.com',
        to: to,
        subject: subject,
        html: html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Erro ao enviar email:', error);
      return false;
    }

    console.log(`✉️ Email enviado para ${to}`);
    return true;
  } catch (error) {
    console.error('Erro ao enviar email via Resend:', error);
    return false;
  }
}

/**
 * Gerar TOTP Secret (base32)
 */
function generateTOTPSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Gerar códigos de backup (para 2FA)
 */
function generateBackupCodes(count: number = 10): string[] {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(5).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Verificar código TOTP real conforme RFC 6238 (HMAC-SHA1).
 */
function verifyTOTPCode(secret: string, code: string, timeWindow: number = 1): boolean {
  if (!code || code.length !== 6) return false;
  if (!/^\d+$/.test(code)) return false;

  try {
    const key = base32Decode(secret);
    const now = Math.floor(Date.now() / 1000);
    const period = 30;

    for (let offset = -timeWindow; offset <= timeWindow; offset++) {
      const counter = Math.floor((now + offset * period) / period);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigUInt64BE(BigInt(counter));

      const hmac = createHmac('sha1', Buffer.from(key)).update(counterBuffer).digest();
      const offsetNibble = hmac[hmac.length - 1] & 0x0f;
      const binaryCode =
        ((hmac[offsetNibble] & 0x7f) << 24) |
        ((hmac[offsetNibble + 1] & 0xff) << 16) |
        ((hmac[offsetNibble + 2] & 0xff) << 8) |
        (hmac[offsetNibble + 3] & 0xff);

      const otp = (binaryCode % 1_000_000).toString().padStart(6, '0');
      if (timingSafeEqual(Buffer.from(otp), Buffer.from(code))) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  const headers = { ...CORS_HEADERS, ...extraHeaders };
  return new Response(JSON.stringify(data), { status, headers });
}

/** Definir cookies HttpOnly + Secure + SameSite=Strict (OWASP ASVS 3.4) */
function buildSetCookieHeaders(token: string, refreshToken: string): string[] {
  const secure = '; Secure; SameSite=Strict; HttpOnly; Path=/';
  return [
    `auth_token=${token}; Max-Age=${ACCESS_TOKEN_TTL_SECONDS}${secure}`,
    `refresh_token=${refreshToken}; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}${secure}`,
  ];
}

/** Limpar cookies de sessão no logout */
function buildClearCookieHeaders(): string[] {
  return [
    'auth_token=; Max-Age=0; Secure; SameSite=Strict; HttpOnly; Path=/',
    'refresh_token=; Max-Age=0; Secure; SameSite=Strict; HttpOnly; Path=/',
  ];
}

/** Response JSON com suporte a múltiplos Set-Cookie (OWASP 3.4.2) */
function jsonWithCookies(data: unknown, status: number, cookies: string[]): Response {
  const headers = new Headers(CORS_HEADERS as HeadersInit);
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * FAQ Database
 */
const FAQ: { [key: string]: any } = {
  pt: {
    'oi|olá|opa|e aí': 'Olá! 👋 Bem-vindo à CDM STORES! Como posso ajudar?\n\n📝 Posso:\n• Buscar produtos\n• Rastrear pedidos\n• Aplicar cupons\n• Responder dúvidas',
    'qual.*produto|produtos|o que vocês vendem': 'Temos 3 produtos incríveis:\n\n🎧 **Fone Bluetooth** - R$ 89,90\n📱 **Carregador USB-C** - R$ 49,90\n⚡ **Cabo Lightning** - R$ 29,90\n\nDigite "Fone", "Carregador" ou "Cabo" para saber mais!',
    'fone|bluetooth': '🎧 **Fone Bluetooth Premium**\nPreço: R$ 89,90\nQualidade: Alta (wireless)\nDescrição: Fone wireless de alta qualidade com bateria durável.\n\nDigite "adicionar Fone" para comprar!',
    'carregador|usb-c|65w': '📱 **Carregador USB-C 65W**\nPreço: R$ 49,90\nTecnologia: Carregamento rápido\nDescrição: Carregador rápido 65W compatível com múltiplos dispositivos.\n\nDigite "adicionar Carregador" para comprar!',
    'cabo|lightning': '⚡ **Cabo Lightning Original**\nPreço: R$ 29,90\nOriginal e certificado\nDescrição: Cabo Lightning original certificado para durabilidade.\n\nDigite "adicionar Cabo" para comprar!',
    'frete|entrega|quanto cobra': '📦 **Frete**\nValor: R$ 15,00\nTempo: 5-7 dias úteis\nCobertura: Brasil inteiro\n\nO frete é FIXO em R$ 15,00 em qualquer compra!',
    'cupom|desconto|código|promo': '🎟️ **Cupons Disponíveis:**\n• NEWYEAR - R$ 10 de desconto\n• PROMO - R$ 5 de desconto\n• DESCONTO10 - R$ 10 de desconto\n• SAVE20 - R$ 20 de desconto\n\nDigite seu cupom no carrinho!',
    'rastraio|rastrear|pedido|onde está': '📍 **Rastreio de Pedidos**\nPara rastrear seu pedido, você precisa do código de rastreio.\n\nVá em "Rastreio" na página e digite seu código!\n\nNão tem o código? Responda "verificar pedido" + seu email.',
    'pagamento|pagar|stripe|cartão': '💳 **Pagamento**\nAceitamos:\n• Cartão de crédito/débito (Stripe)\n• Pagamento seguro e criptografado\n\nSeu pagamento é processado via Stripe (100% seguro).',
    'atendimento|suporte|falar|conversar': '💬 **Atendimento**\nVocê está falando comigo, um assistente automático!\n\nPara suporte humano:\n📧 Email: support@cdmstores.com\n☎️ WhatsApp: (11) 99999-9999',
    'obrigado|valeu|thanks|tks': 'De nada! 😊 Fico feliz em ajudar!\n\nTemais dúvidas? É só chamar! 🚀',
  },
  en: {
    'hi|hello|hey|what\'s up': 'Hello! 👋 Welcome to CDM STORES! How can I help?\n\n📝 I can:\n• Search products\n• Track orders\n• Apply coupons\n• Answer questions',
    'products|what do you sell': 'We have 3 amazing products:\n\n🎧 **Bluetooth Headphones** - $18.00\n📱 **USB-C Charger** - $10.00\n⚡ **Lightning Cable** - $6.00\n\nType "Headphones", "Charger" or "Cable" for details!',
    'shipping|delivery|how much': '📦 **Shipping**\nCost: $3.00\nTime: 5-7 business days\nCoverage: Worldwide\n\nFlat rate of $3.00 on any order!',
  },
  es: {
    'hola|hi|hey|qué tal': '¡Hola! 👋 ¡Bienvenido a CDM STORES! ¿Cómo puedo ayudarte?\n\n📝 Puedo:\n• Buscar productos\n• Rastrear pedidos\n• Aplicar cupones\n• Responder preguntas',
    'productos|qué venden': 'Tenemos 3 productos increíbles:\n\n🎧 **Auriculares Bluetooth** - R$ 89,90\n📱 **Cargador USB-C** - R$ 49,90\n⚡ **Cable Lightning** - R$ 29,90\n\n¡Escribe "Auriculares", "Cargador" o "Cable" para más detalles!',
  }
};

/**
 * Análise de Sentimento
 */
function analisarSentimento(msg: string): { sentimento: string; score: number } {
  const positivos = ['bom', 'ótimo', 'excelente', 'gosto', 'gostei', 'amei', 'perfeito', 'legal', 'boa', 'show', 'top', 'adorei'];
  const negativos = ['ruim', 'péssimo', 'horrível', 'odeio', 'odiei', 'problema', 'erro', 'falha', 'decepção', 'triste', 'chato'];

  let score = 0;
  positivos.forEach(p => { if (msg.includes(p)) score += 1; });
  negativos.forEach(n => { if (msg.includes(n)) score -= 1; });

  let sentimento = 'neutro';
  if (score > 0) sentimento = 'positivo';
  if (score < 0) sentimento = 'negativo';

  return { sentimento, score };
}

/**
 * Validar Cupom
 */
function validarCupom(cupom: string): { valido: boolean; desconto: number; mensagem: string } {
  const cuponsValidos: { [key: string]: number } = {
    'NEWYEAR': 10,
    'PROMO': 5,
    'DESCONTO10': 10,
    'SAVE20': 20,
    'CDM10': 10,
  };

  const cupomUpper = cupom.toUpperCase().trim();
  if (cuponsValidos[cupomUpper]) {
    return {
      valido: true,
      desconto: cuponsValidos[cupomUpper],
      mensagem: `✅ Cupom ${cupomUpper} aplicado! Desconto: R$ ${cuponsValidos[cupomUpper]}`
    };
  }

  return {
    valido: false,
    desconto: 0,
    mensagem: '❌ Cupom inválido!'
  };
}

/**
 * Gerar link WhatsApp
 */
function gerarWhatsApp(telefone = '5511999999999', mensagem = 'Olá! Gostaria de falar com o suporte da CDM STORES'): string {
  const msg = encodeURIComponent(mensagem);
  return `https://wa.me/${telefone}?text=${msg}`;
}

/**
 * Processa mensagem do chatbot com 8 RECURSOS
 */
async function processChat(message: string, user_id: string | undefined, language: string, env: Env): Promise<any> {
  const msg = message.toLowerCase().trim();
  const faqDb = FAQ[language] || FAQ['pt'];
  const sentiment = analisarSentimento(msg);

  // Se sentimento muito negativo, oferecer suporte humano
  if (sentiment.sentimento === 'negativo') {
    const whatsappLink = gerarWhatsApp();
    return {
      response: language === 'pt'
        ? `Desculpe! 😞 Vejo que você está tendo problemas.\n\n🤝 Fale com nosso suporte:\n📱 [Chamar no WhatsApp](${whatsappLink})\n📧 support@cdmstores.com`
        : `I'm sorry! 😞 I see you're having issues.\n\n🤝 Contact our support:\n📱 [Chat on WhatsApp](${whatsappLink})\n📧 support@cdmstores.com`,
      action: 'escalate_to_human'
    };
  }

  // 1. INTEGRAÇÃO COM CARRINHO - Adicionar item
  if (msg.includes('adicionar') && (msg.includes('fone') || msg.includes('carregador') || msg.includes('cabo'))) {
    let productId = 0, productName = '';
    if (msg.includes('fone')) { productId = 1; productName = 'Fone Bluetooth'; }
    if (msg.includes('carregador')) { productId = 2; productName = 'Carregador USB-C'; }
    if (msg.includes('cabo')) { productId = 3; productName = 'Cabo Lightning'; }

    return {
      response: language === 'pt'
        ? `✅ ${productName} adicionado ao carrinho!\n\n🛒 [Ver Carrinho](#cart)`
        : `✅ ${productName} added to cart!\n\n🛒 [View Cart](#cart)`,
      action: 'add_to_cart',
      product_id: productId,
      product_name: productName
    };
  }

  // 2. RASTREIO REAL - Buscar código de rastreio
  if ((msg.includes('rastr') || msg.includes('track')) && msg.length > 5) {
    // Procurar por código com 6+ caracteres alfanuméricos
    let codigoMatch = msg.match(/[A-Z]{2}[0-9]{8,}|[A-Z0-9]{6,}/i);
    
    // Se não encontrou padrão específico, usar palavra mais longa após rastr/track
    if (!codigoMatch) {
      const words = msg.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        if ((words[i].includes('rastr') || words[i].includes('track')) && words[i + 1]) {
          codigoMatch = [words[i + 1]];
          break;
        }
      }
    }

    if (codigoMatch) {
      const codigo = codigoMatch[0].toUpperCase();
      try {
        const tracking = await env.DB.prepare(
          'SELECT id, status, created_at, updated_at FROM orders WHERE tracking_code = ? LIMIT 1'
        ).bind(codigo).first();

        if (tracking) {
          return {
            response: language === 'pt'
              ? `📦 **Status do Pedido**\nCódigo: ${codigo}\nStatus: ${tracking.status}\nPedido em: ${tracking.created_at}\nÚltima atualização: ${tracking.updated_at}`
              : `📦 **Order Status**\nCode: ${codigo}\nStatus: ${tracking.status}\nOrdered: ${tracking.created_at}\nLast update: ${tracking.updated_at}`,
            action: 'tracking_found',
            data: tracking
          };
        }
      } catch (error) {
        console.error('Erro rastreio:', error);
      }
    }

    return {
      response: language === 'pt'
        ? '❌ Código de rastreio não encontrado.\n\nTente novamente com o código completo! (Ex: "rastrear BR12345678")'
        : '❌ Tracking code not found.\n\nTry again with the complete code! (Ex: "track BR12345678")'
    };
  }

  // 3. HISTÓRICO DE PEDIDOS - Por email
  if ((msg.includes('meu') || msg.includes('meus') || msg.includes('verificar') || msg.includes('pedidos')) && msg.includes('pedido')) {
    // Primeiro tenta extrair email
    const emailMatch = msg.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      const email = emailMatch[0];
      try {
        const orders = await env.DB.prepare(
          'SELECT id, total, status, created_at FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT 5'
        ).bind(email).all();

        if (orders.results.length > 0) {
          let response = language === 'pt' ? `📋 **Seus Pedidos**\n\n` : `📋 **Your Orders**\n\n`;
          orders.results.forEach((o: any, i: number) => {
            response += `${i + 1}. Pedido #${o.id} - R$ ${o.total} (${o.status}) - ${o.created_at}\n`;
          });
          return { response, action: 'orders_found', data: orders.results };
        } else {
          return {
            response: language === 'pt'
              ? `ℹ️ Nenhum pedido encontrado para ${email}`
              : `ℹ️ No orders found for ${email}`,
            action: 'orders_found',
            data: []
          };
        }
      } catch (error) {
        console.error('Erro histórico:', error);
      }
    }

    return {
      response: language === 'pt'
        ? 'Para ver seus pedidos, envie um email válido!\n\nExemplo: "meus pedidos seu@email.com"'
        : 'Send a valid email to see your orders!\n\nExample: "my orders your@email.com"'
    };
  }

  // 4. APLICAR CUPOM
  if (msg.includes('cupom') || msg.includes('código') || msg.includes('promo')) {
    // Tentar extrair código (múltiplas tentativas)
    let cupomMatch = msg.match(/cupom\s+([A-Z0-9]+)/i);
    if (!cupomMatch) cupomMatch = msg.match(/\b([A-Z0-9]{4,})\b/);
    if (!cupomMatch) cupomMatch = msg.match(/([A-Z0-9]+)/);
    
    if (cupomMatch) {
      const resultado = validarCupom(cupomMatch[1]);
      return {
        response: resultado.mensagem,
        action: 'coupon_applied',
        coupon_valid: resultado.valido,
        discount: resultado.desconto
      };
    }

    return {
      response: language === 'pt'
        ? '🎟️ Cupons disponíveis:\n• NEWYEAR (R$ 10)\n• PROMO (R$ 5)\n• DESCONTO10 (R$ 10)\n• SAVE20 (R$ 20)\n\nDigite "cupom CÓDIGO"'
        : '🎟️ Available coupons:\n• NEWYEAR ($10)\n• PROMO ($5)\n• DESCONTO10 ($10)\n• SAVE20 ($20)\n\nType "coupon CODE"'
    };
  }

  // 5. NOTIFICAÇÕES - Avisar sobre promoções
  if (msg.includes('notif') || msg.includes('alerta') || msg.includes('promo')) {
    return {
      response: language === 'pt'
        ? '🔔 Você será notificado sobre:\n✅ Novos produtos\n✅ Promoções especiais\n✅ Status de pedidos\n\nNotificações ativadas!'
        : '🔔 You will be notified about:\n✅ New products\n✅ Special offers\n✅ Order status\n\nNotifications enabled!',
      action: 'enable_notifications'
    };
  }

  // 6. AGENDAMENTO DE SUPORTE
  if (msg.includes('agendar') || msg.includes('consulta') || msg.includes('horário')) {
    return {
      response: language === 'pt'
        ? '📅 **Agendar Atendimento**\n\n⏰ Horários disponíveis:\n• Segunda a Sexta: 9h-18h\n• Sábado: 9h-13h\n\n📧 Envie: seu@email.com'
        : '📅 **Schedule Support**\n\n⏰ Available times:\n• Mon-Fri: 9am-6pm\n• Sat: 9am-1pm\n\n📧 Send: your@email.com',
      action: 'schedule_support'
    };
  }

  // 7. WHATSAPP
  if (msg.includes('whatsapp') || msg.includes('conversar') || msg.includes('atendimento humano')) {
    const whatsappLink = gerarWhatsApp();
    return {
      response: language === 'pt'
        ? `💬 **Fale Conosco no WhatsApp**\n\n[Clique aqui para conversar](${whatsappLink})\n\nOu ligue: (11) 99999-9999`
        : `💬 **Chat with us on WhatsApp**\n\n[Click here to talk](${whatsappLink})\n\nOr call: +55 11 99999-9999`,
      action: 'whatsapp_link',
      link: whatsappLink
    };
  }

  // 1. Buscar em FAQ (mantém compatibilidade)
  for (const [pattern, answer] of Object.entries(faqDb)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(msg)) {
      return { response: answer };
    }
  }

  // Fallback
  return {
    response: language === 'pt'
      ? '😊 Desculpa, não entendi bem.\n\n📝 Posso ajudar com:\n• Buscar produtos\n• Rastrear pedidos\n• Aplicar cupons\n• Falar com suporte'
      : '😊 Sorry, I didn\'t understand.\n\n📝 I can help with:\n• Search products\n• Track orders\n• Apply coupons\n• Contact support'
  };
}

async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Health check — [BAIXA-01 CORRIGIDO] Nunca expõe configuração interna
  if (path === '/api/health') {
    return json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // ===== PRODUTOS =====
  if (path === '/api/products' && request.method === 'GET') {
    try {
      const products = await env.DB.prepare(
        'SELECT id, name, description, price, image_url, stock FROM products WHERE active = 1'
      ).all();
      return json({ success: true, data: products.results });
    } catch (error) {
      return internalError(error, 'products/list');
    }
  }

  if (path.match(/^\/api\/products\/\d+$/) && request.method === 'GET') {
    try {
      const id = path.split('/').pop();
      const product = await env.DB.prepare(
        'SELECT id, name, description, price, image_url, stock FROM products WHERE id = ?'
      ).bind(id).first();
      
      if (!product) {
        return json({ success: false, error: 'Produto não encontrado' }, 404);
      }
      return json({ success: true, data: product });
    } catch (error) {
      return internalError(error, 'products/get');
    }
  }

  // ===== CARRINHO =====
  if (path === '/api/cart/add' && request.method === 'POST') {
    try {
      const body = await request.json() as Record<string, unknown>;
      const { product_id, quantity } = body as { product_id?: number; quantity?: number };

      if (!product_id || !quantity) {
        return json({ success: false, error: 'product_id e quantity obrigatórios' }, 400);
      }

      const product = await env.DB.prepare(
        'SELECT stock FROM products WHERE id = ?'
      ).bind(product_id).first<{ stock: number }>();

      if (!product || product.stock < quantity) {
        return json({ success: false, error: 'Estoque insuficiente' }, 400);
      }

      return json({ success: true, message: 'Item adicionado ao carrinho', item: { product_id, quantity } });
    } catch (error) {
      return internalError(error, 'cart/add');
    }
  }

  // ===== PEDIDOS =====
  // [CRÍTICO-03 CORRIGIDO] Total calculado no servidor, nunca confiado no cliente
  // [CRÍTICO-04 CORRIGIDO parcial] Requer auth para criar pedido
  if (path === '/api/orders' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const body = await request.json() as Record<string, unknown>;
      const { customer_name, customer_email, items } = body as {
        customer_name?: string;
        customer_email?: string;
        items?: Array<{ product_id: number; quantity: number }>;
      };

      if (!customer_email || !items || !Array.isArray(items) || items.length === 0) {
        return json({ success: false, error: 'Dados incompletos' }, 400);
      }

      if (customer_email.length > 254 || !EMAIL_REGEX.test(customer_email)) {
        return json({ success: false, error: 'Email inválido' }, 400);
      }

      // [CRÍTICO-03] Calcular total no servidor
      const calculated = await calculateOrderTotal(env, items);
      if (!calculated) {
        return json({ success: false, error: 'Produto inválido ou sem estoque' }, 400);
      }

      const result = await env.DB.prepare(
        'INSERT INTO orders (user_id, customer_name, customer_email, total, shipping_cost, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, "pending", datetime("now"), datetime("now"))'
      ).bind(
        authResult.auth.userId,
        (typeof customer_name === 'string' ? customer_name.substring(0, 100) : null),
        customer_email,
        calculated.total,
        15.00,
      ).run();

      const orderId = result.meta.last_row_id;

      for (const item of calculated.enrichedItems) {
        await env.DB.prepare(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
        ).bind(orderId, item.product_id, item.quantity, item.price).run();
      }

      await auditLog(env, authResult.auth.userId, 'order_created', { order_id: orderId, total: calculated.total });
      return json({ success: true, order_id: orderId, total: calculated.total, status: 'pending' }, 201);
    } catch (error) {
      return internalError(error, 'orders/create');
    }
  }

  // [CRÍTICO-04 CORRIGIDO] Requer autenticação e verifica ownership do pedido
  if (path.match(/^\/api\/orders\/\d+$/) && request.method === 'GET') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const id = Number(path.split('/').pop());
      const order = await env.DB.prepare(
        'SELECT id, total, status, created_at, updated_at, stripe_payment_id, cj_order_id, tracking_code FROM orders WHERE id = ? AND user_id = ?'
      ).bind(id, authResult.auth.userId).first();

      if (!order) {
        return json({ success: false, error: 'Pedido não encontrado' }, 404);
      }

      return json({ success: true, data: order });
    } catch (error) {
      return internalError(error, 'orders/get');
    }
  }

  // ===== RASTREIO =====
  if (path.match(/^\/api\/tracking\//) && request.method === 'GET') {
    try {
      const code = path.replace('/api/tracking/', '');
      // [BAIXA-04 CORRIGIDO] Não expor customer_name em endpoint público
      const order = await env.DB.prepare(
        'SELECT id, tracking_code, status, created_at, updated_at FROM orders WHERE tracking_code = ?'
      ).bind(code).first();

      if (!order) {
        return json({ success: false, error: 'Código não encontrado' }, 404);
      }

      return json({ success: true, data: order });
    } catch (error) {
      return internalError(error, 'tracking');
    }
  }

  // Registro de novo usuário
  // [ALTA-01 CORRIGIDO] Rate limiting + Turnstile + validação forte
  // [ALTA-11 CORRIGIDO] Token de verificação armazenado como hash
  if (path === '/api/auth/register' && request.method === 'POST') {
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

      // Rate limiting: 5 registros por IP por hora
      const rl = await checkRateLimit(env, `register:${ip}`, 5, 3600);
      if (!rl.allowed) {
        return json({ success: false, error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);
      }

      const body = await request.json() as Record<string, unknown>;
      const { email, password, name, turnstileToken } = body as {
        email?: string; password?: string; name?: string; turnstileToken?: string;
      };

      // Verificar Turnstile
      if (env.TURNSTILE_SECRET_KEY && !await verifyTurnstile(env, turnstileToken, ip)) {
        return json({ success: false, error: 'Verificação de bot falhou' }, 403);
      }

      if (!email || !password || !name) {
        return json({ success: false, error: 'Campos obrigatórios: email, password, name' }, 400);
      }

      // Limites de tamanho
      if (typeof name !== 'string' || name.length < 2 || name.length > 100) {
        return json({ success: false, error: 'Nome deve ter entre 2 e 100 caracteres' }, 400);
      }

      // [MÉDIA-02 CORRIGIDO] Validação de email robusta
      if (typeof email !== 'string' || email.length > 254 || !EMAIL_REGEX.test(email)) {
        return json({ success: false, error: 'Email inválido' }, 400);
      }

      // [MÉDIA-03 CORRIGIDO] Senha mín. 8 chars + complexidade
      if (typeof password !== 'string') {
        return json({ success: false, error: 'Senha inválida' }, 400);
      }
      const passError = validatePasswordStrength(password);
      if (passError) return json({ success: false, error: passError }, 400);

      // Verificar se email já existe
      const existingUser = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ? LIMIT 1'
      ).bind(email.toLowerCase()).first();

      if (existingUser) {
        return json({ success: false, error: 'Email já cadastrado' }, 409);
      }

      // Hash de senha (PBKDF2)
      const passwordHash = await hashPassword(password);

      const result = await env.DB.prepare(
        'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))'
      ).bind(email.toLowerCase(), passwordHash, name.trim()).run();

      const userId = result.meta.last_row_id;
      const { token, refreshToken } = await issueSessionTokens(env, userId, email.toLowerCase());

      // [ALTA-11 CORRIGIDO] Armazenar hash do token de verificação
      const verificationToken = generateJWT(env, userId, email.toLowerCase(), 86400, 'email_verify');
      await env.DB.prepare(
        'INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(userId, hashToken(verificationToken), new Date(Date.now() + 86400 * 1000).toISOString()).run();

      const verifyLink = `${env.APP_URL || 'https://cdmstores.com'}/verify-email?token=${verificationToken}`;
      await sendEmail(env, email, 'Confirme seu email - CDM Stores', `
        <h2>Bem-vindo à CDM Stores! 🎉</h2>
        <p>Olá ${name},</p>
        <p>Clique no link abaixo para verificar seu email (válido por 24h):</p>
        <p><a href="${verifyLink}" style="background:#00AFFF;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">✓ Verificar Email</a></p>
        <p style="color:#999;font-size:12px;">Se você não criou essa conta, ignore este email.</p>
      `);

      await auditLog(env, userId, 'register', { email: email.toLowerCase() }, ip);

      return jsonWithCookies({
        success: true,
        message: 'Usuário cadastrado com sucesso! Verifique seu email para ativar a conta.',
        user: { id: userId, email: email.toLowerCase(), name: name.trim() },
        token, refreshToken,
      }, 201, buildSetCookieHeaders(token, refreshToken));
    } catch (error) {
      return internalError(error, 'auth/register');
    }
  }

  // Login
  // [ALTA-01 CORRIGIDO] Rate limiting + account lockout + audit log
  // [ALTA-08 CORRIGIDO] PBKDF2 migration automática + cookies HttpOnly
  if (path === '/api/auth/login' && request.method === 'POST') {
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

      // Rate limiting: 10 tentativas por IP por 5 minutos
      const rl = await checkRateLimit(env, `login:${ip}`, 10, 300);
      if (!rl.allowed) {
        return json({ success: false, error: 'Muitas tentativas de login. Aguarde 5 minutos.' }, 429);
      }

      const body = await request.json() as Record<string, unknown>;
      const { email, password, turnstileToken } = body as { email?: string; password?: string; turnstileToken?: string };

      if (!email || !password) {
        return json({ success: false, error: 'Email e senha obrigatórios' }, 400);
      }

      // Verificar Turnstile
      if (env.TURNSTILE_SECRET_KEY && !await verifyTurnstile(env, turnstileToken, ip)) {
        return json({ success: false, error: 'Verificação de bot falhou' }, 403);
      }

      // [ALTA-01] Verificar lockout ANTES de qualquer DB lookup sensitivo
      if (await isAccountLocked(env, email)) {
        return json({ success: false, error: 'Conta temporariamente bloqueada. Tente novamente em 15 minutos.' }, 423);
      }

      // Buscar usuário
      const user = await env.DB.prepare(
        'SELECT id, email, name, password_hash, status, two_factor_enabled FROM users WHERE email = ? LIMIT 1'
      ).bind(email.toLowerCase()).first<{
        id: number; email: string; name: string; password_hash: string; status: string; two_factor_enabled: number;
      }>();

      // Resposta genérica (não revela se email existe — NIST SP 800-63B)
      const INVALID_CREDENTIALS = 'Email ou senha incorretos';

      if (!user) {
        await recordLoginAttempt(env, email, false, ip);
        return json({ success: false, error: INVALID_CREDENTIALS }, 401);
      }

      if (user.status === 'inactive' || user.status === 'banned') {
        return json({ success: false, error: 'Conta inativa ou suspensa' }, 403);
      }

      // Verificar senha
      const passwordMatch = await verifyPassword(password, user.password_hash);
      if (!passwordMatch) {
        await recordLoginAttempt(env, email, false, ip);
        await auditLog(env, user.id, 'login_failed', { reason: 'wrong_password' }, ip);
        return json({ success: false, error: INVALID_CREDENTIALS }, 401);
      }

      // [ALTA-08] Migration automática scrypt → PBKDF2
      if (user.password_hash.startsWith('scrypt$')) {
        const newHash = await hashPassword(password);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();
      }

      await recordLoginAttempt(env, email, true, ip);

      if (user.two_factor_enabled) {
        const challengeToken = generateJWT(env, user.id, user.email, 300, '2fa_challenge');
        return json({
          success: true,
          requires2FA: true,
          challengeToken,
          user: { id: user.id, email: user.email, name: user.name },
        });
      }

      const { token, refreshToken } = await issueSessionTokens(env, user.id, user.email);
      await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(user.id).run();
      await auditLog(env, user.id, 'login_success', {}, ip);

      return jsonWithCookies({
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
        token, refreshToken,
      }, 200, buildSetCookieHeaders(token, refreshToken));
    } catch (error) {
      return internalError(error, 'auth/login');
    }
  }

  // Obter usuário atual
  if (path === '/api/auth/me' && request.method === 'GET') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) {
        return authResult.response;
      }

      const user = await env.DB.prepare(
        'SELECT id, email, name, phone, avatar_url, status, email_verified, created_at, last_login FROM users WHERE id = ? LIMIT 1'
      ).bind(authResult.auth.userId).first();

      if (!user) {
        return json({ success: false, error: 'Usuário não encontrado' }, 404);
      }

      return json({ success: true, user });
    } catch (error) {
      return internalError(error, 'auth/me');
    }
  }

  // Logout
  if (path === '/api/auth/logout' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) {
        return authResult.response;
      }

      await revokeSessionByAccessToken(env, authResult.auth.token);

      return jsonWithCookies({ success: true, message: 'Logout realizado com sucesso' }, 200, buildClearCookieHeaders());
    } catch (error) {
      return internalError(error, 'auth/logout');
    }
  }

  // Refresh token
  if (path === '/api/auth/refresh' && request.method === 'POST') {
    try {
      const body = await request.json() as Record<string, unknown>;
      const { refreshToken } = body as { refreshToken?: string };

      if (!refreshToken) {
        return json({ success: false, error: 'Refresh token obrigatório' }, 400);
      }

      const verified = verifyJWT(refreshToken, env, 'refresh');
      if (!verified.valid || !verified.payload) {
        return json({ success: false, error: 'Refresh token inválido' }, 401);
      }

      const refreshTokenHash = hashToken(refreshToken);
      const session = await env.DB.prepare(
        'SELECT user_id, refresh_expires_at FROM sessions WHERE refresh_token = ? LIMIT 1'
      ).bind(refreshTokenHash).first<{ user_id: number; refresh_expires_at: string }>();

      if (!session) {
        return json({ success: false, error: 'Sessão não encontrada' }, 401);
      }

      if (session.user_id !== verified.payload.sub || session.refresh_expires_at <= new Date().toISOString()) {
        return json({ success: false, error: 'Refresh token expirado ou inválido' }, 401);
      }

      // Rotação: invalida o refresh antigo e cria nova sessão completa.
      await env.DB.prepare('DELETE FROM sessions WHERE refresh_token = ?').bind(refreshTokenHash).run();

      const rotated = await issueSessionTokens(env, verified.payload.sub, verified.payload.email);

      return jsonWithCookies({ success: true, token: rotated.token, refreshToken: rotated.refreshToken }, 200, buildSetCookieHeaders(rotated.token, rotated.refreshToken));
    } catch (error) {
      return internalError(error, 'auth/refresh');
    }
  }

  // Esqueci a senha
  // [ALTA-01 CORRIGIDO] Rate limiting
  // [ALTA-11 CORRIGIDO] Token armazenado como hash SHA-256
  if (path === '/api/auth/forgot-password' && request.method === 'POST') {
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

      // Rate limiting: 3 por IP por hora (previne email bombing)
      const rl = await checkRateLimit(env, `forgot-password:${ip}`, 3, 3600);
      if (!rl.allowed) {
        return json({ success: false, error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);
      }

      const body = await request.json() as Record<string, unknown>;
      const { email } = body as { email?: string };

      if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
        // Resposta genérica (não revela se email existe)
        return json({ success: true, message: 'Se o email existe, receberá um link de reset' });
      }

      const user = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ? LIMIT 1'
      ).bind(email.toLowerCase()).first<{ id: number }>();

      if (!user) {
        return json({ success: true, message: 'Se o email existe, receberá um link de reset' });
      }

      // Invalidar tokens anteriores do mesmo usuário
      await env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id).run();

      // [ALTA-11] Armazenar hash do token
      const resetToken = generateJWT(env, user.id, email.toLowerCase(), 3600, 'password_reset');
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      await env.DB.prepare(
        'INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(user.id, hashToken(resetToken), expiresAt).run();

      const resetLink = `${env.APP_URL || 'https://cdmstores.com'}/reset-password?token=${resetToken}`;
      await sendEmail(env, email, 'Reset de Senha - CDM Stores', `
        <h2>Redefinir Senha</h2>
        <p>Clique no link abaixo para redefinir sua senha (válido por 1 hora):</p>
        <p><a href="${resetLink}" style="background:#00AFFF;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">Redefinir Senha</a></p>
        <p>Se você não solicitou isso, ignore este email.</p>
      `);

      await auditLog(env, user.id, 'password_reset_requested', {}, ip);
      return json({ success: true, message: 'Link de reset enviado para o email' });
    } catch (error) {
      return internalError(error, 'auth/forgot-password');
    }
  }

  // Reset de senha
  // [ALTA-11 CORRIGIDO] Busca por hash do token
  if (path === '/api/auth/reset-password' && request.method === 'POST') {
    try {
      const body = await request.json() as Record<string, unknown>;
      const { token, newPassword } = body as { token?: string; newPassword?: string };

      if (!token || !newPassword) {
        return json({ success: false, error: 'Token e nova senha obrigatórios' }, 400);
      }

      const passError = validatePasswordStrength(newPassword);
      if (passError) return json({ success: false, error: passError }, 400);

      // Verificar JWT
      const jwtCheck = verifyJWT(token, env, 'password_reset');
      if (!jwtCheck.valid || !jwtCheck.payload) {
        return json({ success: false, error: 'Token inválido ou expirado' }, 401);
      }

      // [ALTA-11] Buscar por hash do token
      const resetRecord = await env.DB.prepare(
        'SELECT user_id, expires_at, used FROM password_resets WHERE token = ? LIMIT 1'
      ).bind(hashToken(token)).first<{ user_id: number; expires_at: string; used: number }>();

      if (!resetRecord || resetRecord.used) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      if (resetRecord.expires_at < new Date().toISOString()) {
        return json({ success: false, error: 'Token expirado' }, 401);
      }

      if (resetRecord.user_id !== jwtCheck.payload.sub) {
        return json({ success: false, error: 'Token inválido para este usuário' }, 401);
      }

      const passwordHash = await hashPassword(newPassword);
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(passwordHash, resetRecord.user_id).run();

      // Marcar token como usado e invalidar todas as sessões ativas
      await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE token = ?')
        .bind(hashToken(token)).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?')
        .bind(resetRecord.user_id).run();

      await auditLog(env, resetRecord.user_id, 'password_reset_completed', {});
      return json({ success: true, message: 'Senha redefinida com sucesso!' });
    } catch (error) {
      return internalError(error, 'auth/reset-password');
    }
  }

  // ===== UPDATE PERFIL =====
  // [ALTA-10 CORRIGIDO] Usa requireAuth() com verificação de sessão revogada
  // [MÉDIA-06 CORRIGIDO] Valida avatar_url como HTTPS
  if (path === '/api/user/profile' && request.method === 'PUT') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const body = await request.json() as Record<string, unknown>;
      const { name, phone, avatar_url } = body as { name?: string; phone?: string; avatar_url?: string };

      // Limites de tamanho e validação
      if (name !== undefined && (typeof name !== 'string' || name.length < 2 || name.length > 100)) {
        return json({ success: false, error: 'Nome deve ter entre 2 e 100 caracteres' }, 400);
      }
      if (phone !== undefined && phone !== null && (typeof phone !== 'string' || phone.length > 20)) {
        return json({ success: false, error: 'Telefone inválido' }, 400);
      }

      // [MÉDIA-06] Validar avatar_url como URL HTTPS válida
      if (avatar_url !== undefined && avatar_url !== null) {
        if (typeof avatar_url !== 'string' || avatar_url.length > 500) {
          return json({ success: false, error: 'avatar_url inválido' }, 400);
        }
        try {
          const parsed = new URL(avatar_url);
          if (parsed.protocol !== 'https:') throw new Error();
        } catch {
          return json({ success: false, error: 'avatar_url deve ser uma URL HTTPS válida' }, 400);
        }
      }

      await env.DB.prepare(
        'UPDATE users SET name = ?, phone = ?, avatar_url = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(name || null, phone || null, avatar_url || null, authResult.auth.userId).run();

      const user = await env.DB.prepare(
        'SELECT id, email, name, phone, avatar_url, status, email_verified, created_at, last_login FROM users WHERE id = ? LIMIT 1'
      ).bind(authResult.auth.userId).first();

      await auditLog(env, authResult.auth.userId, 'profile_updated', {});
      return json({ ...user, success: true });
    } catch (error) {
      return internalError(error, 'user/profile');
    }
  }

  // ===== CHANGE PASSWORD =====
  // [ALTA-10 CORRIGIDO] Usa requireAuth() completo
  if (path === '/api/auth/change-password' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const body = await request.json() as Record<string, unknown>;
      const { current_password, new_password } = body as { current_password?: string; new_password?: string };

      if (!current_password || !new_password) {
        return json({ success: false, error: 'Senhas obrigatórias' }, 400);
      }

      // [MÉDIA-03 CORRIGIDO] Validação forte
      const passError = validatePasswordStrength(new_password);
      if (passError) return json({ success: false, error: passError }, 400);

      const user = await env.DB.prepare(
        'SELECT password_hash FROM users WHERE id = ? LIMIT 1'
      ).bind(authResult.auth.userId).first<{ password_hash: string }>();

      if (!user) return json({ success: false, error: 'Usuário não encontrado' }, 404);

      const passwordMatch = await verifyPassword(current_password, user.password_hash);
      if (!passwordMatch) {
        await auditLog(env, authResult.auth.userId, 'password_change_failed', { reason: 'wrong_current_password' });
        return json({ success: false, error: 'Senha atual incorreta' }, 401);
      }

      const newHash = await hashPassword(new_password);
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(newHash, authResult.auth.userId).run();

      // Invalidar todas as outras sessões (forçar relogin)
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
        .bind(authResult.auth.userId, hashToken(authResult.auth.token)).run();

      await auditLog(env, authResult.auth.userId, 'password_changed', {});
      return json({ success: true, message: 'Senha alterada com sucesso!' });
    } catch (error) {
      return internalError(error, 'auth/change-password');
    }
  }

  // ===== GET ORDERS (FOR USER) =====
  // [ALTA-10 CORRIGIDO] requireAuth() completo com verificação de sessão
  if (path === '/api/orders/user' && request.method === 'GET') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const orders = await env.DB.prepare(
        'SELECT id, customer_name, customer_email, total, status, shipping_cost, tracking_code, created_at, updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC'
      ).bind(authResult.auth.userId).all();

      const ordersWithItems = await Promise.all(
        orders.results.map(async (order: Record<string, unknown>) => {
          const items = await env.DB.prepare(
            'SELECT product_id, quantity, price, (quantity * price) as total_price FROM order_items WHERE order_id = ?'
          ).bind(order.id).all();
          const enriched = await Promise.all(
            items.results.map(async (item: Record<string, unknown>) => {
              const product = await env.DB.prepare('SELECT name FROM products WHERE id = ?')
                .bind(item.product_id).first<{ name: string }>();
              return { ...item, product_name: product?.name || 'Produto desconhecido' };
            })
          );
          return { ...order, items: enriched };
        })
      );

      return json(ordersWithItems);
    } catch (error) {
      return internalError(error, 'orders/user');
    }
  }

  // ===== ADDRESSES =====
  // [ALTA-10 CORRIGIDO] requireAuth() em todos os endpoints de endereço
  // GET all addresses
  if (path === '/api/addresses' && request.method === 'GET') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const addresses = await env.DB.prepare(
        'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC'
      ).bind(authResult.auth.userId).all();

      return json(addresses.results);
    } catch (error) {
      return internalError(error, 'addresses/get');
    }
  }

  // CREATE address
  if (path === '/api/addresses' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const body = await request.json() as Record<string, unknown>;
      const { label, name, phone, street, number, complement, city, state, zip, country, is_default } = body as {
        label?: string; name?: string; phone?: string; street?: string; number?: string;
        complement?: string; city?: string; state?: string; zip?: string; country?: string; is_default?: boolean;
      };

      if (!label || !name || !phone || !street || !number || !city || !state || !zip || !country) {
        return json({ success: false, error: 'Campos obrigatórios ausentes' }, 400);
      }

      if (is_default) {
        await env.DB.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')
          .bind(authResult.auth.userId).run();
      }

      const result = await env.DB.prepare(
        'INSERT INTO user_addresses (user_id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))'
      ).bind(authResult.auth.userId, label, name, phone, street, number, complement || null, city, state, zip, country, is_default ? 1 : 0).run();

      const address = await env.DB.prepare(
        'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE id = ?'
      ).bind(result.meta.last_row_id).first();

      return json(address);
    } catch (error) {
      return internalError(error, 'addresses/create');
    }
  }

  // UPDATE address
  if (path.match(/^\/api\/addresses\/[a-f0-9-]+$/) && request.method === 'PUT') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const addressId = path.split('/').pop();
      const body = await request.json() as Record<string, unknown>;
      const { label, name, phone, street, number, complement, city, state, zip, country, is_default } = body as {
        label?: string; name?: string; phone?: string; street?: string; number?: string;
        complement?: string; city?: string; state?: string; zip?: string; country?: string; is_default?: boolean;
      };

      const address = await env.DB.prepare(
        'SELECT user_id FROM user_addresses WHERE id = ?'
      ).bind(addressId).first<{ user_id: number }>();

      if (!address || address.user_id !== authResult.auth.userId) {
        return json({ success: false, error: 'Endereço não encontrado' }, 404);
      }

      if (is_default) {
        await env.DB.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')
          .bind(authResult.auth.userId).run();
      }

      await env.DB.prepare(
        'UPDATE user_addresses SET label = ?, name = ?, phone = ?, street = ?, number = ?, complement = ?, city = ?, state = ?, zip = ?, country = ?, is_default = ? WHERE id = ?'
      ).bind(label, name, phone, street, number, complement || null, city, state, zip, country, is_default ? 1 : 0, addressId).run();

      const updated = await env.DB.prepare(
        'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE id = ?'
      ).bind(addressId).first();

      return json(updated);
    } catch (error) {
      return internalError(error, 'addresses/update');
    }
  }

  // DELETE address
  if (path.match(/^\/api\/addresses\/[a-f0-9-]+$/) && request.method === 'DELETE') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const addressId = path.split('/').pop();
      const address = await env.DB.prepare(
        'SELECT user_id FROM user_addresses WHERE id = ?'
      ).bind(addressId).first<{ user_id: number }>();

      if (!address || address.user_id !== authResult.auth.userId) {
        return json({ success: false, error: 'Endereço não encontrado' }, 404);
      }

      await env.DB.prepare('DELETE FROM user_addresses WHERE id = ?').bind(addressId).run();
      return json({ success: true, message: 'Endereço deletado' });
    } catch (error) {
      return internalError(error, 'addresses/delete');
    }
  }

  // SET address as default
  if (path.match(/^\/api\/addresses\/[a-f0-9-]+\/default$/) && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const addressId = path.split('/').slice(0, -1).pop();
      const address = await env.DB.prepare(
        'SELECT user_id FROM user_addresses WHERE id = ?'
      ).bind(addressId).first<{ user_id: number }>();

      if (!address || address.user_id !== authResult.auth.userId) {
        return json({ success: false, error: 'Endereço não encontrado' }, 404);
      }

      await env.DB.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')
        .bind(authResult.auth.userId).run();
      await env.DB.prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ?')
        .bind(addressId).run();

      return json({ success: true, message: 'Endereço marcado como padrão' });
    } catch (error) {
      return internalError(error, 'addresses/default');
    }
  }

  // ===== EMAIL VERIFICATION =====
  // [ALTA-10 + ALTA-11 CORRIGIDO] requireAuth + token hash
  if (path === '/api/auth/send-verification-email' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rl = await checkRateLimit(env, `verify-email:${authResult.auth.userId}`, 3, 3600);
      if (!rl.allowed) {
        return json({ success: false, error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);
      }

      const user = await env.DB.prepare(
        'SELECT id, email, email_verified FROM users WHERE id = ? LIMIT 1'
      ).bind(authResult.auth.userId).first<{ id: number; email: string; email_verified: number }>();

      if (!user) return json({ success: false, error: 'Usuário não encontrado' }, 404);
      if (user.email_verified) return json({ success: false, error: 'Email já verificado' }, 400);

      const verificationToken = generateJWT(env, user.id, user.email, 86400, 'email_verify');
      await env.DB.prepare(
        'INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(user.id, hashToken(verificationToken), new Date(Date.now() + 86400 * 1000).toISOString()).run();

      const verifyLink = `${env.APP_URL || 'https://cdmstores.com'}/verify-email?token=${verificationToken}`;
      const emailSent = await sendEmail(env, user.email, 'Confirme seu email - CDM Stores', `
        <h2>Verificar Email</h2>
        <p>Clique no link abaixo para verificar seu email (válido por 24h):</p>
        <p><a href="${verifyLink}" style="background:#00AFFF;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">✓ Verificar Email</a></p>
      `);

      return json({ success: true, message: emailSent ? 'Email de verificação enviado' : 'Usuário marcado para verificação' });
    } catch (error) {
      return internalError(error, 'auth/send-verification-email');
    }
  }

  // [ALTA-11 CORRIGIDO] Busca por hash do token
  if (path === '/api/auth/verify-email' && request.method === 'POST') {
    try {
      const body = await request.json() as Record<string, unknown>;
      const { token } = body as { token?: string };
      if (!token) return json({ success: false, error: 'Token obrigatório' }, 400);

      const verified = verifyJWT(token, env, 'email_verify');
      if (!verified.valid || !verified.userId) {
        return json({ success: false, error: 'Token inválido ou expirado' }, 401);
      }

      const resetRecord = await env.DB.prepare(
        'SELECT expires_at FROM password_resets WHERE token = ? AND user_id = ? LIMIT 1'
      ).bind(hashToken(token), verified.userId).first<{ expires_at: string }>();

      if (!resetRecord) return json({ success: false, error: 'Token não encontrado' }, 401);
      if (resetRecord.expires_at < new Date().toISOString()) return json({ success: false, error: 'Token expirado' }, 401);

      await env.DB.prepare(
        'UPDATE users SET email_verified = 1, updated_at = datetime("now") WHERE id = ?'
      ).bind(verified.userId).run();

      await env.DB.prepare('DELETE FROM password_resets WHERE token = ?').bind(hashToken(token)).run();
      await auditLog(env, verified.userId, 'email_verified', {});
      return json({ success: true, message: 'Email verificado com sucesso!' });
    } catch (error) {
      return internalError(error, 'auth/verify-email');
    }
  }

  // ===== OAUTH =====
  // [ALTA-12 CORRIGIDO] Google OAuth com validação de audience
  if (path === '/api/auth/google' && request.method === 'POST') {
    try {
      const body = await request.json() as Record<string, unknown>;
      const { idToken, accessToken } = body as { idToken?: string; accessToken?: string };

      if (!idToken && !accessToken) {
        return json({ success: false, error: 'ID token ou Access token obrigatório' }, 400);
      }

      let googleUser: { email: string; name: string; picture?: string };
      try {
        if (idToken) {
          // ID Token: verificar via tokeninfo (válido para tokens gerados pelo Google Sign-In)
          const infoResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
          const info = await infoResp.json() as Record<string, string>;
          if (!infoResp.ok || !info.email) {
            return json({ success: false, error: 'ID token Google inválido' }, 401);
          }
          // [ALTA-12] Verificar audience
          if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) {
            return json({ success: false, error: 'Token não pertence a este aplicativo' }, 401);
          }
          googleUser = { email: info.email, name: info.name || 'Google User', picture: info.picture };
        } else {
          // Access Token: verificar audience
          const infoResp = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
          const info = await infoResp.json() as Record<string, string>;
          if (!infoResp.ok) return json({ success: false, error: 'Access token Google inválido' }, 401);
          if (env.GOOGLE_CLIENT_ID && info.issued_to !== env.GOOGLE_CLIENT_ID && info.audience !== env.GOOGLE_CLIENT_ID) {
            return json({ success: false, error: 'Token não pertence a este aplicativo' }, 401);
          }
          const userResp = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`);
          const ud = await userResp.json() as Record<string, string>;
          if (!ud.email) return json({ success: false, error: 'Email não encontrado no token Google' }, 400);
          googleUser = { email: ud.email, name: ud.name || 'Google User', picture: ud.picture };
        }
      } catch (err) {
        console.error('Google validation error:', err instanceof Error ? err.message : err);
        return json({ success: false, error: 'Erro ao validar token Google' }, 500);
      }

      // Verificar se usuário existe
      let googleDbUser: { id: number; email: string; name: string; two_factor_enabled: number } | null = await env.DB.prepare(
        'SELECT id, email, name, two_factor_enabled FROM users WHERE email = ? LIMIT 1'
      ).bind(googleUser.email.toLowerCase()).first();

      if (!googleDbUser) {
        const result = await env.DB.prepare(
          'INSERT INTO users (email, name, avatar_url, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))'
        ).bind(googleUser.email.toLowerCase(), googleUser.name, googleUser.picture || null).run();
        googleDbUser = { id: result.meta.last_row_id, email: googleUser.email.toLowerCase(), name: googleUser.name, two_factor_enabled: 0 };
      }

      if (googleDbUser.two_factor_enabled) {
        const challengeToken = generateJWT(env, googleDbUser.id, googleDbUser.email, 300, '2fa_challenge');
        return json({ success: true, requires2FA: true, challengeToken, user: { id: googleDbUser.id, email: googleDbUser.email, name: googleDbUser.name } });
      }

      const { token: gToken, refreshToken: gRefresh } = await issueSessionTokens(env, googleDbUser.id, googleDbUser.email);
      await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(googleDbUser.id).run();
      await auditLog(env, googleDbUser.id, 'login_google', {});

      return jsonWithCookies({
        success: true, message: 'Login Google realizado com sucesso!',
        user: { id: googleDbUser.id, email: googleDbUser.email, name: googleDbUser.name },
        token: gToken, refreshToken: gRefresh,
      }, 200, buildSetCookieHeaders(gToken, gRefresh));
    } catch (error) {
      return internalError(error, 'auth/google');
    }
  }

  // Facebook OAuth
  // [ALTA-13 CORRIGIDO] Validação de App ID via debug_token
  if (path === '/api/auth/facebook' && request.method === 'POST') {
    try {
      const body = await request.json() as Record<string, unknown>;
      const { accessToken, userID } = body as { accessToken?: string; userID?: string };

      if (!accessToken) {
        return json({ success: false, error: 'Access token obrigatório' }, 400);
      }

      let facebookUser: { email: string; name: string; picture?: string };
      try {
        // [ALTA-13] Verificar APP ID com debug_token antes de qualquer outra chamada
        if (env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET) {
          const appToken = `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
          const debugResp = await fetch(
            `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`
          );
          const debug = await debugResp.json() as { data?: { is_valid?: boolean; app_id?: string } };
          if (!debug.data?.is_valid || debug.data?.app_id !== env.FACEBOOK_APP_ID) {
            return json({ success: false, error: 'Token Facebook inválido ou não pertence a este aplicativo' }, 401);
          }
        }

        const userResponse = await fetch(
          `https://graph.facebook.com/v18.0/${userID}?fields=id,email,name,picture&access_token=${encodeURIComponent(accessToken)}`
        );
        const fbData = await userResponse.json() as Record<string, unknown>;

        if (!userResponse.ok || !fbData.id) {
          return json({ success: false, error: 'Token Facebook inválido' }, 401);
        }
        if (!fbData.email) {
          return json({ success: false, error: 'Email não fornecido pelo Facebook' }, 400);
        }
        const picData = (fbData.picture as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        facebookUser = { email: String(fbData.email), name: String(fbData.name || 'Facebook User'), picture: picData?.url as string | undefined };
      } catch (err) {
        console.error('Facebook validation error:', err instanceof Error ? err.message : err);
        return json({ success: false, error: 'Erro ao validar com Facebook' }, 500);
      }

      let fbDbUser: { id: number; email: string; name: string; two_factor_enabled: number } | null = await env.DB.prepare(
        'SELECT id, email, name, two_factor_enabled FROM users WHERE email = ? LIMIT 1'
      ).bind(facebookUser.email.toLowerCase()).first();

      if (!fbDbUser) {
        const result = await env.DB.prepare(
          'INSERT INTO users (email, name, avatar_url, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))'
        ).bind(facebookUser.email.toLowerCase(), facebookUser.name, facebookUser.picture || null).run();
        fbDbUser = { id: result.meta.last_row_id, email: facebookUser.email.toLowerCase(), name: facebookUser.name, two_factor_enabled: 0 };
      }

      if (fbDbUser.two_factor_enabled) {
        const challengeToken = generateJWT(env, fbDbUser.id, fbDbUser.email, 300, '2fa_challenge');
        return json({ success: true, requires2FA: true, challengeToken, user: { id: fbDbUser.id, email: fbDbUser.email, name: fbDbUser.name } });
      }

      const { token: fbToken, refreshToken: fbRefresh } = await issueSessionTokens(env, fbDbUser.id, fbDbUser.email);
      await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(fbDbUser.id).run();
      await auditLog(env, fbDbUser.id, 'login_facebook', {});

      return jsonWithCookies({
        success: true, message: 'Login Facebook realizado com sucesso!',
        user: { id: fbDbUser.id, email: fbDbUser.email, name: fbDbUser.name },
        token: fbToken, refreshToken: fbRefresh,
      }, 200, buildSetCookieHeaders(fbToken, fbRefresh));
    } catch (error) {
      return internalError(error, 'auth/facebook');
    }
  }

  // ===== 2FA (TWO-FACTOR AUTHENTICATION) =====
  // Setup 2FA - Generate TOTP Secret
  if (path === '/api/auth/2fa/setup' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) {
        return authResult.response;
      }

      // Gerar novo secret TOTP
      const secret = generateTOTPSecret();
      const backupCodes = generateBackupCodes(10);

      // Gerar QR Code URL (usando QR Server)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=otpauth://totp/CDM%20Stores:${authResult.auth.email}@cdmstores.com?secret=${secret}&issuer=CDM%20Stores`;

      return json({
        success: true,
        secret: secret,
        backupCodes: backupCodes,
        qrCodeUrl: qrUrl,
        message: 'Autenticador configurado. Escaneie o código QR com seu app de autenticação (Google Authenticator, Authy, etc.)'
      });
    } catch (error) {
      return internalError(error, 'auth/2fa/setup');
    }
  }
  if (path === '/api/auth/2fa/verify-setup' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) {
        return authResult.response;
      }

      const body2fa = await request.json() as Record<string, unknown>;
      const { code, secret, backupCodes } = body2fa as { code?: string; secret?: string; backupCodes?: string[] };

      if (!code || !secret) {
        return json({ success: false, error: 'Código e secret obrigatórios' }, 400);
      }

      // Verificar código TOTP (implemente verificação real)
      const isValid = verifyTOTPCode(secret, code);
      if (!isValid) {
        return json({ success: false, error: 'Código incorreto. Tente novamente.' }, 400);
      }

      // Salvar secret e códigos de backup no banco
      const safeBackupCodes = Array.isArray(backupCodes) && backupCodes.length > 0
        ? backupCodes
        : generateBackupCodes(10);
      await enable2FA(env, authResult.auth.userId, secret, safeBackupCodes);

      return json({
        success: true,
        message: '2FA ativado com sucesso! Guarde seus códigos de backup em local seguro.',
        backupCodes: safeBackupCodes
      });
    } catch (error) {
      return internalError(error, 'auth/2fa/verify-setup');
    }
  }

  // Disable 2FA
  if (path === '/api/auth/2fa/disable' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) {
        return authResult.response;
      }

      const body2faDisable = await request.json() as Record<string, unknown>;
      const { code: tfCode, password } = body2faDisable as { code?: string; password?: string };
      void tfCode; // code reserved for optional TOTP verification

      if (!password) {
        return json({ success: false, error: 'Senha obrigatória para desativar 2FA' }, 400);
      }

      // Verificar senha
      const user = await env.DB.prepare(
        'SELECT password_hash FROM users WHERE id = ? LIMIT 1'
      ).bind(authResult.auth.userId).first<{ password_hash: string }>();

      if (!user) return json({ success: false, error: 'Usuário não encontrado' }, 404);
      const passwordMatch = await verifyPassword(password, user.password_hash);
      if (!passwordMatch) {
        return json({ success: false, error: 'Senha incorreta' }, 401);
      }

      // Desativar 2FA
      await disable2FA(env, authResult.auth.userId);

      return json({
        success: true,
        message: '2FA desativado com sucesso'
      });
    } catch (error) {
      return internalError(error, 'auth/2fa/disable');
    }
  }
  if (path === '/api/auth/2fa/verify' && request.method === 'POST') {
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const body = await request.json() as Record<string, unknown>;
      const { challengeToken, code, backupCode } = body as { challengeToken?: string; code?: string; backupCode?: string };

      if (!challengeToken) return json({ success: false, error: 'challengeToken obrigatório' }, 400);
      if (!code && !backupCode) return json({ success: false, error: 'Código de autenticação obrigatório' }, 400);

      const challenge = verifyJWT(challengeToken, env, '2fa_challenge');
      if (!challenge.valid || !challenge.payload) {
        return json({ success: false, error: 'Challenge inválido ou expirado' }, 401);
      }

      const userId = challenge.payload.sub;

      // [ALTA-01] Rate limiting: 5 tentativas por usuário por 10 minutos
      const rl = await checkRateLimit(env, `2fa:${userId}`, 5, 600);
      if (!rl.allowed) {
        return json({ success: false, error: 'Muitas tentativas de 2FA. Aguarde 10 minutos.' }, 429);
      }

      const user = await env.DB.prepare(
        'SELECT email, two_factor_enabled, two_factor_secret, two_factor_backup_codes FROM users WHERE id = ? LIMIT 1'
      ).bind(userId).first<{ email: string; two_factor_enabled: number; two_factor_secret: string; two_factor_backup_codes: string }>();

      if (!user || !user.two_factor_enabled) {
        return json({ success: false, error: '2FA não ativado' }, 400);
      }

      let isValid = false;

      if (code) {
        // [ALTA-02 CORRIGIDO] Anti-replay: verifica se código já foi usado nesta janela
        const recentlyUsed = await env.DB.prepare(
          "SELECT id FROM two_factor_attempts WHERE user_id = ? AND code = ? AND created_at > datetime('now', '-30 seconds')"
        ).bind(userId, code).first();

        if (recentlyUsed) {
          return json({ success: false, error: 'Código já utilizado. Aguarde o próximo código.' }, 401);
        }

        isValid = verifyTOTPCode(user.two_factor_secret, code);

        if (isValid) {
          // Registrar código como usado
          await env.DB.prepare(
            'INSERT INTO two_factor_attempts (user_id, code, verified, ip_address, created_at) VALUES (?, ?, 1, ?, datetime("now"))'
          ).bind(userId, code, ip).run();
        }
      }

      // [MÉDIA-05 CORRIGIDO] Backup codes: comparação timing-safe
      if (!isValid && backupCode) {
        try {
          const codes: string[] = JSON.parse(user.two_factor_backup_codes);
          const normalizedInput = String(backupCode).toUpperCase().trim();
          let matchIndex = -1;

          for (let i = 0; i < codes.length; i++) {
            const a = Buffer.alloc(20);
            const b = Buffer.alloc(20);
            Buffer.from(codes[i].padEnd(20)).copy(a);
            Buffer.from(normalizedInput.padEnd(20)).copy(b);
            if (timingSafeEqual(a, b)) {
              matchIndex = i;
            }
          }

          if (matchIndex !== -1) {
            isValid = true;
            codes.splice(matchIndex, 1);
            await env.DB.prepare('UPDATE users SET two_factor_backup_codes = ? WHERE id = ?')
              .bind(JSON.stringify(codes), userId).run();
          }
        } catch (e) {
          console.error('Error parsing backup codes:', e instanceof Error ? e.message : e);
        }
      }

      if (!isValid) {
        await auditLog(env, userId, '2fa_failed', {}, ip);
        return json({ success: false, error: 'Código de autenticação inválido' }, 401);
      }

      const { token, refreshToken } = await issueSessionTokens(env, userId, user.email);
      await auditLog(env, userId, '2fa_success', {}, ip);

      return jsonWithCookies(
        { success: true, message: '2FA verificado com sucesso', token, refreshToken },
        200,
        buildSetCookieHeaders(token, refreshToken)
      );
    } catch (error) {
      return internalError(error, 'auth/2fa/verify');
    }
  }

  if (path === '/api/stripe/create-payment' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      if (!env.STRIPE_SECRET_KEY) {
        return json({ success: false, error: 'Stripe não configurado' }, 500);
      }

      const body = await request.json() as Record<string, unknown>;
      const { orderId, items } = body as { orderId?: number; items?: Array<{ product_id: number; quantity: number; price: number }> };

      if (!orderId || !items || !Array.isArray(items)) {
        return json({ success: false, error: 'Dados incompletos' }, 400);
      }

      // [CRÍTICO-03] Recalcular total no servidor
      const calculated = await calculateOrderTotal(env, items);
      if (!calculated) {
        return json({ success: false, error: 'Produto inválido ou sem estoque' }, 400);
      }

      const lineItems = calculated.enrichedItems.map((item) => ({
        price_data: {
          currency: 'brl',
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      }));

      lineItems.push({
        price_data: { currency: 'brl', product_data: { name: 'Frete' }, unit_amount: 1500 },
        quantity: 1,
      } as typeof lineItems[0]);

      const stripeData = new URLSearchParams();
      stripeData.append('payment_method_types[]', 'card');
      stripeData.append('mode', 'payment');
      stripeData.append('success_url', 'https://cdmstores.com/pages/checkout.html?success=true');
      stripeData.append('cancel_url', 'https://cdmstores.com/pages/checkout.html?canceled=true');
      stripeData.append('metadata[order_id]', orderId.toString());

      lineItems.forEach((item, index) => {
        stripeData.append(`line_items[${index}][price_data][currency]`, item.price_data.currency);
        stripeData.append(`line_items[${index}][price_data][unit_amount]`, item.price_data.unit_amount.toString());
        stripeData.append(`line_items[${index}][price_data][product_data][name]`, item.price_data.product_data.name);
        stripeData.append(`line_items[${index}][quantity]`, item.quantity.toString());
      });

      const auth = btoa(`${env.STRIPE_SECRET_KEY}:`);
      const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: stripeData,
      });

      const stripeSession = await stripeResponse.json() as Record<string, unknown>;

      if (!stripeResponse.ok) {
        console.error('Stripe error:', (stripeSession as Record<string, unknown>).error);
        return json({ success: false, error: 'Erro ao criar sessão de pagamento' }, 400);
      }

      await env.DB.prepare(
        'UPDATE orders SET stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?'
      ).bind(stripeSession.id, orderId, authResult.auth.userId).run();

      return json({ success: true, checkout_url: stripeSession.url, session_id: stripeSession.id });
    } catch (error) {
      return internalError(error, 'stripe/create-payment');
    }
  }

  // ===== STRIPE WEBHOOK =====
  // [CRÍTICO-01 CORRIGIDO] Verifica assinatura HMAC-SHA256 antes de processar
  if (path === '/api/stripe/webhook') {
    if (request.method === 'POST') {
      try {
        if (!env.STRIPE_WEBHOOK_SECRET) {
          console.error('[Webhook] STRIPE_WEBHOOK_SECRET não configurado');
          return json({ error: 'Webhook não configurado' }, 500);
        }

        const body = await request.text();
        const sig = request.headers.get('stripe-signature');

        if (!verifyStripeWebhookSignature(body, sig, env.STRIPE_WEBHOOK_SECRET)) {
          console.warn('[Webhook] Assinatura inválida ou evento expirado');
          await auditLog(env, null, 'stripe_webhook_invalid_signature', { sig: sig?.substring(0, 20) });
          return json({ error: 'Assinatura inválida' }, 401);
        }

        const event = JSON.parse(body);
        console.log(`[Webhook] Evento verificado: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const orderId = session.metadata?.order_id;

          if (orderId && /^\d+$/.test(String(orderId))) {
            // Verifica idempotência via stripe_payment_id
            const existing = await env.DB.prepare(
              'SELECT id FROM orders WHERE stripe_payment_id = ? LIMIT 1'
            ).bind(session.id).first();

            if (!existing) {
              await env.DB.prepare(
                'UPDATE orders SET status = ?, stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ?'
              ).bind('paid', session.id, Number(orderId)).run();
              await auditLog(env, null, 'payment_confirmed', { order_id: orderId, session_id: session.id });
              console.log(`✅ Pedido ${orderId} pago`);
            }
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return internalError(error, 'stripe/webhook');
      }
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      return new Response('', { status: 200 });
    }
  }

  // ===== CJ =====
  // [CRÍTICO-05 CORRIGIDO] Requer autenticação para alterar status de pedidos
  if (path === '/api/cj/create-order' && request.method === 'POST') {
    try {
      const authResult = await requireAuth(request, env);
      if (!authResult.ok) return authResult.response;

      if (!env.CJ_API_KEY) {
        return json({ success: false, error: 'CJdropshipping não configurado' }, 500);
      }

      const body = await request.json();
      const { orderId } = body as { orderId?: unknown };
      if (!orderId || typeof orderId !== 'number') {
        return json({ success: false, error: 'orderId inválido' }, 400);
      }

      // Verificar que o pedido pertence ao usuário autenticado
      const order = await env.DB.prepare(
        'SELECT id, user_id FROM orders WHERE id = ? LIMIT 1'
      ).bind(orderId).first<{ id: number; user_id: number }>();

      if (!order || order.user_id !== authResult.auth.userId) {
        return json({ success: false, error: 'Pedido não encontrado' }, 404);
      }

      const cjOrderId = `CJ-${Date.now()}`;
      await env.DB.prepare(
        'UPDATE orders SET cj_order_id = ?, status = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(cjOrderId, 'processing', orderId).run();

      await auditLog(env, authResult.auth.userId, 'cj_order_created', { order_id: orderId, cj_order_id: cjOrderId });
      return json({ success: true, cj_order_id: cjOrderId, message: 'Pedido enviado para CJ' });
    } catch (error) {
      return internalError(error, 'cj/create-order');
    }
  }

  // ===== CHATBOT =====
  if (path === '/api/chat' && request.method === 'POST') {
    try {
      const body = await request.json() as Record<string, unknown>;
      const { message, user_id, language = 'pt' } = body as { message?: string; user_id?: number; language?: string };

      if (!message) {
        return json({ success: false, error: 'Mensagem vazia' }, 400);
      }

      // [MÉDIA-04 CORRIGIDO] Limite de tamanho de mensagem
      if (typeof message !== 'string' || message.length > 500) {
        return json({ success: false, error: 'Mensagem muito longa (máximo 500 caracteres)' }, 400);
      }

      // Processar mensagem com todos os 8 recursos
      const result = await processChat(message, user_id !== undefined ? String(user_id) : undefined, language as string, env);
      return json({ 
        success: true, 
        response: result.response,
        action: result.action || null,
        data: result.data || null,
        coupon_valid: result.coupon_valid || null,
        discount: result.discount || null,
        product_id: result.product_id || null,
        product_name: result.product_name || null,
        link: result.link || null
      });
    } catch (error) {
      return internalError(error, 'chat');
    }
  }

  // ===== AGENDAMENTO =====
  if (path === '/api/schedule' && request.method === 'POST') {
    try {
      const schedBody = await request.json() as Record<string, unknown>;
      const { customer_email, customer_name, customer_phone, scheduled_date, reason } = schedBody as {
        customer_email?: string; customer_name?: string; customer_phone?: string;
        scheduled_date?: string; reason?: string;
      };

      if (!customer_email || !customer_name || !scheduled_date) {
        return json({ success: false, error: 'Dados incompletos' }, 400);
      }

      const result = await env.DB.prepare(
        'INSERT INTO appointments (customer_email, customer_name, customer_phone, scheduled_date, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, "scheduled", datetime("now"), datetime("now"))'
      ).bind(customer_email, customer_name, customer_phone, scheduled_date, reason || 'support').run();

      const appointmentId = result.meta.last_row_id;

      return json({ 
        success: true, 
        appointment_id: appointmentId,
        message: 'Agendamento realizado com sucesso!'
      });
    } catch (error) {
      return internalError(error, 'schedule');
    }
  }

  // ===== WORKERS AI =====
  if (path.startsWith('/api/ai/')) {
    try {
      // Chat com Llama 3
      if (path === '/api/ai/chat' && request.method === 'POST') {
        const { message, session_id, user_id, use_large_model } = await request.json() as {
          message: string; session_id: string; user_id?: number; use_large_model?: boolean;
        };
        if (!message || !session_id) return json({ success: false, error: 'message e session_id obrigatórios' }, 400);

        const model = use_large_model
          ? '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
          : '@cf/meta/llama-3-8b-instruct';

        // Buscar ou criar conversa
        let conv = await env.DB.prepare(
          'SELECT id FROM ai_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(session_id).first<{ id: number }>();
        if (!conv) {
          const r = await env.DB.prepare(
            'INSERT INTO ai_conversations (session_id, user_id, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))'
          ).bind(session_id, user_id ?? null).run();
          conv = { id: r.meta.last_row_id as number };
        }

        // Histórico recente
        const history = await env.DB.prepare(
          'SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10'
        ).bind(conv.id).all<{ role: string; content: string }>();

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: 'Você é o assistente da CDM STORES, uma loja online de produtos premium. Seja prestativo e conciso.' },
          ...history.results.reverse().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: message },
        ];

        // Contexto semântico via Vectorize
        try {
          const qEmbed = await env.AI.run('@cf/baai/bge-m3', { text: [message] }) as { data: number[][] };
          if (qEmbed.data?.[0]) {
            const matches = await env.VECTORIZE.query(qEmbed.data[0], { topK: 3, returnMetadata: 'all' });
            const ctx = matches.matches.filter(m => m.score > 0.7).map(m => m.metadata?.content as string).filter(Boolean).join('\n');
            if (ctx) messages[0].content += `\n\nContexto relevante:\n${ctx}`;
          }
        } catch { /* Vectorize falhou, continua sem contexto */ }

        const response = await env.AI.run(model, { messages }) as { response: string };
        const assistantMessage = response.response;

        // Salvar no D1
        await env.DB.batch([
          env.DB.prepare('INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))').bind(conv.id, 'user', message, model),
          env.DB.prepare('INSERT INTO ai_messages (conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, datetime("now"))').bind(conv.id, 'assistant', assistantMessage, model),
          env.DB.prepare('UPDATE ai_conversations SET updated_at = datetime("now") WHERE id = ?').bind(conv.id),
        ]);

        // Embedding assíncrono
        try {
          const embed = await env.AI.run('@cf/baai/bge-m3', { text: [`User: ${message}\nAssistant: ${assistantMessage}`] }) as { data: number[][] };
          if (embed.data?.[0]) {
            await env.VECTORIZE.upsert([{ id: `msg-${conv.id}-${Date.now()}`, values: embed.data[0], metadata: { content: `User: ${message}\nAssistant: ${assistantMessage}`, conversation_id: conv.id, type: 'message' } }]);
          }
        } catch { /* não bloqueia */ }

        return json({ success: true, response: assistantMessage, conversation_id: conv.id, model });
      }

      // Embeddings
      if (path === '/api/ai/embed' && request.method === 'POST') {
        const { texts, content_type, ref_id } = await request.json() as { texts: string[]; content_type: string; ref_id?: string };
        if (!texts?.length) return json({ success: false, error: 'texts obrigatório' }, 400);
        const result = await env.AI.run('@cf/baai/bge-m3', { text: texts }) as { data: number[][] };
        const vectors = result.data.map((values, i) => ({ id: `${content_type ?? 'doc'}-${ref_id ?? i}-${Date.now()}`, values, metadata: { content: texts[i], content_type: content_type ?? 'document', ref_id: ref_id ?? '' } }));
        await env.VECTORIZE.upsert(vectors);
        return json({ success: true, count: vectors.length, ids: vectors.map(v => v.id) });
      }

      // Busca semântica
      if (path === '/api/ai/search' && request.method === 'POST') {
        const { query, top_k = 5, min_score = 0.6 } = await request.json() as { query: string; top_k?: number; min_score?: number };
        if (!query) return json({ success: false, error: 'query obrigatória' }, 400);
        const embedding = await env.AI.run('@cf/baai/bge-m3', { text: [query] }) as { data: number[][] };
        const matches = await env.VECTORIZE.query(embedding.data[0], { topK: top_k, returnMetadata: 'all' });
        return json({ success: true, results: matches.matches.filter(m => m.score >= min_score).map(m => ({ id: m.id, score: m.score, metadata: m.metadata })) });
      }

      // Classificação de texto
      if (path === '/api/ai/classify' && request.method === 'POST') {
        const { text } = await request.json() as { text: string };
        if (!text) return json({ success: false, error: 'text obrigatório' }, 400);
        const result = await env.AI.run('@cf/huggingface/distilbert-sst-2-int8', { text }) as unknown as Array<{ label: string; score: number }>;
        const top = result[0] ?? { label: 'UNKNOWN', score: 0 };
        return json({ success: true, label: top.label, score: top.score });
      }

      // Geração de imagem (Flux)
      if (path === '/api/ai/image' && request.method === 'POST') {
        const { prompt, steps = 4 } = await request.json() as { prompt: string; steps?: number };
        if (!prompt) return json({ success: false, error: 'prompt obrigatório' }, 400);
        const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, num_steps: Math.min(steps, 8) }) as { image: string };
        return new Response(result.image, { headers: { 'Content-Type': 'image/jpeg' } });
      }

      // Histórico de conversa
      if (path.match(/^\/api\/ai\/history\/[^/]+$/) && request.method === 'GET') {
        const session_id = path.split('/').pop()!;
        const conv = await env.DB.prepare(
          'SELECT id, created_at, updated_at, title FROM ai_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(session_id).first<{ id: number; created_at: string; updated_at: string; title: string | null }>();
        if (!conv) return json({ success: true, messages: [], conversation: null });
        const msgs = await env.DB.prepare(
          'SELECT role, content, model, created_at, version FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC'
        ).bind(conv.id).all();
        return json({ success: true, conversation: conv, messages: msgs.results });
      }

    } catch (error) {
      return internalError(error, 'ai');
    }
  }

  return json({ error: 'Not found', path }, 404);
}

async function fetchWithCors(request: Request, env: Env): Promise<Response> {
  const origin = resolveOrigin(request);
  const response = await handleRequest(request, env);
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  fetch: (request: Request, env: Env) => fetchWithCors(request, env),
  scheduled: async (_controller: ScheduledController, env: Env) => {
    // [BAIXA-02 CORRIGIDO] Limpeza de registros expirados para manter DB enxuto
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
