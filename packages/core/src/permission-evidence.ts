import type Database from 'better-sqlite3';
import type {
  AgentRunId,
  PermissionDecision,
  PermissionReceiptProjection,
  TaskId,
  ThreadId,
} from '@doorway/protocol';
import { recordEvent } from './event-service.js';
import { generateId, toISOString } from './id-gen.js';
import { NotFoundError } from './errors.js';

export function recordPermissionReceipt(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly taskId: TaskId;
    readonly runId?: AgentRunId;
    readonly command: string;
    readonly riskCategory: string;
    readonly decision: PermissionDecision;
    readonly userNotes?: string;
  }
): PermissionReceiptProjection {
  assertThreadExists(db, threadId);
  assertTaskExists(db, options.taskId);

  const receiptId = generateId('rcpt');
  const timestamp = new Date();
  const timestampText = toISOString(timestamp);

  db.prepare(
    `
    INSERT INTO permission_receipts (
      id, thread_id, task_id, run_id, command, risk_category, decision, user_notes, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    receiptId,
    threadId,
    options.taskId,
    options.runId ?? null,
    options.command,
    options.riskCategory,
    options.decision,
    options.userNotes ?? null,
    timestampText
  );

  if (options.decision === 'approved') {
    recordEvent(db, threadId, 'approval.granted', {
      receiptId,
      taskId: options.taskId,
      runId: options.runId,
      command: options.command,
      riskCategory: options.riskCategory,
      userResponse: options.userNotes,
    });
  } else {
    recordEvent(db, threadId, 'approval.denied', {
      receiptId,
      taskId: options.taskId,
      runId: options.runId,
      command: options.command,
      riskCategory: options.riskCategory,
      reason: options.userNotes,
    });
  }

  return {
    id: receiptId,
    taskId: options.taskId,
    runId: options.runId,
    command: options.command,
    riskCategory: options.riskCategory,
    decision: options.decision,
    userNotes: options.userNotes,
    timestamp,
    evidence: [{ kind: 'permission', id: receiptId, label: permissionLabel(options.decision) }],
  };
}

export function listPermissionReceipts(
  db: Database.Database,
  threadId: ThreadId
): readonly PermissionReceiptProjection[] {
  const rows = db
    .prepare(
      `
      SELECT id, task_id, run_id, command, risk_category, decision, user_notes, timestamp
      FROM permission_receipts
      WHERE thread_id = ?
      ORDER BY timestamp ASC
    `
    )
    .all(threadId) as PermissionReceiptRow[];

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id as TaskId,
    runId: (row.run_id ?? undefined) as AgentRunId | undefined,
    command: row.command,
    riskCategory: row.risk_category,
    decision: row.decision as PermissionDecision,
    userNotes: row.user_notes ?? undefined,
    timestamp: new Date(row.timestamp),
    evidence: [
      {
        kind: 'permission',
        id: row.id,
        label: permissionLabel(row.decision as PermissionDecision),
      },
    ],
  }));
}

function permissionLabel(decision: PermissionDecision): string {
  return decision === 'approved' ? 'Permission approved' : 'Permission denied';
}

function assertThreadExists(db: Database.Database, threadId: ThreadId): void {
  const row = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('Thread', threadId);
  }
}

function assertTaskExists(db: Database.Database, taskId: TaskId): void {
  const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('Task', taskId);
  }
}

interface PermissionReceiptRow {
  readonly id: string;
  readonly task_id: string;
  readonly run_id: string | null;
  readonly command: string;
  readonly risk_category: string;
  readonly decision: string;
  readonly user_notes: string | null;
  readonly timestamp: string;
}
