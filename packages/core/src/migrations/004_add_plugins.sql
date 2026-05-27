-- Migration 004: Add plugins table
-- Plugin registry for extensible Doorway capabilities

CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  manifest_json TEXT NOT NULL,
  install_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'installed',
  name TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
