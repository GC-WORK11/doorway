/**
 * Doorway Database Module
 * SQLite persistence with WAL mode and event sourcing support.
 *
 * Reliability principle: the application may crash; the user's agent sessions
 * and code state must not be lost.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { PersistenceError, MigrationError } from './errors.js';

export interface DatabaseConfig {
  readonly dataPath: string;
  readonly enableWAL?: boolean;
  readonly enableForeignKeys?: boolean;
}

const DEFAULT_CONFIG: Required<DatabaseConfig> = {
  dataPath: '.doorway',
  enableWAL: true,
  enableForeignKeys: true,
};

/**
 * Create and initialize the Doorway SQLite database.
 */
export function createDatabase(config: DatabaseConfig = DEFAULT_CONFIG): Database.Database {
  const resolved = { ...DEFAULT_CONFIG, ...config };

  // Ensure data directory exists
  if (!existsSync(resolved.dataPath)) {
    mkdirSync(resolved.dataPath, { recursive: true });
  }

  const dbPath = join(resolved.dataPath, 'db.sqlite');

  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (error) {
    throw new PersistenceError(`Failed to open database at ${dbPath}`, { error: String(error) });
  }

  // Configure database settings
  if (resolved.enableWAL) {
    db.pragma('journal_mode = WAL');
  }

  if (resolved.enableForeignKeys) {
    db.pragma('foreign_keys = ON');
  }

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Run database migrations to create all required tables.
 */
function runMigrations(db: Database.Database): void {
  const migrations = [
    // Projects table
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      package_manager TEXT NOT NULL DEFAULT 'unknown',
      framework TEXT,
      project_mode TEXT NOT NULL DEFAULT 'git',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,

    // Threads table
    `CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      goal TEXT NOT NULL,
      permission_mode TEXT NOT NULL DEFAULT 'open',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // Messages table
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT NOT NULL DEFAULT '[]',
      provider TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )`,

    // Tasks table
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'parallel',
      status TEXT NOT NULL DEFAULT 'planned',
      base_commit_sha TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // Task Nodes table
    `CREATE TABLE IF NOT EXISTS task_nodes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      agent_target TEXT,
      worktree_policy TEXT NOT NULL DEFAULT 'isolated',
      acceptance_criteria TEXT,
      assigned_run_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

    // Task Edges table (dependencies)
    `CREATE TABLE IF NOT EXISTS task_edges (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      from_node_id TEXT NOT NULL,
      to_node_id TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (from_node_id) REFERENCES task_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (to_node_id) REFERENCES task_nodes(id) ON DELETE CASCADE
    )`,

    // Review Findings table
    `CREATE TABLE IF NOT EXISTS review_findings (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      suggested_fix TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (node_id) REFERENCES task_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    )`,

    // Project Memory Items table
    `CREATE TABLE IF NOT EXISTS project_memory_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_file TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'rule',
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, source_file),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // Learned pattern memory from real operational evidence
    `CREATE TABLE IF NOT EXISTS pattern_memory_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      summary TEXT NOT NULL,
      occurrences INTEGER NOT NULL,
      confidence REAL NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, kind, pattern_key),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // Provider profiles
    `CREATE TABLE IF NOT EXISTS provider_profiles (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL, -- built_in | custom
      provider_id TEXT NOT NULL, -- openai | anthropic | google | etc
      display_name TEXT NOT NULL,
      base_url TEXT,
      auth_type TEXT NOT NULL, -- api_key | bearer | none
      key_ref TEXT, -- reference to safeStorage
      default_headers_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      scope TEXT NOT NULL DEFAULT 'global', -- global | project
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,

    // Model profiles
    `CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      provider_profile_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT,
      context_window INTEGER,
      max_output_tokens INTEGER,
      supports_streaming INTEGER DEFAULT 1,
      supports_json_schema INTEGER DEFAULT 0,
      supports_tool_calling INTEGER DEFAULT 0,
      supports_vision INTEGER DEFAULT 0,
      pricing_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(provider_profile_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
    )`,

    // Brain role bindings
    `CREATE TABLE IF NOT EXISTS brain_role_bindings (
      role TEXT PRIMARY KEY, -- planner | summarizer | etc
      provider_profile_id TEXT NOT NULL,
      model_profile_id TEXT NOT NULL,
      fallback_role TEXT,
      budget_cap REAL,
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(provider_profile_id) REFERENCES provider_profiles(id),
      FOREIGN KEY(model_profile_id) REFERENCES model_profiles(id)
    )`,

    // Per-thread tool policy
    `CREATE TABLE IF NOT EXISTS thread_tool_permissions (
      thread_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, tool_id),
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )`,

    // Doorway settings
    `CREATE TABLE IF NOT EXISTS doorway_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      updated_at TEXT NOT NULL
    )`,

    // Provider connection tests
    `CREATE TABLE IF NOT EXISTS provider_connection_tests (
      id TEXT PRIMARY KEY,
      provider_profile_id TEXT NOT NULL,
      status TEXT NOT NULL, -- success | failed
      latency_ms INTEGER,
      error_message TEXT,
      tested_at TEXT NOT NULL,
      FOREIGN KEY(provider_profile_id) REFERENCES provider_profiles(id) ON DELETE CASCADE
    )`,

    // Brain invocations (for flight recorder)
    `CREATE TABLE IF NOT EXISTS brain_invocations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      run_id TEXT,
      role TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      prompt_hash TEXT,
      response_hash TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost REAL,
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

    // Worktrees table
    `CREATE TABLE IF NOT EXISTS worktrees (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_run_id TEXT,
      path TEXT NOT NULL UNIQUE,
      branch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      base_commit_sha TEXT,
      created_at TEXT NOT NULL,
      archived_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

    // Terminal sessions table
    `CREATE TABLE IF NOT EXISTS terminal_sessions (
      id TEXT PRIMARY KEY,
      agent_run_id TEXT,
      runtime TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      working_directory TEXT NOT NULL,
      command TEXT,
      pid INTEGER,
      exit_code INTEGER,
      signal TEXT,
      exit_kind TEXT,
      exit_label TEXT,
      exit_summary TEXT,
      exit_recommendation TEXT,
      exit_signal_number INTEGER,
      created_at TEXT NOT NULL,
      started_at TEXT,
      stopped_at TEXT,
      FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    )`,

    // Terminal transcript chunks table
    `CREATE TABLE IF NOT EXISTS terminal_chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_stdout INTEGER NOT NULL DEFAULT 1,
      is_stderr INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, sequence),
      FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
    )`,

    // Terminal input records table
    `CREATE TABLE IF NOT EXISTS terminal_inputs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, sequence),
      FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
    )`,

    // Terminal process snapshots table
    `CREATE TABLE IF NOT EXISTS terminal_process_snapshots (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      root_pid INTEGER NOT NULL,
      nodes_json TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
    )`,

    // Terminal file delta snapshots table
    `CREATE TABLE IF NOT EXISTS terminal_file_delta_snapshots (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      root_path TEXT NOT NULL,
      changes_json TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
    )`,

    // Agent Mesh registered agents table
    `CREATE TABLE IF NOT EXISTS agent_mesh_agents (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      terminal_session_id TEXT,
      worktree_id TEXT,
      run_id TEXT,
      mailbox_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (terminal_session_id) REFERENCES terminal_sessions(id) ON DELETE SET NULL
    )`,

    // Agent Mesh mailbox messages table
    `CREATE TABLE IF NOT EXISTS mesh_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      from_agent_id TEXT NOT NULL,
      to_agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      evidence_refs TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'unhandled',
      requires_human_approval INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      handled_at TEXT,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (from_agent_id) REFERENCES agent_mesh_agents(id) ON DELETE CASCADE,
      FOREIGN KEY (to_agent_id) REFERENCES agent_mesh_agents(id) ON DELETE CASCADE
    )`,

    // Agent Mesh loop guard metrics
    `CREATE TABLE IF NOT EXISTS mesh_loop_metrics (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      route_key TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      repeated_hash_count INTEGER NOT NULL,
      last_content_hash TEXT,
      last_new_evidence_at TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(thread_id, route_key),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )`,

    // Terminal-visible Agent Mesh action blocks
    `CREATE TABLE IF NOT EXISTS terminal_action_blocks (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      terminal_session_id TEXT NOT NULL,
      agent_id TEXT,
      raw_text TEXT NOT NULL,
      parsed_json TEXT NOT NULL,
      validation_status TEXT NOT NULL,
      validation_error TEXT,
      routed_message_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (terminal_session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agent_mesh_agents(id) ON DELETE SET NULL,
      FOREIGN KEY (routed_message_id) REFERENCES mesh_messages(id) ON DELETE SET NULL
    )`,

    // Test proof records table
    `CREATE TABLE IF NOT EXISTS test_proofs (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      terminal_session_id TEXT NOT NULL,
      agent_run_id TEXT,
      label TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      exit_code INTEGER,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (terminal_session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    )`,

    // Agent runs table
    `CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      adapter_id TEXT NOT NULL,
      worktree_id TEXT,
      terminal_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      exit_code INTEGER,
      summary TEXT,
      base_commit_sha TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

    // File changes table
    `CREATE TABLE IF NOT EXISTS file_changes (
      id TEXT PRIMARY KEY,
      worktree_id TEXT NOT NULL,
      agent_run_id TEXT NOT NULL,
      path TEXT NOT NULL,
      change_type TEXT NOT NULL,
      diff TEXT,
      detected_at TEXT NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      )`,
    // Events table (event sourcing)
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )`,

    // Handoff capsules table
    `CREATE TABLE IF NOT EXISTS handoff_capsules (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      source_run_id TEXT NOT NULL,
      target_provider TEXT,
      summary TEXT NOT NULL,
      latest_intent TEXT NOT NULL,
      run_summary TEXT NOT NULL,
      worktree_path TEXT,
      branch TEXT,
      changed_files TEXT NOT NULL DEFAULT '[]',
      diff_summary TEXT NOT NULL,
      test_status TEXT,
      open_questions TEXT NOT NULL DEFAULT '[]',
      next_prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (source_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    )`,

    // Doorway-level compact checkpoints table
    `CREATE TABLE IF NOT EXISTS compact_checkpoints (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      original_goal TEXT NOT NULL,
      current_status TEXT NOT NULL,
      files_changed TEXT NOT NULL DEFAULT '[]',
      commands_run TEXT NOT NULL DEFAULT '[]',
      tests TEXT NOT NULL DEFAULT '[]',
      errors TEXT NOT NULL DEFAULT '[]',
      important_lines TEXT NOT NULL DEFAULT '[]',
      next_action TEXT NOT NULL,
      next_prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )`,

    // Sequence table for event ordering
    `CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    )`,

    // Merge Attempts table
    `CREATE TABLE IF NOT EXISTS merge_attempts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      integration_worktree_id TEXT NOT NULL,
      source_worktree_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      safety_score TEXT NOT NULL DEFAULT 'blocked',
      conflict_count INTEGER NOT NULL DEFAULT 0,
      test_passed BOOLEAN,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

    // MergeJudge assessment records table
    `CREATE TABLE IF NOT EXISTS merge_assessments (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      score TEXT NOT NULL,
      reason TEXT NOT NULL,
      clean_apply INTEGER NOT NULL,
      tests_passed INTEGER NOT NULL,
      high_risk_files TEXT NOT NULL DEFAULT '[]',
      has_approval INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

    // Permission Receipts table
    `CREATE TABLE IF NOT EXISTS permission_receipts (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      task_id TEXT NOT NULL,
      run_id TEXT,
      command TEXT NOT NULL,
      risk_category TEXT NOT NULL,
      decision TEXT NOT NULL,
      user_notes TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

    // Indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pattern_memory_project ON pattern_memory_items(project_id, kind, last_seen_at)`,
    `CREATE INDEX IF NOT EXISTS idx_events_thread ON events(thread_id)`,
    `CREATE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence)`,
    `CREATE INDEX IF NOT EXISTS idx_terminal_chunks_session ON terminal_chunks(session_id, sequence)`,
    `CREATE INDEX IF NOT EXISTS idx_terminal_process_snapshots_session ON terminal_process_snapshots(session_id, captured_at)`,
    `CREATE INDEX IF NOT EXISTS idx_terminal_file_delta_snapshots_session ON terminal_file_delta_snapshots(session_id, captured_at)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_mesh_agents_thread ON agent_mesh_agents(thread_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_mesh_agents_terminal ON agent_mesh_agents(terminal_session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mesh_messages_thread ON mesh_messages(thread_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_mesh_messages_to_agent ON mesh_messages(to_agent_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_mesh_loop_metrics_thread ON mesh_loop_metrics(thread_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_terminal_action_blocks_thread ON terminal_action_blocks(thread_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_terminal_action_blocks_session ON terminal_action_blocks(terminal_session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_test_proofs_thread ON test_proofs(thread_id, started_at)`,
    `CREATE INDEX IF NOT EXISTS idx_test_proofs_terminal ON test_proofs(terminal_session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_thread ON agent_runs(thread_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status)`,
    `CREATE INDEX IF NOT EXISTS idx_worktrees_project ON worktrees(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_worktrees_task ON worktrees(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_file_changes_worktree ON file_changes(worktree_id)`,
    `CREATE INDEX IF NOT EXISTS idx_merge_assessments_thread ON merge_assessments(thread_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_compact_checkpoints_thread ON compact_checkpoints(thread_id, created_at)`,
  ];

  db.transaction(() => {
    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      if (migration === undefined) {
        throw new MigrationError(`Migration ${i + 1} is undefined`, {
          migrationIndex: i,
        });
      }
      try {
        db.exec(migration);
      } catch (error) {
        throw new MigrationError(`Migration ${i + 1} failed: ${migration.substring(0, 100)}...`, {
          error: String(error),
          migrationIndex: i,
        });
      }
    }
  })();

  ensureColumn(db, 'projects', 'project_mode', "TEXT NOT NULL DEFAULT 'git'");
  ensureColumn(db, 'permission_receipts', 'thread_id', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_code', 'INTEGER');
  ensureColumn(db, 'terminal_sessions', 'signal', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_kind', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_label', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_summary', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_recommendation', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_signal_number', 'INTEGER');
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_permission_receipts_thread ON permission_receipts(thread_id, timestamp)'
  );
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

/**
 * Get the next sequence number for events.
 */
export function getNextSequence(db: Database.Database): number {
  const result = db
    .prepare(
      `
    INSERT INTO sequences (name, value) VALUES ('events', 1)
    ON CONFLICT(name) DO UPDATE SET value = value + 1
    RETURNING value
  `
    )
    .get() as { value: number };
  return result.value;
}

/**
 * Close the database connection.
 */
export function closeDatabase(db: Database.Database): void {
  try {
    db.close();
  } catch (error) {
    throw new PersistenceError('Failed to close database', { error: String(error) });
  }
}
