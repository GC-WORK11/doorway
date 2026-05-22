import type Database from 'better-sqlite3';
import type {
  AgentRunId,
  AgentAttentionState,
  CompletionRecommendedState,
  TerminalExitClassification,
  TerminalInputSource,
  TerminalRuntime,
  TerminalSessionId,
  TerminalSessionStatus,
  TerminalProjection,
  ThreadId,
  TranscriptChunk,
} from '@doorway/protocol';
import { getEvents, recordEvent } from './event-service.js';
import { generateId, toISOString } from './id-gen.js';
import { NotFoundError } from './errors.js';
import { isTestCommand, recordTestFinished, recordTestStarted } from './proof-evidence.js';
import { latestProcessSnapshot } from './process-evidence.js';
import { latestTerminalFileDeltaSnapshot } from './file-delta-evidence.js';

export interface TerminalSessionRecord {
  readonly id: TerminalSessionId;
  readonly agentRunId?: AgentRunId;
  readonly runtime: TerminalRuntime;
  readonly status: TerminalSessionStatus;
  readonly workingDirectory: string;
  readonly command?: string;
  readonly pid?: number;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly stoppedAt?: Date;
}

export interface TerminalInputRecord {
  readonly sessionId: TerminalSessionId;
  readonly sequence: number;
  readonly timestamp: Date;
  readonly text: string;
  readonly source: TerminalInputSource;
}

export function redactTerminalText(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9]{32,}/g, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]')
    .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED]')
    .replace(/("password":\s*)".*?"/g, '$1"[REDACTED]"')
    .replace(/("secret":\s*)".*?"/g, '$1"[REDACTED]"');
}

interface TerminalAttentionDetection {
  readonly state: AgentAttentionState;
  readonly reason: string;
  readonly score: number;
  readonly recommendedState: CompletionRecommendedState;
  readonly signals: readonly string[];
}

function detectTerminalAttention(
  text: string,
  isStderr: boolean
): TerminalAttentionDetection | undefined {
  const normalized = text.toLowerCase();
  if (
    /needs?\s+(approval|permission)|permission\s+(required|request)|approve|authorize|allow\s+/.test(
      normalized
    )
  ) {
    return {
      state: 'needs_approval',
      reason: 'Terminal output requested permission or approval.',
      score: 0.5,
      recommendedState: 'waiting_for_user',
      signals: ['permission_prompt'],
    };
  }
  if (
    /waiting\s+for\s+(input|reply|response)|press\s+enter|continue\?|proceed\?|yes\/no|\[y\/n\]|enter\s+(a\s+)?choice|select\s+an\s+option|password:|passphrase:/.test(
      normalized
    )
  ) {
    return {
      state: 'needs_input',
      reason: 'Terminal output requested user input.',
      score: 0.45,
      recommendedState: 'waiting_for_user',
      signals: ['input_prompt'],
    };
  }
  if (/loop\s+detected|stuck|timed?\s*out|retrying|rate\s+limit|deadlock/.test(normalized)) {
    return {
      state: 'stuck',
      reason: 'Terminal output matched a stuck or retry pattern.',
      score: 0.2,
      recommendedState: 'failed',
      signals: ['stuck_pattern'],
    };
  }
  if (
    isStderr ||
    /\b(fatal|panic|exception|permission denied|command not found)\b/.test(normalized)
  ) {
    return {
      state: 'failed',
      reason: 'Terminal output matched a failure pattern.',
      score: 0.1,
      recommendedState: 'failed',
      signals: ['failure_output'],
    };
  }
  return undefined;
}

const SIGNALS: Record<
  number,
  Pick<TerminalExitClassification, 'kind' | 'label' | 'summary' | 'recommendation'>
