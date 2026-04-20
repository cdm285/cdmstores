/**
 * CDM STORES — Two-Factor Authentication routes
 * POST /api/auth/2fa/setup
 * POST /api/auth/2fa/verify-setup
 * POST /api/auth/2fa/disable
 * POST /api/auth/2fa/verify
 */

import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { json, internalError, jsonWithCookies, buildSetCookieHeaders } from '../lib/response.js';
import type { Env } from '../lib/response.js';
import { requireAuth, verifyJWT, issueSessionTokens, generateTOTPSecret, generateBackupCodes, verifyTOTPCode, enable2FA, disable2FA, verifyPassword } from '../lib/auth.js';
import { checkRateLimit, auditLog } from '../lib/security.js';

// ─── POST /api/auth/2fa/setup ─────────────────────────────────────────────────
export async function handle2FASetup(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {return authResult.response;}

    const secret      = generateTOTPSecret();
    const backupCodes = generateBackupCodes(10);
    const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=otpauth://totp/CDM%20Stores:${authResult.auth.email}@cdmstores.com?secret=${secret}&issuer=CDM%20Stores`;

    return json({ success: true, secret, backupCodes, qrCodeUrl: qrUrl,
      message: 'Autenticador configurado. Escaneie o código QR com seu app de autenticação (Google Authenticator, Authy, etc.)' });
  } catch (error) {
    return internalError(error, 'auth/2fa/setup');
  }
}

// ─── POST /api/auth/2fa/verify-setup ─────────────────────────────────────────
export async function handle2FAVerifySetup(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {return authResult.response;}

    const body = await req.json() as Record<string, unknown>;
    const { code, secret, backupCodes } = body as { code?: string; secret?: string; backupCodes?: string[] };
    if (!code || !secret) {return json({ success: false, error: 'Código e secret obrigatórios' }, 400);}

    if (!verifyTOTPCode(secret, code)) {return json({ success: false, error: 'Código incorreto. Tente novamente.' }, 400);}

    const safeBackupCodes = Array.isArray(backupCodes) && backupCodes.length > 0
      ? backupCodes
      : generateBackupCodes(10);
    await enable2FA(env, authResult.auth.userId, secret, safeBackupCodes);

    return json({ success: true, message: '2FA ativado com sucesso! Guarde seus códigos de backup em local seguro.', backupCodes: safeBackupCodes });
  } catch (error) {
    return internalError(error, 'auth/2fa/verify-setup');
  }
}

// ─── POST /api/auth/2fa/disable ───────────────────────────────────────────────
export async function handle2FADisable(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {return authResult.response;}

    const body = await req.json() as Record<string, unknown>;
    const { password } = body as { password?: string };
    if (!password) {return json({ success: false, error: 'Senha obrigatória para desativar 2FA' }, 400);}

    const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1')
      .bind(authResult.auth.userId).first<{ password_hash: string }>();
    if (!user) {return json({ success: false, error: 'Usuário não encontrado' }, 404);}

    if (!await verifyPassword(password, user.password_hash)) {
      return json({ success: false, error: 'Senha incorreta' }, 401);
    }

    await disable2FA(env, authResult.auth.userId);
    return json({ success: true, message: '2FA desativado com sucesso' });
  } catch (error) {
    return internalError(error, 'auth/2fa/disable');
  }
}

// ─── POST /api/auth/2fa/verify ────────────────────────────────────────────────
export async function handle2FAVerify(req: Request, env: Env): Promise<Response> {
  try {
    const ip   = req.headers.get('CF-Connecting-IP') || 'unknown';
    const body = await req.json() as Record<string, unknown>;
    const { challengeToken, code, backupCode } = body as { challengeToken?: string; code?: string; backupCode?: string };

    if (!challengeToken)        {return json({ success: false, error: 'challengeToken obrigatório' }, 400);}
    if (!code && !backupCode)   {return json({ success: false, error: 'Código de autenticação obrigatório' }, 400);}

    const challenge = verifyJWT(challengeToken, env, '2fa_challenge');
    if (!challenge.valid || !challenge.payload) {return json({ success: false, error: 'Challenge inválido ou expirado' }, 401);}

    const userId = challenge.payload.sub;

    const rl = await checkRateLimit(env, `2fa:${userId}`, 5, 600);
    if (!rl.allowed) {return json({ success: false, error: 'Muitas tentativas de 2FA. Aguarde 10 minutos.' }, 429);}

    const user = await env.DB.prepare(
      'SELECT email, two_factor_enabled, two_factor_secret, two_factor_backup_codes FROM users WHERE id = ? LIMIT 1'
    ).bind(userId).first<{ email: string; two_factor_enabled: number; two_factor_secret: string; two_factor_backup_codes: string }>();

    if (!user || !user.two_factor_enabled) {return json({ success: false, error: '2FA não ativado' }, 400);}

    let isValid = false;

    if (code) {
      // Anti-replay: reject codes used in the last 30 seconds
      const recentlyUsed = await env.DB.prepare(
        "SELECT id FROM two_factor_attempts WHERE user_id = ? AND code = ? AND created_at > datetime('now', '-30 seconds')"
      ).bind(userId, code).first();
      if (recentlyUsed) {return json({ success: false, error: 'Código já utilizado. Aguarde o próximo código.' }, 401);}

      isValid = verifyTOTPCode(user.two_factor_secret, code);
      if (isValid) {
        await env.DB.prepare(
          'INSERT INTO two_factor_attempts (user_id, code, verified, ip_address, created_at) VALUES (?, ?, 1, ?, datetime("now"))'
        ).bind(userId, code, ip).run();
      }
    }

    if (!isValid && backupCode) {
      try {
        const codes: string[]  = JSON.parse(user.two_factor_backup_codes);
        const normalizedInput  = String(backupCode).toUpperCase().trim();
        let matchIndex         = -1;

        for (let i = 0; i < codes.length; i++) {
          const a = Buffer.alloc(20);
          const b = Buffer.alloc(20);
          Buffer.from(codes[i].padEnd(20)).copy(a);
          Buffer.from(normalizedInput.padEnd(20)).copy(b);
          if (timingSafeEqual(a, b)) {matchIndex = i;}
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
      200, buildSetCookieHeaders(token, refreshToken)
    );
  } catch (error) {
    return internalError(error, 'auth/2fa/verify');
  }
}
