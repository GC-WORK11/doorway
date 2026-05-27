-- Migration 005: Automation Event Triggers
-- Support for reactive event-based automation triggers

-- Event triggers for automations
CREATE TABLE IF NOT EXISTS automation_event_triggers (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  pattern TEXT,
  path_filter TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

-- Indexes for event trigger queries
CREATE INDEX IF NOT EXISTS idx_automation_event_triggers_automation ON automation_event_triggers(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_event_triggers_enabled ON automation_event_triggers(enabled);
CREATE INDEX IF NOT EXISTS idx_automation_event_triggers_type ON automation_event_triggers(trigger_type);