> = {
  2: {
    kind: 'interrupted',
    label: 'SIGINT',
    summary: 'Process interrupted by Ctrl+C or an interrupt signal.',
    recommendation: 'Treat this as a user or harness interruption, not a command failure.',
  },
  6: {
    kind: 'aborted',
    label: 'SIGABRT',
    summary: 'Process aborted, commonly from an assertion failure or runtime panic.',
    recommendation: 'Inspect the terminal output and crash logs around the abort.',
  },
  9: {
    kind: 'killed',
    label: 'SIGKILL',
    summary: 'Process was killed. This can indicate OOM, timeout, or an external kill.',
    recommendation: 'Check resource usage, timeout policy, and parent process evidence.',
  },
  11: {
    kind: 'segmentation_fault',
    label: 'SIGSEGV',
    summary: 'Process crashed with a segmentation fault.',
    recommendation: 'Inspect native crashes, memory access, or dependency/runtime failures.',
  },
  15: {
    kind: 'terminated',
    label: 'SIGTERM',
    summary: 'Process received a graceful termination request.',
    recommendation: 'Check whether the user, harness, or parent process requested shutdown.',
  },
};

const EXIT_CODES: Record<
  number,
  Pick<TerminalExitClassification, 'kind' | 'label' | 'summary' | 'recommendation'>
> = {
  0: {
    kind: 'success',
    label: 'exit 0',
    summary: 'Command exited successfully.',
    recommendation: 'No exit-code action needed.',
  },
  1: {
    kind: 'general_error',
    label: 'exit 1',
    summary: 'Command failed with a general error.',
    recommendation: 'Inspect stderr and nearby terminal output for the concrete failure.',
  },
  2: {
    kind: 'usage_error',
    label: 'exit 2',
    summary: 'Command likely failed because of invalid usage or arguments.',
    recommendation: 'Check the command syntax and help output.',
  },
  126: {
    kind: 'permission_denied',
    label: 'exit 126',
    summary: 'Command was found but could not be executed.',
    recommendation: 'Check executable permissions and shell policy.',
  },
  127: {
    kind: 'command_not_found',
    label: 'exit 127',
    summary: 'Command was not found by the shell.',
    recommendation: 'Check PATH, package installation, and the command name.',
  },
  130: {
    kind: 'interrupted',
    label: 'exit 130',
    summary: 'Command ended after SIGINT/Ctrl+C.',
    recommendation: 'Treat this as an interruption unless output shows another cause.',
  },
};

function signalNumberFromValue(signal: string | undefined): number | undefined {
  if (!signal) {
    return undefined;
  }
  const trimmed = signal.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const known = Object.entries(SIGNALS).find(([, info]) => info.label === trimmed.toUpperCase());
  return known ? Number(known[0]) : undefined;
}

