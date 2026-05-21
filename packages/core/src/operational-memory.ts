import type Database from 'better-sqlite3';
import type {
  OperationalCommandPatternProjection,
  OperationalMemoryProjection,
  TerminalInputSource,
  TerminalSessionId,
  TerminalSessionStatus,
  ThreadId,
} from '@doorway/protocol';
import { getEvents } from './event-service.js';
import { generateId, toISOString } from './id-gen.js';

const REPEATED_WORKFLOW_THRESHOLD = 3;

export function getThreadOperationalMemory(
  db: Database.Database,
  threadId: ThreadId
): OperationalMemoryProjection {
  const sessionIds = terminalSessionIdsForThread(db, threadId);
  if (sessionIds.length === 0) {
    return emptyOperationalMemory(threadId);
  }

  const inputs = terminalInputsForSessions(db, sessionIds);
  const observed = observedCommandsFromInputs(inputs);
  const projectId = projectIdForThread(db, threadId);
  const patterns = summarizeCommandPatterns(observed);
  const storedPatternIds = projectId
    ? storeRepeatedCommandPatterns(db, projectId, threadId, patterns)
    : new Map<string, string>();
  const observedCommands = patterns.map((pattern) => {
    const memoryId = storedPatternIds.get(pattern.command);
    return {
      ...pattern,
      ...(memoryId ? { memoryId } : {}),
      isStoredPattern: Boolean(memoryId),
    };
  });

  return {
    threadId,
    observedCommands,
    repeatedCommands: observedCommands.filter((pattern) => pattern.isRepeatedWorkflow),
    storedPatternCount: storedPatternIds.size,
    generatedAt: new Date(),
  };
}

function projectIdForThread(db: Database.Database, threadId: ThreadId): string | undefined {
  const row = db
    .prepare(
      `
      SELECT project_id
      FROM threads
      WHERE id = ?
    `
    )
    .get(threadId) as { readonly project_id: string } | undefined;
  return row?.project_id;
}

function terminalSessionIdsForThread(
  db: Database.Database,
  threadId: ThreadId
): readonly TerminalSessionId[] {
  return Array.from(
    new Set(
      getEvents(db, threadId)
        .filter((event) => event.type.startsWith('terminal.'))
        .map((event) => {
          const payload = event.payload as { readonly sessionId?: unknown };
          return typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
        })
        .filter((sessionId): sessionId is TerminalSessionId => Boolean(sessionId))
    )
  );
}

function terminalInputsForSessions(
  db: Database.Database,
  sessionIds: readonly TerminalSessionId[]
): readonly TerminalInputMemoryRow[] {
  if (sessionIds.length === 0) {
    return [];
  }
  const placeholders = sessionIds.map(() => '?').join(', ');
  return db
    .prepare(
      `
      SELECT
        terminal_inputs.session_id,
        terminal_inputs.sequence,
        terminal_inputs.text,
        terminal_inputs.source,
        terminal_inputs.created_at,
        terminal_sessions.status,
        terminal_sessions.exit_label
      FROM terminal_inputs
      JOIN terminal_sessions ON terminal_sessions.id = terminal_inputs.session_id
      WHERE terminal_inputs.session_id IN (${placeholders})
      ORDER BY terminal_inputs.created_at ASC, terminal_inputs.session_id ASC, terminal_inputs.sequence ASC
    `
    )
    .all(...sessionIds) as TerminalInputMemoryRow[];
}

function observedCommandsFromInputs(
  inputs: readonly TerminalInputMemoryRow[]
): readonly ObservedCommand[] {
  const commands: ObservedCommand[] = [];
  const lineBySession = new Map<string, string>();

  for (const input of inputs) {
    if (input.source === 'permission_decision') {
      continue;
    }
    let line = lineBySession.get(input.session_id) ?? '';
    for (const char of input.text) {
      if (char === '\u0003') {
        line = '';
        continue;
      }
      if (char === '\b' || char === '\u007f') {
        line = line.slice(0, -1);
        continue;
      }
      if (char === '\r' || char === '\n') {
        const command = normalizeCommand(line);
        if (command) {
          commands.push(observedCommand(input, command));
        }
        line = '';
        continue;
      }
      if (char >= ' ') {
        line += char;
      }
    }
    lineBySession.set(input.session_id, line);
  }

  return commands;
}

function observedCommand(input: TerminalInputMemoryRow, command: string): ObservedCommand {
  return {
    command,
    source: input.source as TerminalInputSource,
    seenAt: new Date(input.created_at),
    sessionId: input.session_id as TerminalSessionId,
    sessionStatus: input.status as TerminalSessionStatus,
    ...(input.exit_label ? { sessionExitLabel: input.exit_label } : {}),
  };
}

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, ' ').trim();
}

