-- Migration 002: Add exit_taxonomy table
-- Unified classification of terminal session exits with structured metadata

CREATE TABLE IF NOT EXISTS exit_taxonomy (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  classification TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  exit_code INTEGER,
  signal TEXT,
  is_crash INTEGER NOT NULL DEFAULT 0,
  is_oom INTEGER NOT NULL DEFAULT 0,
  is_panic INTEGER NOT NULL DEFAULT 0,
  is_timeout INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exit_taxonomy_session ON exit_taxonomy(session_id);
CREATE INDEX IF NOT EXISTS idx_exit_taxonomy_classification ON exit_taxonomy(classification);