export function classifyTerminalExit(options: {
  readonly exitCode?: number;
  readonly signal?: string;
}): TerminalExitClassification {
  const signalNumber =
    signalNumberFromValue(options.signal) ??
    (options.exitCode !== undefined && options.exitCode >= 128
      ? options.exitCode - 128
      : undefined);

  if (signalNumber !== undefined) {
    const info = SIGNALS[signalNumber] ?? {
      kind: 'signal' as const,
      label: `signal ${signalNumber}`,
      summary: `Process exited because of signal ${signalNumber}.`,
      recommendation: 'Inspect process tree and terminal output for who sent the signal.',
    };
    return {
      ...info,
      ...(options.exitCode !== undefined ? { exitCode: options.exitCode } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      signalNumber,
    };
  }

  if (options.exitCode !== undefined) {
    const info =
      EXIT_CODES[options.exitCode] ??
      ({
        kind: 'unknown',
        label: `exit ${options.exitCode}`,
        summary: `Command exited with code ${options.exitCode}.`,
        recommendation: 'Inspect terminal output for command-specific meaning.',
      } satisfies Pick<
        TerminalExitClassification,
        'kind' | 'label' | 'summary' | 'recommendation'
      >);
    return { ...info, exitCode: options.exitCode };
  }

  return {
    kind: 'unknown',
    label: 'unknown exit',
    summary: 'Doorway did not receive an exit code or signal.',
    recommendation:
      'Check whether the session detached or the runtime failed to report exit status.',
  };
}

function outputPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function terminalAgentRunId(
  db: Database.Database,
  sessionId: TerminalSessionId
): AgentRunId | undefined {
  const row = db
    .prepare('SELECT agent_run_id FROM terminal_sessions WHERE id = ?')
    .get(sessionId) as { agent_run_id: string | null } | undefined;
  return row?.agent_run_id ? (row.agent_run_id as AgentRunId) : undefined;
}

function recordTerminalAttention(
  db: Database.Database,
  threadId: ThreadId,
  sessionId: TerminalSessionId,
  detection: TerminalAttentionDetection,
  source: 'terminal_output' | 'process_exit',
  text?: string
): void {
  const agentRunId = terminalAgentRunId(db, sessionId);
  recordEvent(db, threadId, 'agent.attention', {
    sessionId,
    ...(agentRunId ? { agentRunId } : {}),
    state: detection.state,
    source,
    reason: detection.reason,
    ...(text ? { outputPreview: outputPreview(text) } : {}),
  });
  recordEvent(db, threadId, 'completion.confidence_updated', {
    sessionId,
    ...(agentRunId ? { agentRunId } : {}),
    score: detection.score,
    recommendedState: detection.recommendedState,
    signals: detection.signals,
  });
}

export function recordTerminalStarted(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly agentRunId?: AgentRunId;
    readonly runtime: TerminalRuntime;
    readonly workingDirectory: string;
    readonly command: string;
    readonly pid: number;
  }
): TerminalSessionRecord {
  const now = new Date();
  const timestamp = toISOString(now);

  db.prepare(
    `
    INSERT INTO terminal_sessions (
      id, agent_run_id, runtime, status, working_directory, command, pid, created_at, started_at
    )
    VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      agent_run_id = excluded.agent_run_id,
      runtime = excluded.runtime,
      status = 'running',
      working_directory = excluded.working_directory,
      command = excluded.command,
      pid = excluded.pid,
      started_at = excluded.started_at
  `
  ).run(
    options.sessionId,
    options.agentRunId ?? null,
    options.runtime,
    options.workingDirectory,
    options.command,
    options.pid,
    timestamp,
    timestamp
  );

  recordEvent(db, threadId, 'terminal.started', {
    sessionId: options.sessionId,
    pid: options.pid,
  });

  if (isTestCommand(options.command)) {
    recordTestStarted(db, threadId, {
      terminalSessionId: options.sessionId,
      agentRunId: options.agentRunId,
      command: options.command,
    });
  }

  return {
    id: options.sessionId,
    agentRunId: options.agentRunId,
    runtime: options.runtime,
    status: 'running',
    workingDirectory: options.workingDirectory,
    command: options.command,
    pid: options.pid,
    createdAt: now,
    startedAt: now,
  };
}

export function appendTerminalChunk(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly text: string;
    readonly isStdout?: boolean;
    readonly isStderr?: boolean;
  }
): TranscriptChunk {
  assertTerminalSessionExists(db, options.sessionId);

  const sequence = nextTerminalChunkSequence(db, options.sessionId);
  const timestamp = new Date();
  const isStdout = options.isStdout ?? true;
  const isStderr = options.isStderr ?? false;
  const text = redactTerminalText(options.text);

  db.prepare(
    `
    INSERT INTO terminal_chunks (id, session_id, sequence, text, is_stdout, is_stderr, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    generateId('term_chunk'),
    options.sessionId,
    sequence,
    text,
    isStdout ? 1 : 0,
    isStderr ? 1 : 0,
    toISOString(timestamp)
  );

  recordEvent(db, threadId, 'terminal.output', {
    sessionId: options.sessionId,
    sequence,
    text,
    isStdout,
    isStderr,
  });

  const detection = detectTerminalAttention(text, isStderr);
  if (detection) {
    recordTerminalAttention(db, threadId, options.sessionId, detection, 'terminal_output', text);
  }

  return {
    sessionId: options.sessionId,
    sequence,
    timestamp,
    text,
    isStdout,
    isStderr,
  };
}

export function recordTerminalInput(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly text: string;
    readonly source?: TerminalInputSource;
  }
): TerminalInputRecord {
  assertTerminalSessionExists(db, options.sessionId);
  const sequence = nextTerminalInputSequence(db, options.sessionId);
  const timestamp = new Date();
  const text = redactTerminalText(options.text);
  const source = options.source ?? 'user';

  db.prepare(
    `
    INSERT INTO terminal_inputs (id, session_id, sequence, text, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    generateId('term_input'),
    options.sessionId,
    sequence,
    text,
    source,
    toISOString(timestamp)
  );

  recordEvent(db, threadId, 'terminal.input', {
    sessionId: options.sessionId,
    sequence,
    text,
    source,
  });

  return {
    sessionId: options.sessionId,
    sequence,
    timestamp,
    text,
    source,
  };
}

export function recordTerminalStopped(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly sessionId: TerminalSessionId;
    readonly exitCode?: number;
    readonly signal?: string;
  }
): void {
  assertTerminalSessionExists(db, options.sessionId);
  const now = new Date();
  const exitClassification = classifyTerminalExit(options);

  db.prepare(
    `
    UPDATE terminal_sessions
    SET
      status = 'stopped',
      stopped_at = ?,
      exit_code = ?,
      signal = ?,
      exit_kind = ?,
      exit_label = ?,
      exit_summary = ?,
      exit_recommendation = ?,
      exit_signal_number = ?
    WHERE id = ?
  `
  ).run(
    toISOString(now),
    options.exitCode ?? null,
    options.signal ?? null,
    exitClassification.kind,
    exitClassification.label,
    exitClassification.summary,
    exitClassification.recommendation,
    exitClassification.signalNumber ?? null,
    options.sessionId
  );

  recordEvent(db, threadId, 'terminal.stopped', {
    sessionId: options.sessionId,
    exitCode: options.exitCode,
    signal: options.signal,
    exitClassification,
  });

  recordTerminalAttention(
    db,
    threadId,
    options.sessionId,
    {
      state: options.exitCode === 0 ? 'completed' : 'failed',
      reason: exitClassification.summary,
      score: options.exitCode === 0 ? 0.95 : 0,
      recommendedState: options.exitCode === 0 ? 'done' : 'failed',
      signals: [options.exitCode === 0 ? 'process_exit_zero' : 'process_exit_nonzero'],
    },
    'process_exit'
  );

  recordTestFinished(db, threadId, {
    terminalSessionId: options.sessionId,
    exitCode: options.exitCode,
  });
}