function summarizeCommandPatterns(
  observed: readonly ObservedCommand[]
): readonly CommandPatternSummary[] {
  const byCommand = new Map<string, ObservedCommand[]>();
  for (const command of observed) {
    byCommand.set(command.command, [...(byCommand.get(command.command) ?? []), command]);
  }

  return [...byCommand.entries()]
    .map(([command, runs]) => {
      const firstRun = runs[0];
      const lastRun = runs[runs.length - 1];
      if (!firstRun || !lastRun) {
        throw new Error(`Operational memory grouped command "${command}" without runs`);
      }
      return {
        command,
        runCount: runs.length,
        sources: Array.from(new Set(runs.map((run) => run.source))).sort(),
        firstSeenAt: firstRun.seenAt,
        lastSeenAt: lastRun.seenAt,
        lastSessionId: lastRun.sessionId,
        lastSessionStatus: lastRun.sessionStatus,
        ...(lastRun.sessionExitLabel ? { lastSessionExitLabel: lastRun.sessionExitLabel } : {}),
        isRepeatedWorkflow: runs.length >= REPEATED_WORKFLOW_THRESHOLD,
        isStoredPattern: false,
      };
    })
    .sort((left, right) => {
      if (right.runCount !== left.runCount) {
        return right.runCount - left.runCount;
      }
      return right.lastSeenAt.getTime() - left.lastSeenAt.getTime();
    });
}

function storeRepeatedCommandPatterns(
  db: Database.Database,
  projectId: string,
  threadId: ThreadId,
  patterns: readonly CommandPatternSummary[]
): Map<string, string> {
  const storedIds = new Map<string, string>();
  const upsert = db.prepare(
    `
    INSERT INTO pattern_memory_items (
      id,
      project_id,
      kind,
      pattern_key,
      summary,
      occurrences,
      confidence,
      evidence_json,
      first_seen_at,
      last_seen_at,
      updated_at
    )
    VALUES (?, ?, 'command', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, kind, pattern_key) DO UPDATE SET
      summary = excluded.summary,
      occurrences = excluded.occurrences,
      confidence = excluded.confidence,
      evidence_json = excluded.evidence_json,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < pattern_memory_items.first_seen_at
        THEN excluded.first_seen_at
        ELSE pattern_memory_items.first_seen_at
      END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > pattern_memory_items.last_seen_at
        THEN excluded.last_seen_at
        ELSE pattern_memory_items.last_seen_at
      END,
      updated_at = excluded.updated_at
    RETURNING id
  `
  );

  for (const pattern of patterns) {
    if (!pattern.isRepeatedWorkflow) {
      continue;
    }
    const row = upsert.get(
      generateId('pmem'),
      projectId,
      pattern.command,
      `Repeated command observed ${pattern.runCount} times: ${pattern.command}`,
      pattern.runCount,
      confidenceForRunCount(pattern.runCount),
      JSON.stringify([
        {
          threadId,
          sessionId: pattern.lastSessionId,
          command: pattern.command,
          runCount: pattern.runCount,
          lastSessionStatus: pattern.lastSessionStatus,
          lastSessionExitLabel: pattern.lastSessionExitLabel,
          sources: pattern.sources,
        },
      ]),
      toISOString(pattern.firstSeenAt),
      toISOString(pattern.lastSeenAt),
      toISOString(new Date())
    ) as { readonly id: string };
    storedIds.set(pattern.command, row.id);
  }

  return storedIds;
}

function confidenceForRunCount(runCount: number): number {
  return Math.min(0.95, 0.55 + runCount * 0.1);
}

function emptyOperationalMemory(threadId: ThreadId): OperationalMemoryProjection {
  return {
    threadId,
    observedCommands: [],
    repeatedCommands: [],
    storedPatternCount: 0,
    generatedAt: new Date(),
  };
}

type CommandPatternSummary = OperationalCommandPatternProjection;

interface TerminalInputMemoryRow {
  readonly session_id: string;
  readonly sequence: number;
  readonly text: string;
  readonly source: string;
  readonly created_at: string;
  readonly status: string;
  readonly exit_label: string | null;
}

interface ObservedCommand {
  readonly command: string;
  readonly source: TerminalInputSource;
  readonly seenAt: Date;
  readonly sessionId: TerminalSessionId;
  readonly sessionStatus: TerminalSessionStatus;
  readonly sessionExitLabel?: string;
}
