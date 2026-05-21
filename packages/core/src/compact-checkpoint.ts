import type Database from 'better-sqlite3';
import type { CompactCheckpointProjection, TerminalSessionId, ThreadId } from '@doorway/protocol';
import { recordEvent } from './event-service.js';
import { generateId, toISOString } from './id-gen.js';
import { listMergeAssessments } from './merge-evidence.js';
import { listProofs } from './proof-evidence.js';
import { listToolLaneProjections } from './tool-lanes.js';

export function createCompactCheckpoint(
  db: Database.Database,
  threadId: ThreadId
): CompactCheckpointProjection {
  const thread = threadGoalRow(db, threadId);
  const terminalSessionIds = terminalSessionIdsForThread(db, threadId);
  const commandsRun = latestTerminalInputs(db, terminalSessionIds);
  const chunks = latestTerminalChunks(db, terminalSessionIds);
  const filesChanged = changedFilesForThread(db, threadId);
  const proofs = listProofs(db, threadId);
  const tests = proofs.map((proof) =>
    [proof.command ?? proof.label, proof.status, proof.summary].filter(Boolean).join(' · ')
  );
  const mergeAssessments = listMergeAssessments(db, threadId);
  const lanes = listToolLaneProjections(db, threadId);
  const currentStatus = lanes[0]?.status ?? thread.status;
  const errors = [
    ...chunks
      .filter(
        (chunk) => chunk.is_stderr === 1 || /\b(error|failed|fatal|exception)\b/i.test(chunk.text)
      )
      .map((chunk) => compactLine(chunk.text)),
    ...mergeAssessments
      .filter((assessment) => assessment.score === 'blocked' || assessment.score === 'risky')
      .map((assessment) => assessment.reason),
  ].slice(-6);
  const importantLines = chunks
    .map((chunk) => compactLine(chunk.text))
    .filter(Boolean)
    .slice(-8);
  const nextAction = compactNextAction({ currentStatus, errors, tests });
  const nextPrompt = compactNextPrompt({
    originalGoal: thread.goal,
    currentStatus,
    filesChanged,
    commandsRun,
    tests,
    errors,
    importantLines,
    nextAction,
  });
  const id = generateId('compact');
  const createdAt = new Date();

  db.prepare(
    `
    INSERT INTO compact_checkpoints (
      id, thread_id, original_goal, current_status, files_changed, commands_run,
      tests, errors, important_lines, next_action, next_prompt, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    threadId,
    thread.goal,
    currentStatus,
    JSON.stringify(filesChanged),
    JSON.stringify(commandsRun),
    JSON.stringify(tests),
    JSON.stringify(errors),
    JSON.stringify(importantLines),
    nextAction,
    nextPrompt,
    toISOString(createdAt)
  );

  recordEvent(db, threadId, 'thread.compacted', {
    checkpointId: id,
    threadId,
    terminalSessionIds,
    createdAt: toISOString(createdAt),
  });

  return {
    id,
    threadId,
    originalGoal: thread.goal,
    currentStatus,
    filesChanged,
    commandsRun,
    tests,
    errors,
    importantLines,
    nextAction,
    nextPrompt,
    createdAt,
    evidence: [{ kind: 'compact', id, label: 'Compact checkpoint' }],
  };
}

export function listCompactCheckpoints(
  db: Database.Database,
  threadId: ThreadId
): readonly CompactCheckpointProjection[] {
  const rows = db
    .prepare(
      `
      SELECT id, thread_id, original_goal, current_status, files_changed, commands_run,
        tests, errors, important_lines, next_action, next_prompt, created_at
      FROM compact_checkpoints
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `
    )
    .all(threadId) as CompactCheckpointRow[];

  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id as ThreadId,
    originalGoal: row.original_goal,
    currentStatus: row.current_status,
    filesChanged: JSON.parse(row.files_changed) as readonly string[],
    commandsRun: JSON.parse(row.commands_run) as readonly string[],
    tests: JSON.parse(row.tests) as readonly string[],
    errors: JSON.parse(row.errors) as readonly string[],
    importantLines: JSON.parse(row.important_lines) as readonly string[],
    nextAction: row.next_action,
    nextPrompt: row.next_prompt,
    createdAt: new Date(row.created_at),
    evidence: [{ kind: 'compact', id: row.id, label: 'Compact checkpoint' }],
  }));
}

function compactNextAction(options: {
  readonly currentStatus: string;
  readonly errors: readonly string[];
  readonly tests: readonly string[];
}): string {
  if (options.currentStatus === 'needs_approval' || options.currentStatus === 'waiting_for_input') {
    return 'Answer the active terminal prompt, then continue the run.';
  }
  if (options.errors.length > 0) {
    return 'Resolve the latest error evidence, then rerun the relevant verification.';
  }
  if (options.tests.some((test) => test.includes('fail'))) {
    return 'Fix the failing proof and rerun the test command.';
  }
  return 'Continue from the latest terminal state without opening a new lane.';
}

function compactNextPrompt(options: {
  readonly originalGoal: string;
  readonly currentStatus: string;
  readonly filesChanged: readonly string[];
  readonly commandsRun: readonly string[];
  readonly tests: readonly string[];
  readonly errors: readonly string[];
  readonly importantLines: readonly string[];
  readonly nextAction: string;
}): string {
  return [
    'Continue this Doorway run from the compact checkpoint.',
    `Original goal: ${options.originalGoal}`,
    `Current status: ${options.currentStatus}`,
    `Files changed: ${listLine(options.filesChanged)}`,
    `Commands run: ${listLine(options.commandsRun)}`,
    `Tests: ${listLine(options.tests)}`,
    `Errors: ${listLine(options.errors)}`,
    `Last important terminal lines: ${listLine(options.importantLines)}`,
    `Next action: ${options.nextAction}`,
  ].join('\n');
}

function listLine(items: readonly string[]): string {
  return items.length > 0 ? items.join(' | ') : 'none recorded';
}

function compactLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function threadGoalRow(
  db: Database.Database,
  threadId: ThreadId
): { readonly goal: string; readonly status: string } {
  const row = db.prepare('SELECT goal, status FROM threads WHERE id = ?').get(threadId) as
    | { readonly goal: string; readonly status: string }
    | undefined;
  if (!row) {
    throw new Error(`Thread not found: ${threadId}`);
  }
  return row;
}

function terminalSessionIdsForThread(
  db: Database.Database,
  threadId: ThreadId
): readonly TerminalSessionId[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT json_extract(payload, '$.sessionId') AS session_id
      FROM events
      WHERE thread_id = ?
        AND type LIKE 'terminal.%'
        AND json_extract(payload, '$.sessionId') IS NOT NULL
    `
    )
    .all(threadId) as { readonly session_id: string }[];
  return rows.map((row) => row.session_id as TerminalSessionId);
}