export function getTerminalTranscript(
  db: Database.Database,
  sessionId: TerminalSessionId
): readonly TranscriptChunk[] {
  assertTerminalSessionExists(db, sessionId);

  const rows = db
    .prepare(
      `
      SELECT session_id, sequence, text, is_stdout, is_stderr, created_at
      FROM terminal_chunks
      WHERE session_id = ?
      ORDER BY sequence ASC
    `
    )
    .all(sessionId) as TerminalChunkRow[];

  return rows.map((row) => ({
    sessionId: row.session_id as TerminalSessionId,
    sequence: row.sequence,
    timestamp: new Date(row.created_at),
    text: row.text,
    isStdout: row.is_stdout === 1,
    isStderr: row.is_stderr === 1,
  }));
}

export function listTerminalInputs(
  db: Database.Database,
  sessionId: TerminalSessionId
): readonly TerminalInputRecord[] {
  assertTerminalSessionExists(db, sessionId);

  const rows = db
    .prepare(
      `
      SELECT session_id, sequence, text, source, created_at
      FROM terminal_inputs
      WHERE session_id = ?
      ORDER BY sequence ASC
    `
    )
    .all(sessionId) as TerminalInputRow[];

  return rows.map((row) => ({
    sessionId: row.session_id as TerminalSessionId,
    sequence: row.sequence,
    timestamp: new Date(row.created_at),
    text: row.text,
    source: row.source as TerminalInputSource,
  }));
}

