/**
 * Migration runner for Doorway database schema.
 * Reads SQL files from migrations directory and applies them in order.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { MigrationError } from './errors.js';

const migrationDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

const MIGRATION_FILES = [
  '001_initial_schema.sql',
  '002_add_exit_taxonomy.sql',
  '003_add_evidence_table.sql',
  '004_add_plugins.sql',
  '005_automation_event_triggers.sql',
] as const;

/**
 * Get the applied migrations from the schema_migrations table.
 */
function getAppliedMigrations(db: Database.Database): Set<string> {
  try {
    const rows = db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[];
    return new Set(rows.map((row) => row.version));
  } catch {
    // Table doesn't exist yet, no migrations applied
    return new Set();
  }
}

/**
 * Record a migration as applied.
 */
function recordMigration(db: Database.Database, version: string): void {
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
    .run(version, new Date().toISOString());
}

/**
 * Run all pending migrations on the database.
 */
export function runMigrations(db: Database.Database): void {
  const applied = getAppliedMigrations(db);

  for (const filename of MIGRATION_FILES) {
    const version = filename.replace('.sql', '');

    if (applied.has(version)) {
      continue; // Already applied
    }

    const sqlPath = resolveMigrationPath(filename);

    let sql: string;
    try {
      sql = readFileSync(sqlPath, 'utf8');
    } catch (error) {
      throw new MigrationError(`Failed to read migration file: ${filename}`, {
        error: String(error),
        filename,
      });
    }

    db.transaction(() => {
      try {
        db.exec(sql);
      } catch (error) {
        throw new MigrationError(`Migration ${filename} failed`, {
          error: String(error),
          filename,
          sql: sql.substring(0, 200),
        });
      }
      recordMigration(db, version);
    })();
  }
}

function resolveMigrationPath(filename: string): string {
  const candidates = [
    join(migrationDir, 'migrations', filename),
    join(migrationDir, '..', 'src', 'migrations', filename),
    join(process.cwd(), 'packages', 'core', 'src', 'migrations', filename),
    join(process.cwd(), 'packages', 'core', 'dist', 'migrations', filename),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? candidates[0];
}
