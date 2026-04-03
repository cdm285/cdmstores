-- Migration 006: Security Hardening Tables
-- Aplica hardening conforme OWASP ASVS L2/L3, NIST SP 800-63B, PCI-DSS

-- ─── RATE LIMITING ────────────────────────────────────────────────────────────
-- Rastreia tentativas por chave (ip:action, email:action, etc.)
CREATE TABLE IF NOT EXISTS rate_limit_attempts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  key       TEXT    NOT NULL,             -- ex: 'login:user@email.com' ou 'login:1.2.3.4'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time ON rate_limit_attempts(key, created_at);

-- ─── ACCOUNT LOCKOUT ──────────────────────────────────────────────────────────
-- Bloqueia contas após N tentativas de login falhas (NIST SP 800-63B)
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  success    INTEGER NOT NULL DEFAULT 0,  -- 0 = falha, 1 = sucesso
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);

CREATE TABLE IF NOT EXISTS account_lockouts (
  email        TEXT PRIMARY KEY,
  locked_until DATETIME NOT NULL,
  reason       TEXT DEFAULT 'too_many_failed_attempts',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── AUDIT LOG ────────────────────────────────────────────────────────────────
-- Log imutável de eventos de segurança (OWASP ASVS 7.2.1, PCI-DSS 10.2)
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  action     TEXT    NOT NULL,  -- 'login', 'logout', 'register', 'password_change', '2fa_enable', etc.
  details    TEXT,              -- JSON com contexto adicional
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id  ON audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action   ON audit_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log(created_at);

-- ─── TOTP ANTI-REPLAY ─────────────────────────────────────────────────────────
-- (tabela two_factor_attempts já existe em 005, garantir coluna ip_address)
ALTER TABLE two_factor_attempts ADD COLUMN ip_address TEXT;

-- ─── CLEANUP: corrigir tabela password_resets sem coluna 'used' (segurança) ───
-- Já existe da migration 004; garantir índice para lookup por hash
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_expires ON password_resets(user_id, expires_at);