export function listTerminalProjections(
  db: Database.Database,
  threadId: ThreadId
): readonly TerminalProjection[] {
  const sessionIds = Array.from(
    new Set(
      getEvents(db, threadId)
        .filter((event) => event.type.startsWith('terminal.'))
        .map((event) => {
          const payload = event.payload as { readonly sessionId?: unknown };
          return typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
        })
        .filter((sessionId): sessionId is string => Boolean(sessionId))
    )
  );

  if (sessionIds.length === 0) {
    return [];
  }

  const sessionBindMarkers = sessionIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `
      SELECT
        terminal_sessions.id,
        terminal_sessions.agent_run_id,
        terminal_sessions.runtime,
        terminal_sessions.status,
        terminal_sessions.working_directory,
        terminal_sessions.command,
        terminal_sessions.pid,
        terminal_sessions.exit_code,
        terminal_sessions.signal,
        terminal_sessions.exit_kind,
        terminal_sessions.exit_label,
        terminal_sessions.exit_summary,
        terminal_sessions.exit_recommendation,
        terminal_sessions.exit_signal_number,
        COALESCE(terminal_sessions.started_at, terminal_sessions.created_at) AS created_at,
        terminal_chunks.text AS last_output
      FROM terminal_sessions
      LEFT JOIN terminal_chunks
        ON terminal_chunks.session_id = terminal_sessions.id
        AND terminal_chunks.sequence = (
          SELECT MAX(sequence)
          FROM terminal_chunks latest_chunks
          WHERE latest_chunks.session_id = terminal_sessions.id
        )
      WHERE terminal_sessions.id IN (${sessionBindMarkers})
      ORDER BY COALESCE(terminal_sessions.started_at, terminal_sessions.created_at) DESC
    `
    )
    .all(...sessionIds) as TerminalProjectionRow[];

  return rows.map((row) => {
    const sessionId = row.id as TerminalSessionId;
    const processSnapshot = latestProcessSnapshot(db, sessionId);
    const fileDeltaSnapshot = latestTerminalFileDeltaSnapshot(db, sessionId);
    return {
      id: sessionId,
      ...(row.agent_run_id ? { runId: row.agent_run_id as TerminalProjection['runId'] } : {}),
      runtime: row.runtime as TerminalRuntime,
      status: row.status as TerminalSessionStatus,
      workingDirectory: row.working_directory,
      ...(row.command ? { command: row.command } : {}),
      ...(row.pid !== null ? { pid: row.pid } : {}),
      ...(row.exit_code !== null ? { exitCode: row.exit_code } : {}),
      ...(row.signal ? { signal: row.signal } : {}),
      createdAt: new Date(row.created_at as string),
      ...(row.exit_kind && row.exit_label && row.exit_summary && row.exit_recommendation
        ? {
            exitClassification: {
              kind: row.exit_kind as TerminalExitClassification['kind'],
              label: row.exit_label,
              summary: row.exit_summary,
              recommendation: row.exit_recommendation,
              ...(row.exit_code !== null ? { exitCode: row.exit_code } : {}),
              ...(row.signal ? { signal: row.signal } : {}),
              ...(row.exit_signal_number !== null ? { signalNumber: row.exit_signal_number } : {}),
            },
          }
        : {}),
      ...(processSnapshot ? { latestProcessSnapshot: processSnapshot } : {}),
      ...(fileDeltaSnapshot ? { latestFileDeltaSnapshot: fileDeltaSnapshot } : {}),
      ...(row.last_output ? { lastOutput: row.last_output } : {}),
    };
  });
}

function nextTerminalChunkSequence(db: Database.Database, sessionId: TerminalSessionId): number {
  const row = db
    .prepare(
      `
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
      FROM terminal_chunks
      WHERE session_id = ?
    `
    )
    .get(sessionId) as { next_sequence: number };

  return row.next_sequence;
}

function nextTerminalInputSequence(db: Database.Database, sessionId: TerminalSessionId): number {
  const row = db
    .prepare(
      `
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
      FROM terminal_inputs
      WHERE session_id = ?
    `
    )
    .get(sessionId) as { next_sequence: number };

  return row.next_sequence;
}

function assertTerminalSessionExists(db: Database.Database, sessionId: TerminalSessionId): void {
  const row = db.prepare('SELECT id FROM terminal_sessions WHERE id = ?').get(sessionId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('TerminalSession', sessionId);
  }
}

interface TerminalChunkRow {
  readonly session_id: string;
  readonly sequence: number;
  readonly text: string;
  readonly is_stdout: number;
  readonly is_stderr: number;
  readonly created_at: string;
}

interface TerminalInputRow {
  readonly session_id: string;
  readonly sequence: number;
  readonly text: string;
  readonly source: string;
  readonly created_at: string;
}

interface TerminalProjectionRow {
  readonly id: string;
  readonly agent_run_id: string | null;
  readonly runtime: string;
  readonly status: string;
  readonly working_directory: string;
  readonly command: string | null;
  readonly pid: number | null;
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly exit_kind: string | null;
  readonly exit_label: string | null;
  readonly exit_summary: string | null;
  readonly exit_recommendation: string | null;
  readonly exit_signal_number: number | null;
  readonly created_at: string;
  readonly last_output: string | null;
}
