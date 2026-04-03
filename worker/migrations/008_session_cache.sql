-- Migration 008: Session Cache for Agent Short-Term Memory
-- Used by ShortMemoryAgent (05) when KV binding is not available
-- TTL is enforced by the expires_at column (agents filter on datetime("now"))

CREATE TABLE IF NOT EXISTS session_cache (
  session_id TEXT PRIMARY KEY,
  context    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_cache_expires
  ON session_cache (expires_at);
