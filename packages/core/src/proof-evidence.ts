import type Database from 'better-sqlite3';
import type {
  AgentRunId,
  EventType,
  ProofProjection,
  TerminalSessionId,
  TestStatus,
  ThreadId,
} from '@doorway/protocol';
import { recordEvent } from './event-service.js';
import { generateId, toISOString } from './id-gen.js';
import { NotFoundError } from './errors.js';

export function isTestCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return (
    /\b(test|vitest|jest|playwright|pytest|cargo test|go test|rspec)\b/.test(normalized) ||
    normalized.includes('npm run test') ||
    normalized.includes('pnpm test') ||
    normalized.includes('yarn test') ||
    normalized.includes('bun test')
  );
}

export function recordTestStarted(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly terminalSessionId: TerminalSessionId;
    readonly agentRunId?: AgentRunId;
    readonly command: string;
    readonly label?: string;
  }
): ProofProjection {
  assertTerminalSessionExists(db, options.terminalSessionId);

  const proofId = generateId('proof');
  const label = options.label ?? options.command;
  const startedAt = toISOString(new Date());

  db.prepare(
    `
    INSERT INTO test_proofs (
      id, thread_id, terminal_session_id, agent_run_id, label, command, status, started_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `
  ).run(
    proofId,
    threadId,
    options.terminalSessionId,
    options.agentRunId ?? null,
    label,
    options.command,
    startedAt
  );

  recordEvent(db, threadId, 'test.started' as EventType, {
    proofId,
    terminalSessionId: options.terminalSessionId,
    command: options.command,
  });

  return {
    id: proofId,
    label,
    status: 'pending',
    command: options.command,
    startedAt: new Date(startedAt),
    evidence: [
      { kind: 'terminal', id: options.terminalSessionId, label: 'Terminal session' },
      { kind: 'test', id: proofId, label },
    ],
  };
}

export function recordTestFinished(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly terminalSessionId: TerminalSessionId;
    readonly exitCode?: number;
    readonly summary?: string;
  }
): ProofProjection | null {
  const proof = getLatestProofForTerminal(db, options.terminalSessionId);
  if (!proof) {
    return null;
  }

  const status = statusFromExitCode(options.exitCode);
  const summary = options.summary ?? summaryFromExitCode(options.exitCode);
  const finishedAt = toISOString(new Date());

  db.prepare(
    `
    UPDATE test_proofs
    SET status = ?, summary = ?, exit_code = ?, finished_at = ?
    WHERE id = ?
  `
  ).run(status, summary, options.exitCode ?? null, finishedAt, proof.id);

  recordEvent(db, threadId, 'test.finished' as EventType, {
    proofId: proof.id,
    terminalSessionId: options.terminalSessionId,
    status,
    exitCode: options.exitCode,
    summary,
  });

  return {
    id: proof.id,
    label: proof.label,
    status,
    command: proof.command,
    summary,
    startedAt: new Date(proof.started_at),
    finishedAt: new Date(finishedAt),
    evidence: proofEvidence(proof.id, proof.label, options.terminalSessionId),
  };
}

export function listProofs(db: Database.Database, threadId: ThreadId): readonly ProofProjection[] {
  const rows = db
    .prepare(
      `
      SELECT id, terminal_session_id, label, command, status, summary, started_at, finished_at
      FROM test_proofs
      WHERE thread_id = ?
      ORDER BY started_at ASC
    `
    )
    .all(threadId) as ProofRow[];

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    status: row.status as TestStatus,
    command: row.command,
    summary: row.summary ?? undefined,
    startedAt: new Date(row.started_at),
    ...(row.finished_at ? { finishedAt: new Date(row.finished_at) } : {}),
    evidence: proofEvidence(row.id, row.label, row.terminal_session_id as TerminalSessionId),
  }));
}

function statusFromExitCode(exitCode: number | undefined): TestStatus {
  if (exitCode === undefined) {
    return 'unknown';
  }
  return exitCode === 0 ? 'pass' : 'fail';
}

function summaryFromExitCode(exitCode: number | undefined): string {
  if (exitCode === undefined) {
    return 'Test command exited without a numeric exit code.';
  }
  return `Test command exited with code ${exitCode}.`;
}

function proofEvidence(
  proofId: string,
  label: string,
  terminalSessionId: TerminalSessionId
): ProofProjection['evidence'] {
  return [
    { kind: 'terminal', id: terminalSessionId, label: 'Terminal session' },
    { kind: 'test', id: proofId, label },
  ];
}

function getLatestProofForTerminal(
  db: Database.Database,
  terminalSessionId: TerminalSessionId
): ProofRow | null {
  const row = db
    .prepare(
      `
      SELECT id, terminal_session_id, label, command, status, summary, started_at, finished_at
      FROM test_proofs
      WHERE terminal_session_id = ?
      ORDER BY started_at DESC
      LIMIT 1
    `
    )
    .get(terminalSessionId) as ProofRow | undefined;

  return row ?? null;
}

function assertTerminalSessionExists(db: Database.Database, sessionId: TerminalSessionId): void {
  const row = db.prepare('SELECT id FROM terminal_sessions WHERE id = ?').get(sessionId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('TerminalSession', sessionId);
  }
}

interface ProofRow {
  readonly id: string;
  readonly terminal_session_id: string;
  readonly label: string;
  readonly command: string;
  readonly status: string;
  readonly summary: string | null;
  readonly started_at: string;
  readonly finished_at: string | null;
}
