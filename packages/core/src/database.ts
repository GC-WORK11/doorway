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
import { runMigrations } from './run-migrations.js';

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

  // Run migrations from external files
  runMigrations(db);

  // Handle legacy column additions for backward compatibility
  runPostMigrationUpdates(db);

  return db;
}

// Post-migration updates for backward compatibility with existing databases
function runPostMigrationUpdates(db: Database.Database): void {
  ensureColumn(db, 'projects', 'project_mode', "TEXT NOT NULL DEFAULT 'git'");
  ensureColumn(db, 'permission_receipts', 'thread_id', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_code', 'INTEGER');
  ensureColumn(db, 'terminal_sessions', 'signal', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_kind', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_label', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_summary', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_recommendation', 'TEXT');
  ensureColumn(db, 'terminal_sessions', 'exit_signal_number', 'INTEGER');
  ensureColumn(db, 'terminal_chunks', 'raw_text', 'TEXT');
  ensureColumn(db, 'terminal_chunks', 'clean_text', 'TEXT');
  ensureColumn(db, 'terminal_chunks', 'control_events_json', 'TEXT');
  ensureColumn(db, 'terminal_chunks', 'screen_snapshot_json', 'TEXT');
  ensureColumn(db, 'terminal_chunks', 'state_detection_json', 'TEXT');
  ensureColumn(db, 'automation_runs', 'thread_id', 'TEXT');
  ensureColumn(db, 'automation_runs', 'terminal_session_id', 'TEXT');
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