function latestTerminalInputs(
  db: Database.Database,
  sessionIds: readonly TerminalSessionId[]
): readonly string[] {
  if (sessionIds.length === 0) {
    return [];
  }
  const placeholders = sessionIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `
      SELECT text
      FROM terminal_inputs
      WHERE session_id IN (${placeholders})
      ORDER BY created_at DESC, sequence DESC
      LIMIT 8
    `
    )
    .all(...sessionIds) as { readonly text: string }[];
  return rows.map((row) => compactLine(row.text)).reverse();
}

function latestTerminalChunks(
  db: Database.Database,
  sessionIds: readonly TerminalSessionId[]
): readonly TerminalChunkCompactRow[] {
  if (sessionIds.length === 0) {
    return [];
  }
  const placeholders = sessionIds.map(() => '?').join(', ');
  return db
    .prepare(
      `
      SELECT text, is_stderr
      FROM terminal_chunks
      WHERE session_id IN (${placeholders})
      ORDER BY created_at DESC, sequence DESC
      LIMIT 12
    `
    )
    .all(...sessionIds)
    .reverse() as TerminalChunkCompactRow[];
}

function changedFilesForThread(db: Database.Database, threadId: ThreadId): readonly string[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT file_changes.path
      FROM file_changes
      JOIN agent_runs ON agent_runs.id = file_changes.agent_run_id
      WHERE agent_runs.thread_id = ?
      ORDER BY file_changes.detected_at DESC
      LIMIT 12
    `
    )
    .all(threadId) as { readonly path: string }[];
  return rows.map((row) => row.path);
}

interface TerminalChunkCompactRow {
  readonly text: string;
  readonly is_stderr: number;
}

interface CompactCheckpointRow {
  readonly id: string;
  readonly thread_id: string;
  readonly original_goal: string;
  readonly current_status: string;
  readonly files_changed: string;
  readonly commands_run: string;
  readonly tests: string;
  readonly errors: string;
  readonly important_lines: string;
  readonly next_action: string;
  readonly next_prompt: string;
  readonly created_at: string;
}
