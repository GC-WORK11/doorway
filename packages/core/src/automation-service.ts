/**
 * Doorway Automation Service
 * 
 * Manages scheduled automations and their runs.
 */

import type Database from 'better-sqlite3';
import { generateId } from './id-gen.js';

// ============================================================================
// Types
// ============================================================================

export interface Automation {
  readonly id: string;
  readonly projectId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly cronExpression: string;
  readonly command: string;
  readonly enabled: boolean;
  readonly lastRunAt: string | null;
  readonly nextRunAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AutomationRun {
  readonly id: string;
  readonly automationId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly exitCode: number | null;
  readonly output: string | null;
  readonly error: string | null;
}

export interface CreateAutomationInput {
  readonly projectId?: string;
  readonly name: string;
  readonly description?: string;
  readonly cronExpression: string;
  readonly command: string;
  readonly enabled?: boolean;
}

export interface UpdateAutomationInput {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly cronExpression?: string;
  readonly command?: string;
  readonly enabled?: boolean;
}

// ============================================================================
// Automation CRUD
// ============================================================================

function rowToAutomation(row: Record<string, unknown>): Automation {
  return {
    id: row.id as string,
    projectId: row.project_id as string | null,
    name: row.name as string,
    description: row.description as string | null,
    cronExpression: row.cron_expression as string,
    command: row.command as string,
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at as string | null,
    nextRunAt: row.next_run_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToAutomationRun(row: Record<string, unknown>): AutomationRun {
  return {
    id: row.id as string,
    automationId: row.automation_id as string,
    status: row.status as AutomationRun['status'],
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    exitCode: row.exit_code as number | null,
    output: row.output as string | null,
    error: row.error as string | null,
  };
}

export function createAutomation(
  db: Database.Database,
  input: CreateAutomationInput
): Automation {
  const id = generateId('automation');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO automations 
     (id, project_id, name, description, cron_expression, command, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.projectId ?? null,
    input.name,
    input.description ?? null,
    input.cronExpression,
    input.command,
    input.enabled !== false ? 1 : 0,
    now,
    now
  );

  return getAutomationById(db, id)!;
}

export function getAutomationById(db: Database.Database, id: string): Automation | null {
  const row = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToAutomation(row) : null;
}

export function listAutomations(
  db: Database.Database,
  options?: { readonly projectId?: string; readonly enabled?: boolean }
): readonly Automation[] {
  let sql = 'SELECT * FROM automations WHERE 1=1';
  const params: unknown[] = [];

  if (options?.projectId !== undefined) {
    sql += ' AND project_id = ?';
    params.push(options.projectId);
  }

  if (options?.enabled !== undefined) {
    sql += ' AND enabled = ?';
    params.push(options.enabled ? 1 : 0);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToAutomation);
}

export function updateAutomation(
  db: Database.Database,
  input: UpdateAutomationInput
): Automation | null {
  const existing = getAutomationById(db, input.id);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();

  db.prepare(
    `UPDATE automations SET
     name = ?, description = ?, cron_expression = ?, command = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    input.description ?? existing.description,
    input.cronExpression ?? existing.cronExpression,
    input.command ?? existing.command,
    input.enabled !== undefined ? (input.enabled ? 1 : 0) : (existing.enabled ? 1 : 0),
    now,
    input.id
  );

  return getAutomationById(db, input.id);
}

export function deleteAutomation(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM automations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function setAutomationNextRun(
  db: Database.Database,
  id: string,
  nextRunAt: string
): void {
  db.prepare('UPDATE automations SET next_run_at = ?, updated_at = ? WHERE id = ?')
    .run(nextRunAt, new Date().toISOString(), id);
}

export function setAutomationLastRun(
  db: Database.Database,
  id: string,
  lastRunAt: string
): void {
  db.prepare('UPDATE automations SET last_run_at = ?, updated_at = ? WHERE id = ?')
    .run(lastRunAt, new Date().toISOString(), id);
}

// ============================================================================
// Automation Runs
// ============================================================================

export function createAutomationRun(
  db: Database.Database,
  automationId: string
): AutomationRun {
  const id = generateId('automation_run');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO automation_runs (id, automation_id, status, started_at)
     VALUES (?, ?, 'pending', ?)`
  ).run(id, automationId, now);

  const row = db.prepare('SELECT * FROM automation_runs WHERE id = ?').get(id) as Record<string, unknown>;
  return rowToAutomationRun(row);
}

export function getAutomationRunById(db: Database.Database, id: string): AutomationRun | null {
  const row = db.prepare('SELECT * FROM automation_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToAutomationRun(row) : null;
}

export function listAutomationRuns(
  db: Database.Database,
  automationId: string,
  options?: { readonly limit?: number; readonly status?: AutomationRun['status'] }
): readonly AutomationRun[] {
  let sql = 'SELECT * FROM automation_runs WHERE automation_id = ?';
  const params: unknown[] = [automationId];

  if (options?.status) {
    sql += ' AND status = ?';
    params.push(options.status);
  }

  sql += ' ORDER BY started_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToAutomationRun);
}

export function startAutomationRun(
  db: Database.Database,
  id: string
): AutomationRun | null {
  db.prepare("UPDATE automation_runs SET status = 'running' WHERE id = ? AND status = 'pending'")
    .run(id);
  return getAutomationRunById(db, id);
}

export function completeAutomationRun(
  db: Database.Database,
  id: string,
  result: { readonly exitCode: number; readonly output?: string }
): AutomationRun | null {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE automation_runs SET 
     status = 'completed', completed_at = ?, exit_code = ?, output = ?
     WHERE id = ?`
  ).run(now, result.exitCode, result.output ?? null, id);
  return getAutomationRunById(db, id);
}

export function failAutomationRun(
  db: Database.Database,
  id: string,
  error: string,
  exitCode?: number
): AutomationRun | null {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE automation_runs SET
     status = 'failed', completed_at = ?, error = ?, exit_code = ?
     WHERE id = ?`
  ).run(now, error, exitCode ?? null, id);
  return getAutomationRunById(db, id);
}

// ============================================================================
// Scheduler Queries
// ============================================================================

export function getDueAutomations(db: Database.Database): readonly Automation[] {
  const now = new Date().toISOString();
  const rows = db.prepare(
    `SELECT * FROM automations 
     WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
     ORDER BY next_run_at ASC`
  ).all(now) as Record<string, unknown>[];
  return rows.map(rowToAutomation);
}
