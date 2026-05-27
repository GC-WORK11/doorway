/**
 * Event Service
 * Event sourcing implementation for Doorway.
 * All state changes are recorded as immutable events.
 */

import type Database from 'better-sqlite3';
import type { EventId, ThreadId, EventType, EventPayload, DoorwayEvent } from '@doorway/protocol';
import { getNextSequence } from './database.js';
import { generateId, toISOString } from './id-gen.js';
import { ValidationError } from './errors.js';
import { dbEventBus } from './event-bus.js';

const knownEventTypes = new Set<string>([
  'thread.created',
  'thread.status_changed',
  'thread.compacted',
  'thread.replay_exported',
  'thread.replay_verification_succeeded',
  'thread.replay_verification_failed',
  'message.appended',
  'agent_run.created',
  'agent_run.status_changed',
  'agent_run.completed',
  'terminal.created',
  'terminal.started',
  'terminal.input',
  'terminal.output',
  'terminal.state',
  'terminal.stopped',
  'process.snapshot_captured',
  'process.snapshot_failed',
  'terminal.file_delta_captured',
  'terminal.file_delta_failed',
  'agent.attention',
  'completion.confidence_updated',
  'clarification.requested',
  'clarification.answered',
  'test.started',
  'test.finished',
  'diff.updated',
  'worktree.created',
  'worktree.archived',
  'worktree.rollback_patch_exported',
  'file_change.detected',
  'task_graph.updated',
  'handoff.created',
  'handoff.used',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'merge.started',
  'merge.evaluated',
  'merge.completed',
  'merge.conflict',
  'browser.action',
  'browser.bundle_exported',
  'unified_thread.session_created',
  'unified_thread.agents_registered',
  'unified_thread.agent_started',
  'unified_thread.completed',
  'unified_thread.synthesis_created',
]);

/**
 * Record a new event in the event store.
 */
export function recordEvent(
  db: Database.Database,
  threadId: ThreadId,
  type: EventType,
  payload: EventPayload
): DoorwayEvent {
  const eventId = generateId('evt') as EventId;
  const timestamp = new Date();
  const sequence = getNextSequence(db);

  db.prepare(
    `
    INSERT INTO events (id, thread_id, type, payload, sequence, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(eventId, threadId, type, JSON.stringify(payload), sequence, toISOString(timestamp));

  const event = {
    id: eventId,
    threadId,
    type,
    payload,
    timestamp,
    sequence,
  };
  dbEventBus.emit(type, event);
  return event;
}

/**
 * Replay all events for a thread to reconstruct state.
 */
export function replayEvents(db: Database.Database, threadId: ThreadId): readonly DoorwayEvent[] {
  const rows = db
    .prepare(
      `
    SELECT id, thread_id, type, payload, sequence, timestamp
    FROM events
    WHERE thread_id = ?
    ORDER BY sequence ASC
  `
    )
    .all(threadId) as EventRow[];

  return rows.map((row) => ({
    id: row.id as EventId,
    threadId: row.thread_id as ThreadId,
    type: row.type as EventType,
    payload: JSON.parse(row.payload) as EventPayload,
    timestamp: new Date(row.timestamp),
    sequence: row.sequence,
  }));
}

export function replayEventJsonLine(event: DoorwayEvent): string {
  return JSON.stringify({
    id: event.id,
    threadId: event.threadId,
    type: event.type,
    sequence: event.sequence,
    timestamp: event.timestamp.toISOString(),
    payload: event.payload,
  });
}

export function replayEventsJsonl(events: readonly DoorwayEvent[]): string {
  const lines = [...events]
    .sort((left, right) => left.sequence - right.sequence)
    .map(replayEventJsonLine);
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

export function parseReplayEventJsonLine(line: string, lineNumber = 1): DoorwayEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new ValidationError('Replay JSONL line is not valid JSON.', {
      lineNumber,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isRecord(parsed)) {
    throw new ValidationError('Replay JSONL line must be an object.', { lineNumber });
  }

  const id = stringField(parsed, 'id', lineNumber) as EventId;
  const threadId = stringField(parsed, 'threadId', lineNumber) as ThreadId;
  const type = stringField(parsed, 'type', lineNumber);
  if (!knownEventTypes.has(type)) {
    throw new ValidationError('Replay JSONL line has an unknown event type.', {
      lineNumber,
      type,
    });
  }

  const sequenceValue = parsed.sequence;
  if (typeof sequenceValue !== 'number' || !Number.isInteger(sequenceValue) || sequenceValue < 1) {
    throw new ValidationError('Replay JSONL line has an invalid sequence.', {
      lineNumber,
      sequence: sequenceValue,
    });
  }
  const sequence = sequenceValue as number;

  const timestampText = stringField(parsed, 'timestamp', lineNumber);
  const timestamp = new Date(timestampText);
  if (Number.isNaN(timestamp.getTime())) {
    throw new ValidationError('Replay JSONL line has an invalid timestamp.', {
      lineNumber,
      timestamp: timestampText,
    });
  }

  const payload = parsed.payload;
  if (!isRecord(payload)) {
    throw new ValidationError('Replay JSONL line has an invalid payload.', { lineNumber });
  }

  return {
    id,
    threadId,
    type: type as EventType,
    sequence,
    timestamp,
    payload: payload as EventPayload,
  };
}

export function parseReplayEventsJsonl(jsonl: string): readonly DoorwayEvent[] {
  const events = jsonl
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNumber }) => parseReplayEventJsonLine(line, lineNumber));

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (previous && current && current.sequence <= previous.sequence) {
      throw new ValidationError('Replay JSONL sequences must be strictly increasing.', {
        lineNumber: index + 1,
        previousSequence: previous.sequence,
        sequence: current.sequence,
      });
    }
  }

  return events;
}

export function exportThreadReplayJsonl(db: Database.Database, threadId: ThreadId): string {
  return replayEventsJsonl(replayEvents(db, threadId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  field: 'id' | 'threadId' | 'type' | 'timestamp',
  lineNumber: number
): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`Replay JSONL line has an invalid ${field}.`, {
      lineNumber,
      [field]: value,
    });
  }
  return value;
}

/**
 * Get events for a thread with optional filtering.
 */
export function getEvents(
  db: Database.Database,
  threadId: ThreadId,
  options?: {
    type?: EventType;
    afterSequence?: number;
    limit?: number;
  }
): readonly DoorwayEvent[] {
  let query = 'SELECT * FROM events WHERE thread_id = ?';
  const params: (string | number)[] = [threadId];

  if (options?.type) {
    query += ' AND type = ?';
    params.push(options.type);
  }

  if (options?.afterSequence !== undefined) {
    query += ' AND sequence > ?';
    params.push(options.afterSequence);
  }

  query += ' ORDER BY sequence ASC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as EventRow[];

  return rows.map((row) => ({
    id: row.id as EventId,
    threadId: row.thread_id as ThreadId,
    type: row.type as EventType,
    payload: JSON.parse(row.payload) as EventPayload,
    timestamp: new Date(row.timestamp),
    sequence: row.sequence,
  }));
}

/**
 * Get the latest event sequence number.
 */
export function getLatestSequence(db: Database.Database): number {
  const row = db
    .prepare(
      `
    SELECT MAX(sequence) as seq FROM events
  `
    )
    .get() as { seq: number | null } | undefined;

  return row?.seq ?? 0;
}

// Type definitions for database rows
interface EventRow {
  id: string;
  thread_id: string;
  type: string;
  payload: string;
  sequence: number;
  timestamp: string;
}
