-- Migration 003: Add evidence table
-- Unified table for tracking evidence across all agent operations

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  type TEXT NOT NULL,
  kind TEXT NOT NULL,
  projection TEXT NOT NULL,
  source_table TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_thread ON evidence(thread_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(type);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source_table, source_id);
