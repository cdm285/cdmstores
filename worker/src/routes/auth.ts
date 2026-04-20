/**
 * CDM STORES — Authentication routes
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * POST /api/auth/logout
 * POST /api/auth/refresh
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 * POST /api/auth/send-verification-email
 * POST /api/auth/verify-email
 * POST /api/auth/change-password
 * POST /api/auth/google
 * POST /api/auth/facebook
 */

import { json, internalError, jsonWithCookies, buildSetCookieHeaders, buildClearCookieHeaders } from '../lib/response.js';
import type { Env } from '../lib/response.js';
import {
  requireAuth, hashPassword, verifyPassword, generateJWT, verifyJWT,
  issueSessionTokens, revokeSessionByAccessToken, hashToken,
} from '../lib/auth.js';
import {
  checkRateLimit, isAccountLocked, recordLoginAttempt, auditLog,
  verifyTurnstile, EMAIL_REGEX, validatePasswordStrength,
} from '../lib/security.js';
import { sendEmail } from '../lib/email.js';

// ─── POST /api/auth/register ──────────────────────────────────────────────────
export async function handleRegister(req: Request, env: Env): Promise<Response> {
  try {
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(env, `register:${ip}`, 5, 3600);
    if (!rl.allowed) {return json({ success: false, error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);}

    const body = await req.json() as Record<string, unknown>;
    const { email, password, name, turnstileToken } = body as {
      email?: string; password?: string; name?: string; turnstileToken?: string;
    };

    if (env.TURNSTILE_SECRET_KEY && !await verifyTurnstile(env, turnstileToken, ip)) {
      return json({ success: false, error: 'Verificação de bot falhou' }, 403);
    }

    if (!email || !password || !name) {
      return json({ success: false, error: 'Campos obrigatórios: email, password, name' }, 400);
    }
    if (typeof name !== 'string' || name.length < 2 || name.length > 100) {
      return json({ success: false, error: 'Nome deve ter entre 2 e 100 caracteres' }, 400);
    }
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_REGEX.test(email)) {
      return json({ success: false, error: 'Email inválido' }, 400);
    }
    if (typeof password !== 'string') {return json({ success: false, error: 'Senha inválida' }, 400);}
    const passError = validatePasswordStrength(password);
    if (passError) {return json({ success: false, error: passError }, 400);}

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
      .bind(email.toLowerCase()).first();
    if (existing) {return json({ success: false, error: 'Email já cadastrado' }, 409);}

    const passwordHash = await hashPassword(password);
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))'
    ).bind(email.toLowerCase(), passwordHash, name.trim()).run();

    const userId = result.meta.last_row_id;
    const { token, refreshToken } = await issueSessionTokens(env, userId, email.toLowerCase());

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

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export async function handleLogin(req: Request, env: Env): Promise<Response> {
  try {
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(env, `login:${ip}`, 10, 300);
    if (!rl.allowed) {return json({ success: false, error: 'Muitas tentativas de login. Aguarde 5 minutos.' }, 429);}

    const body = await req.json() as Record<string, unknown>;
    const { email, password, turnstileToken } = body as { email?: string; password?: string; turnstileToken?: string };

    if (!email || !password) {return json({ success: false, error: 'Email e senha obrigatórios' }, 400);}

    if (env.TURNSTILE_SECRET_KEY && !await verifyTurnstile(env, turnstileToken, ip)) {
      return json({ success: false, error: 'Verificação de bot falhou' }, 403);
    }

    if (await isAccountLocked(env, email)) {
      return json({ success: false, error: 'Conta temporariamente bloqueada. Tente novamente em 15 minutos.' }, 423);
    }

    const user = await env.DB.prepare(
      'SELECT id, email, name, password_hash, status, two_factor_enabled FROM users WHERE email = ? LIMIT 1'
    ).bind(email.toLowerCase()).first<{
      id: number; email: string; name: string; password_hash: string; status: string; two_factor_enabled: number;
    }>();

    const INVALID_CREDENTIALS = 'Email ou senha incorretos';

    if (!user) {
      await recordLoginAttempt(env, email, false, ip);
      return json({ success: false, error: INVALID_CREDENTIALS }, 401);
    }

    if (user.status === 'inactive' || user.status === 'banned') {
      return json({ success: false, error: 'Conta inativa ou suspensa' }, 403);
    }

    const passwordMatch = await verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      await recordLoginAttempt(env, email, false, ip);
      await auditLog(env, user.id, 'login_failed', { reason: 'wrong_password' }, ip);
      return json({ success: false, error: INVALID_CREDENTIALS }, 401);
    }

    // Auto-migrate scrypt → PBKDF2
    if (user.password_hash.startsWith('scrypt$')) {
      const newHash = await hashPassword(password);
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();
    }

    await recordLoginAttempt(env, email, true, ip);

    if (user.two_factor_enabled) {
      const challengeToken = generateJWT(env, user.id, user.email, 300, '2fa_challenge');
      return json({ success: true, requires2FA: true, challengeToken, user: { id: user.id, email: user.email, name: user.name } });
    }

    const { token, refreshToken } = await issueSessionTokens(env, user.id, user.email);
    await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(user.id).run();
    await auditLog(env, user.id, 'login_success', {}, ip);

    return jsonWithCookies(
      { success: true, user: { id: user.id, email: user.email, name: user.name }, token, refreshToken },
      200, buildSetCookieHeaders(token, refreshToken)
    );
  } catch (error) {
    return internalError(error, 'auth/login');
  }
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
export async function handleMe(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {return authResult.response;}

    const user = await env.DB.prepare(
      'SELECT id, email, name, phone, avatar_url, status, email_verified, created_at, last_login FROM users WHERE id = ? LIMIT 1'
    ).bind(authResult.auth.userId).first();

    if (!user) {return json({ success: false, error: 'Usuário não encontrado' }, 404);}
    return json({ success: true, user });
  } catch (error) {
    return internalError(error, 'auth/me');
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
export async function handleLogout(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {return authResult.response;}
    await revokeSessionByAccessToken(env, authResult.auth.token);
    return jsonWithCookies({ success: true, message: 'Logout realizado com sucesso' }, 200, buildClearCookieHeaders());
  } catch (error) {
    return internalError(error, 'auth/logout');
  }
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
export async function handleRefresh(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { refreshToken } = body as { refreshToken?: string };
    if (!refreshToken) {return json({ success: false, error: 'Refresh token obrigatório' }, 400);}

    const verified = verifyJWT(refreshToken, env, 'refresh');
    if (!verified.valid || !verified.payload) {return json({ success: false, error: 'Refresh token inválido' }, 401);}

    const session = await env.DB.prepare(
      'SELECT user_id, refresh_expires_at FROM sessions WHERE refresh_token = ? LIMIT 1'
    ).bind(hashToken(refreshToken)).first<{ user_id: number; refresh_expires_at: string }>();

    if (!session) {return json({ success: false, error: 'Sessão não encontrada' }, 401);}

    if (session.user_id !== verified.payload.sub || session.refresh_expires_at <= new Date().toISOString()) {
      return json({ success: false, error: 'Refresh token expirado ou inválido' }, 401);
    }

    await env.DB.prepare('DELETE FROM sessions WHERE refresh_token = ?').bind(hashToken(refreshToken)).run();

    const rotated = await issueSessionTokens(env, verified.payload.sub, verified.payload.email);
    return jsonWithCookies(
      { success: true, token: rotated.token, refreshToken: rotated.refreshToken },
      200, buildSetCookieHeaders(rotated.token, rotated.refreshToken)
    );
  } catch (error) {
    return internalError(error, 'auth/refresh');
  }
}

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
export async function handleForgotPassword(req: Request, env: Env): Promise<Response> {
  try {
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(env, `forgot-password:${ip}`, 3, 3600);
    if (!rl.allowed) {return json({ success: false, error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);}

    const body = await req.json() as Record<string, unknown>;
    const { email } = body as { email?: string };

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      return json({ success: true, message: 'Se o email existe, receberá um link de reset' });
    }

    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
      .bind(email.toLowerCase()).first<{ id: number }>();
    if (!user) {return json({ success: true, message: 'Se o email existe, receberá um link de reset' });}

    await env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id).run();

    const resetToken = generateJWT(env, user.id, email.toLowerCase(), 3600, 'password_reset');
    const expiresAt  = new Date(Date.now() + 3600 * 1000).toISOString();
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

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
export async function handleResetPassword(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { token, newPassword } = body as { token?: string; newPassword?: string };
    if (!token || !newPassword) {return json({ success: false, error: 'Token e nova senha obrigatórios' }, 400);}

    const passError = validatePasswordStrength(newPassword);
    if (passError) {return json({ success: false, error: passError }, 400);}

    const jwtCheck = verifyJWT(token, env, 'password_reset');
    if (!jwtCheck.valid || !jwtCheck.payload) {return json({ success: false, error: 'Token inválido ou expirado' }, 401);}

    const resetRecord = await env.DB.prepare(
      'SELECT user_id, expires_at, used FROM password_resets WHERE token = ? LIMIT 1'
    ).bind(hashToken(token)).first<{ user_id: number; expires_at: string; used: number }>();

    if (!resetRecord || resetRecord.used)                        {return json({ success: false, error: 'Token inválido' }, 401);}
    if (resetRecord.expires_at < new Date().toISOString())       {return json({ success: false, error: 'Token expirado' }, 401);}
    if (resetRecord.user_id !== jwtCheck.payload.sub)            {return json({ success: false, error: 'Token inválido para este usuário' }, 401);}

    const passwordHash = await hashPassword(newPassword);
    await env.DB.prepare(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(passwordHash, resetRecord.user_id).run();

    await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').bind(hashToken(token)).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(resetRecord.user_id).run();
    await auditLog(env, resetRecord.user_id, 'password_reset_completed', {});
    return json({ success: true, message: 'Senha redefinida com sucesso!' });
  } catch (error) {
    return internalError(error, 'auth/reset-password');
  }
}

// ─── POST /api/auth/send-verification-email ───────────────────────────────────
export async function handleSendVerificationEmail(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {return authResult.response;}

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(env, `verify-email:${authResult.auth.userId}`, 3, 3600);
    if (!rl.allowed) {return json({ success: false, error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);}

    const user = await env.DB.prepare(
      'SELECT id, email, email_verified FROM users WHERE id = ? LIMIT 1'
    ).bind(authResult.auth.userId).first<{ id: number; email: string; email_verified: number }>();

    if (!user)              {return json({ success: false, error: 'Usuário não encontrado' }, 404);}
    if (user.email_verified) {return json({ success: false, error: 'Email já verificado' }, 400);}

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
    void ip;
    return json({ success: true, message: emailSent ? 'Email de verificação enviado' : 'Usuário marcado para verificação' });
  } catch (error) {
    return internalError(error, 'auth/send-verification-email');
  }
}

// ─── POST /api/auth/verify-email ──────────────────────────────────────────────
export async function handleVerifyEmail(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { token } = body as { token?: string };
    if (!token) {return json({ success: false, error: 'Token obrigatório' }, 400);}

    const verified = verifyJWT(token, env, 'email_verify');
    if (!verified.valid || !verified.userId) {return json({ success: false, error: 'Token inválido ou expirado' }, 401);}

    const resetRecord = await env.DB.prepare(
      'SELECT expires_at FROM password_resets WHERE token = ? AND user_id = ? LIMIT 1'
    ).bind(hashToken(token), verified.userId).first<{ expires_at: string }>();

    if (!resetRecord)                                        {return json({ success: false, error: 'Token não encontrado' }, 401);}
    if (resetRecord.expires_at < new Date().toISOString())  {return json({ success: false, error: 'Token expirado' }, 401);}

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

// ─── POST /api/auth/change-password ──────────────────────────────────────────
export async function handleChangePassword(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {return authResult.response;}

    const body = await req.json() as Record<string, unknown>;
    const { current_password, new_password } = body as { current_password?: string; new_password?: string };
    if (!current_password || !new_password) {return json({ success: false, error: 'Senhas obrigatórias' }, 400);}

    const passError = validatePasswordStrength(new_password);
    if (passError) {return json({ success: false, error: passError }, 400);}

    const user = await env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ? LIMIT 1'
    ).bind(authResult.auth.userId).first<{ password_hash: string }>();
    if (!user) {return json({ success: false, error: 'Usuário não encontrado' }, 404);}

    const passwordMatch = await verifyPassword(current_password, user.password_hash);
    if (!passwordMatch) {
      await auditLog(env, authResult.auth.userId, 'password_change_failed', { reason: 'wrong_current_password' });
      return json({ success: false, error: 'Senha atual incorreta' }, 401);
    }

    const newHash = await hashPassword(new_password);
    await env.DB.prepare(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(newHash, authResult.auth.userId).run();

    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
      .bind(authResult.auth.userId, hashToken(authResult.auth.token)).run();

    await auditLog(env, authResult.auth.userId, 'password_changed', {});
    return json({ success: true, message: 'Senha alterada com sucesso!' });
  } catch (error) {
    return internalError(error, 'auth/change-password');
  }
}

// ─── POST /api/auth/google ────────────────────────────────────────────────────
export async function handleGoogleAuth(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { idToken, accessToken } = body as { idToken?: string; accessToken?: string };
    if (!idToken && !accessToken) {return json({ success: false, error: 'ID token ou Access token obrigatório' }, 400);}

    let googleUser: { email: string; name: string; picture?: string };
    try {
      if (idToken) {
        const infoResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        const info = await infoResp.json() as Record<string, string>;
        if (!infoResp.ok || !info.email) {return json({ success: false, error: 'ID token Google inválido' }, 401);}
        if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) {
          return json({ success: false, error: 'Token não pertence a este aplicativo' }, 401);
        }
        googleUser = { email: info.email, name: info.name || 'Google User', picture: info.picture };
      } else {
        const infoResp = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
        const info = await infoResp.json() as Record<string, string>;
        if (!infoResp.ok) {return json({ success: false, error: 'Access token Google inválido' }, 401);}
        if (env.GOOGLE_CLIENT_ID && info.issued_to !== env.GOOGLE_CLIENT_ID && info.audience !== env.GOOGLE_CLIENT_ID) {
          return json({ success: false, error: 'Token não pertence a este aplicativo' }, 401);
        }
        const userResp = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`);
        const ud = await userResp.json() as Record<string, string>;
        if (!ud.email) {return json({ success: false, error: 'Email não encontrado no token Google' }, 400);}
        googleUser = { email: ud.email, name: ud.name || 'Google User', picture: ud.picture };
      }
    } catch (err) {
      console.error('Google validation error:', err instanceof Error ? err.message : err);
      return json({ success: false, error: 'Erro ao validar token Google' }, 500);
    }

    let dbUser: { id: number; email: string; name: string; two_factor_enabled: number } | null =
      await env.DB.prepare('SELECT id, email, name, two_factor_enabled FROM users WHERE email = ? LIMIT 1')
        .bind(googleUser.email.toLowerCase()).first();

    if (!dbUser) {
      const r = await env.DB.prepare(
        'INSERT INTO users (email, name, avatar_url, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))'
      ).bind(googleUser.email.toLowerCase(), googleUser.name, googleUser.picture || null).run();
      dbUser = { id: r.meta.last_row_id, email: googleUser.email.toLowerCase(), name: googleUser.name, two_factor_enabled: 0 };
    }

    if (dbUser.two_factor_enabled) {
      const challengeToken = generateJWT(env, dbUser.id, dbUser.email, 300, '2fa_challenge');
      return json({ success: true, requires2FA: true, challengeToken, user: { id: dbUser.id, email: dbUser.email, name: dbUser.name } });
    }

    const { token, refreshToken } = await issueSessionTokens(env, dbUser.id, dbUser.email);
    await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(dbUser.id).run();
    await auditLog(env, dbUser.id, 'login_google', {});

    return jsonWithCookies({
      success: true, message: 'Login Google realizado com sucesso!',
      user: { id: dbUser.id, email: dbUser.email, name: dbUser.name },
      token, refreshToken,
    }, 200, buildSetCookieHeaders(token, refreshToken));
  } catch (error) {
    return internalError(error, 'auth/google');
  }
}

// ─── POST /api/auth/facebook ──────────────────────────────────────────────────
export async function handleFacebookAuth(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { accessToken, userID } = body as { accessToken?: string; userID?: string };
    if (!accessToken) {return json({ success: false, error: 'Access token obrigatório' }, 400);}

    let fbUser: { email: string; name: string; picture?: string };
    try {
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
      if (!userResponse.ok || !fbData.id) {return json({ success: false, error: 'Token Facebook inválido' }, 401);}
      if (!fbData.email)                   {return json({ success: false, error: 'Email não fornecido pelo Facebook' }, 400);}
      const picData = (fbData.picture as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      fbUser = { email: String(fbData.email), name: String(fbData.name || 'Facebook User'), picture: picData?.url as string | undefined };
    } catch (err) {
      console.error('Facebook validation error:', err instanceof Error ? err.message : err);
      return json({ success: false, error: 'Erro ao validar com Facebook' }, 500);
    }

    let dbUser: { id: number; email: string; name: string; two_factor_enabled: number } | null =
      await env.DB.prepare('SELECT id, email, name, two_factor_enabled FROM users WHERE email = ? LIMIT 1')
        .bind(fbUser.email.toLowerCase()).first();

    if (!dbUser) {
      const r = await env.DB.prepare(
        'INSERT INTO users (email, name, avatar_url, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))'
      ).bind(fbUser.email.toLowerCase(), fbUser.name, fbUser.picture || null).run();
      dbUser = { id: r.meta.last_row_id, email: fbUser.email.toLowerCase(), name: fbUser.name, two_factor_enabled: 0 };
    }

    if (dbUser.two_factor_enabled) {
      const challengeToken = generateJWT(env, dbUser.id, dbUser.email, 300, '2fa_challenge');
      return json({ success: true, requires2FA: true, challengeToken, user: { id: dbUser.id, email: dbUser.email, name: dbUser.name } });
    }

    const { token, refreshToken } = await issueSessionTokens(env, dbUser.id, dbUser.email);
    await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(dbUser.id).run();
    await auditLog(env, dbUser.id, 'login_facebook', {});

    return jsonWithCookies({
      success: true, message: 'Login Facebook realizado com sucesso!',
      user: { id: dbUser.id, email: dbUser.email, name: dbUser.name },
      token, refreshToken,
    }, 200, buildSetCookieHeaders(token, refreshToken));
  } catch (error) {
    return internalError(error, 'auth/facebook');
  }
}
