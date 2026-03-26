-- Migration 005: Add 2FA support
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN two_factor_backup_codes TEXT;

-- Create 2FA attempts table for rate limiting
CREATE TABLE IF NOT EXISTS two_factor_attempts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_2fa_attempts_user ON two_factor_attempts(user_id);
CREATE INDEX idx_2fa_attempts_code ON two_factor_attempts(code);
