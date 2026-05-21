import type Database from 'better-sqlite3';
import type {
  TerminalFileDeltaEntry,
  TerminalFileDeltaPhase,
  TerminalFileDeltaSnapshotProjection,
  TerminalSessionId,
  ThreadId,
} from '@doorway/protocol';
import { NotFoundError } from './errors.js';
import { recordEvent } from './event-service.js';
import { generateId, toISOString } from './id-gen.js';

export function recordTerminalFileDeltaSnapshot(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly phase: TerminalFileDeltaPhase;
    readonly rootPath: string;
    readonly changes: readonly TerminalFileDeltaEntry[];
    readonly capturedAt?: Date;
  }
): TerminalFileDeltaSnapshotProjection {
  assertTerminalSessionExists(db, options.sessionId);
  const id = generateId('file_delta');
  const capturedAt = options.capturedAt ?? new Date();

  db.prepare(
    `
    INSERT INTO terminal_file_delta_snapshots (
      id, thread_id, session_id, phase, root_path, changes_json, captured_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    threadId,
    options.sessionId,
    options.phase,
    options.rootPath,
    JSON.stringify(options.changes),
    toISOString(capturedAt)
  );

  recordEvent(db, threadId, 'terminal.file_delta_captured', {
    snapshotId: id,
    sessionId: options.sessionId,
    phase: options.phase,
    rootPath: options.rootPath,
    changeCount: options.changes.length,
  });

  return {
    id,
    sessionId: options.sessionId,
    phase: options.phase,
    rootPath: options.rootPath,
    capturedAt,
    changes: options.changes,
  };
}

export function recordTerminalFileDeltaFailed(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly phase: TerminalFileDeltaPhase;
    readonly rootPath: string;
    readonly reason: string;
  }
): void {
  recordEvent(db, threadId, 'terminal.file_delta_failed', {
    sessionId: options.sessionId,
    phase: options.phase,
    rootPath: options.rootPath,
    reason: options.reason,
  });
}

export function latestTerminalFileDeltaSnapshot(
  db: Database.Database,
  sessionId: TerminalSessionId
): TerminalFileDeltaSnapshotProjection | undefined {
  const row = db
    .prepare(
      `
      SELECT id, session_id, phase, root_path, changes_json, captured_at
      FROM terminal_file_delta_snapshots
      WHERE session_id = ?
      ORDER BY captured_at DESC
      LIMIT 1
    `
    )
    .get(sessionId) as TerminalFileDeltaSnapshotRow | undefined;

  return row ? rowToProjection(row) : undefined;
}

export function listTerminalFileDeltaSnapshots(
  db: Database.Database,
  sessionId: TerminalSessionId
): readonly TerminalFileDeltaSnapshotProjection[] {
  assertTerminalSessionExists(db, sessionId);
  const rows = db
    .prepare(
      `
      SELECT id, session_id, phase, root_path, changes_json, captured_at
      FROM terminal_file_delta_snapshots
      WHERE session_id = ?
      ORDER BY captured_at ASC
    `
    )
    .all(sessionId) as TerminalFileDeltaSnapshotRow[];

  return rows.map(rowToProjection);
}

function rowToProjection(row: TerminalFileDeltaSnapshotRow): TerminalFileDeltaSnapshotProjection {
  return {
    id: row.id,
    sessionId: row.session_id as TerminalSessionId,
    phase: row.phase as TerminalFileDeltaPhase,
    rootPath: row.root_path,
    capturedAt: new Date(row.captured_at),
    changes: JSON.parse(row.changes_json) as TerminalFileDeltaEntry[],
  };
}

function assertTerminalSessionExists(db: Database.Database, sessionId: TerminalSessionId): void {
  const row = db.prepare('SELECT id FROM terminal_sessions WHERE id = ?').get(sessionId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('TerminalSession', sessionId);
  }
}

interface TerminalFileDeltaSnapshotRow {
  readonly id: string;
  readonly session_id: string;
  readonly phase: string;
  readonly root_path: string;
  readonly changes_json: string;
  readonly captured_at: string;
}
