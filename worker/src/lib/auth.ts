/**
 * CDM STORES — Authentication utilities
 * JWT, sessions, PBKDF2/scrypt password hashing, TOTP (RFC 6238), 2FA.
 * nodejs_compat required (wrangler.toml).
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { Env } from './response.js';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './response.js';

// ─── Constants ────────────────────────────────────────────────────────────────
export type TokenType = 'access' | 'refresh' | 'password_reset' | 'email_verify' | '2fa_challenge';

export interface JWTPayload {
  sub  : number;
  email: string;
  type : TokenType;
  iat  : number;
  exp  : number;
  jti  : string;
}

export interface JWTVerifyResult {
  valid    : boolean;
  payload ?: JWTPayload;
  userId  ?: number;
  email   ?: string;
}

export interface AuthContext {
  userId: number;
  email : string;
  token : string;
  jti   : string;
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {binary += String.fromCharCode(byte);}
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded     = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded    = atob(padded);
  const bytes      = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {bytes[i] = decoded.charCodeAt(i);}
  return bytes;
}

// ─── Base32 (for TOTP secrets) ────────────────────────────────────────────────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) {output += B32_ALPHABET[(value << (5 - bits)) & 31];}
  return output;
}

export function base32Decode(secret: string): Uint8Array {
  const clean = secret.replace(/\s|=/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) {throw new Error('TOTP secret inválido (base32)');}
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

// ─── JWT ──────────────────────────────────────────────────────────────────────
export function getJwtSecret(env: Env): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET ausente ou fraco. Use no mínimo 32 caracteres aleatórios.');
  }
  return env.JWT_SECRET;
}

function hmacSha256Base64Url(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateJWT(
  env: Env,
  userId: number,
  email: string,
  expiresIn: number = ACCESS_TOKEN_TTL_SECONDS,
  type: TokenType    = 'access',
): string {
  const header  = { alg: 'HS256', typ: 'JWT' };
  const now     = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: userId, email, type, iat: now,
    exp: now + expiresIn, jti: crypto.randomUUID(),
  };
  const h = base64UrlEncodeString(JSON.stringify(header));
  const p = base64UrlEncodeString(JSON.stringify(payload));
  const sig = hmacSha256Base64Url(getJwtSecret(env), `${h}.${p}`);
  return `${h}.${p}.${sig}`;
}

export function verifyJWT(token: string, env: Env, expectedType?: TokenType): JWTVerifyResult {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {return { valid: false };}
    const [headerB64, payloadB64, signature] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(headerB64)));
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') {return { valid: false };}

    const expected = hmacSha256Base64Url(getJwtSecret(env), `${headerB64}.${payloadB64}`);
    const sigA = Buffer.from(signature), sigB = Buffer.from(expected);
    if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {return { valid: false };}

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64))
    ) as JWTPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload.sub || !payload.email || !payload.exp || !payload.iat || !payload.type || !payload.jti) {return { valid: false };}
    if (payload.exp <= now || payload.iat > now + 60) {return { valid: false };}
    if (expectedType && payload.type !== expectedType) {return { valid: false };}

    return { valid: true, payload, userId: payload.sub, email: payload.email };
  } catch {
    return { valid: false };
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export async function createSession(
  env             : Env,
  userId          : number,
  accessToken     : string,
  refreshToken    : string,
  accessExpiresAt : string,
  refreshExpiresAt: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO sessions (user_id, token, refresh_token, expires_at, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
  ).bind(userId, hashToken(accessToken), hashToken(refreshToken), accessExpiresAt, refreshExpiresAt).run();
}

export async function issueSessionTokens(
  env   : Env,
  userId: number,
  email : string,
): Promise<{ token: string; refreshToken: string }> {
  const token        = generateJWT(env, userId, email, ACCESS_TOKEN_TTL_SECONDS,  'access');
  const refreshToken = generateJWT(env, userId, email, REFRESH_TOKEN_TTL_SECONDS, 'refresh');
  const expiresAt        = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS  * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await createSession(env, userId, token, refreshToken, expiresAt, refreshExpiresAt);
  return { token, refreshToken };
}

export async function revokeSessionByAccessToken(env: Env, accessToken: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hashToken(accessToken)).run();
}

export async function requireAuth(
  request: Request,
  env    : Env,
): Promise<{ ok: true; auth: AuthContext } | { ok: false; response: Response }> {
  // Lazy import to avoid circular — response.ts must not import auth.ts
  const { json } = await import('./response.js');

  let token: string | null = null;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {token = authHeader.substring(7);}

  if (!token) {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      for (const part of cookieHeader.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name.trim() === 'auth_token') { token = rest.join('=').trim(); break; }
      }
    }
  }

  if (!token) {return { ok: false, response: json({ success: false, error: 'Token não fornecido' }, 401) };}

  const verified = verifyJWT(token, env, 'access');
  if (!verified.valid || !verified.payload) {
    return { ok: false, response: json({ success: false, error: 'Token inválido ou expirado' }, 401) };
  }

  const session = await env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ? LIMIT 1'
  ).bind(hashToken(token)).first<{ user_id: number; expires_at: string }>();

  if (!session || session.user_id !== verified.payload.sub) {
    return { ok: false, response: json({ success: false, error: 'Sessão revogada ou inexistente' }, 401) };
  }
  if (session.expires_at <= new Date().toISOString()) {
    return { ok: false, response: json({ success: false, error: 'Sessão expirada' }, 401) };
  }

  return {
    ok: true,
    auth: { userId: verified.payload.sub, email: verified.payload.email, token, jti: verified.payload.jti },
  };
}

// ─── Password (PBKDF2 + scrypt legacy migration) ──────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt    = crypto.getRandomValues(new Uint8Array(16));
  const key     = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const buf     = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, key, 256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `pbkdf2$600000$${saltB64}$${hashB64}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    if (storedHash.startsWith('pbkdf2$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 4) {return false;}
      const iterations = Number(parts[1]);
      if (!Number.isInteger(iterations) || iterations < 100_000) {return false;}
      const salt         = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
      const expectedHash = Uint8Array.from(atob(parts[3]), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const buf = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
      const candidate = new Uint8Array(buf);
      if (candidate.length !== expectedHash.length) {return false;}
      return timingSafeEqual(candidate, expectedHash);
    }

    if (storedHash.startsWith('scrypt$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 6) {return false;}
      const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
      const salt     = Buffer.from(parts[4], 'hex');
      const expected = Buffer.from(parts[5], 'hex');
      const candidate = Buffer.from(scryptSync(password, salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 }));
      if (candidate.length !== expected.length) {return false;}
      return timingSafeEqual(candidate, expected);
    }

    return false;
  } catch {
    return false;
  }
}

// ─── TOTP (RFC 6238) ──────────────────────────────────────────────────────────
export function generateTOTPSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(5).toString('hex').toUpperCase());
}

export function verifyTOTPCode(secret: string, code: string, timeWindow = 1): boolean {
  if (!code || code.length !== 6 || !/^\d+$/.test(code)) {return false;}
  try {
    const key    = base32Decode(secret);
    const now    = Math.floor(Date.now() / 1000);
    const period = 30;
    for (let offset = -timeWindow; offset <= timeWindow; offset++) {
      const counter       = Math.floor((now + offset * period) / period);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigUInt64BE(BigInt(counter));
      const hmac        = createHmac('sha1', Buffer.from(key)).update(counterBuffer).digest();
      const offsetNibble = hmac[hmac.length - 1] & 0x0f;
      const binaryCode  =
        ((hmac[offsetNibble]     & 0x7f) << 24) |
        ((hmac[offsetNibble + 1] & 0xff) << 16) |
        ((hmac[offsetNibble + 2] & 0xff) <<  8) |
        ( hmac[offsetNibble + 3] & 0xff);
      const otp = (binaryCode % 1_000_000).toString().padStart(6, '0');
      if (timingSafeEqual(Buffer.from(otp), Buffer.from(code))) {return true;}
    }
    return false;
  } catch {
    return false;
  }
}

// ─── 2FA DB helpers ───────────────────────────────────────────────────────────
export async function enable2FA(env: Env, userId: number, secret: string, backupCodes: string[]): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, two_factor_backup_codes = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(secret, JSON.stringify(backupCodes), userId).run();
}

export async function disable2FA(env: Env, userId: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_backup_codes = NULL, updated_at = datetime("now") WHERE id = ?'
  ).bind(userId).run();
}
