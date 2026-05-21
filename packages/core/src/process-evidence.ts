import type Database from 'better-sqlite3';
import type {
  ProcessSnapshotNode,
  ProcessSnapshotPhase,
  ProcessSnapshotProjection,
  TerminalSessionId,
  ThreadId,
} from '@doorway/protocol';
import { generateId, toISOString } from './id-gen.js';
import { recordEvent } from './event-service.js';
import { NotFoundError } from './errors.js';

export function recordProcessSnapshot(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly phase: ProcessSnapshotPhase;
    readonly rootPid: number;
    readonly nodes: readonly ProcessSnapshotNode[];
    readonly capturedAt?: Date;
  }
): ProcessSnapshotProjection {
  assertTerminalSessionExists(db, options.sessionId);
  const id = generateId('proc_snapshot');
  const capturedAt = options.capturedAt ?? new Date();

  db.prepare(
    `
    INSERT INTO terminal_process_snapshots (
      id, thread_id, session_id, phase, root_pid, nodes_json, captured_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    threadId,
    options.sessionId,
    options.phase,
    options.rootPid,
    JSON.stringify(options.nodes),
    toISOString(capturedAt)
  );

  recordEvent(db, threadId, 'process.snapshot_captured', {
    snapshotId: id,
    sessionId: options.sessionId,
    phase: options.phase,
    rootPid: options.rootPid,
    processCount: options.nodes.length,
  });

  return {
    id,
    sessionId: options.sessionId,
    phase: options.phase,
    rootPid: options.rootPid,
    capturedAt,
    nodes: options.nodes,
  };
}

export function recordProcessSnapshotFailed(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly phase: ProcessSnapshotPhase;
    readonly rootPid: number;
    readonly reason: string;
  }
): void {
  recordEvent(db, threadId, 'process.snapshot_failed', {
    sessionId: options.sessionId,
    phase: options.phase,
    rootPid: options.rootPid,
    reason: options.reason,
  });
}

export function listProcessSnapshots(
  db: Database.Database,
  sessionId: TerminalSessionId
): readonly ProcessSnapshotProjection[] {
  assertTerminalSessionExists(db, sessionId);
  const rows = db
    .prepare(
      `
      SELECT id, session_id, phase, root_pid, nodes_json, captured_at
      FROM terminal_process_snapshots
      WHERE session_id = ?
      ORDER BY captured_at ASC
    `
    )
    .all(sessionId) as ProcessSnapshotRow[];

  return rows.map(rowToProjection);
}

export function latestProcessSnapshot(
  db: Database.Database,
  sessionId: TerminalSessionId
): ProcessSnapshotProjection | undefined {
  const row = db
    .prepare(
      `
      SELECT id, session_id, phase, root_pid, nodes_json, captured_at
      FROM terminal_process_snapshots
      WHERE session_id = ?
      ORDER BY captured_at DESC
      LIMIT 1
    `
    )
    .get(sessionId) as ProcessSnapshotRow | undefined;

  return row ? rowToProjection(row) : undefined;
}

function rowToProjection(row: ProcessSnapshotRow): ProcessSnapshotProjection {
  return {
    id: row.id,
    sessionId: row.session_id as TerminalSessionId,
    phase: row.phase as ProcessSnapshotPhase,
    rootPid: row.root_pid,
    capturedAt: new Date(row.captured_at),
    nodes: JSON.parse(row.nodes_json) as ProcessSnapshotNode[],
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

interface ProcessSnapshotRow {
  readonly id: string;
  readonly session_id: string;
  readonly phase: string;
  readonly root_pid: number;
  readonly nodes_json: string;
  readonly captured_at: string;
}
