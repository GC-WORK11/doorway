import type Database from 'better-sqlite3';
import type {
  AdapterId,
  AgentAttentionState,
  AgentRole,
  AgentRunId,
  AgentRunStatus,
  TaskId,
  TerminalSessionId,
  TerminalSessionStatus,
  ThreadId,
  ToolLaneProjection,
  ToolLaneRole,
  ToolLaneStatus,
  WorktreeId,
} from '@doorway/protocol';

export function listToolLaneProjections(
  db: Database.Database,
  threadId: ThreadId
): readonly ToolLaneProjection[] {
  const rows = db
    .prepare(
      `
      SELECT
        agent_runs.id,
        agent_runs.thread_id,
        agent_runs.task_id,
        agent_runs.role,
        agent_runs.adapter_id,
        agent_runs.worktree_id,
        agent_runs.terminal_session_id,
        agent_runs.status,
        agent_runs.created_at,
        agent_runs.started_at,
        agent_runs.completed_at,
        terminal_sessions.id AS resolved_terminal_session_id,
        terminal_sessions.status AS terminal_status,
        terminal_sessions.command AS terminal_command,
        terminal_sessions.started_at AS terminal_started_at,
        terminal_sessions.stopped_at AS terminal_stopped_at,
        (
          SELECT json_extract(events.payload, '$.state')
          FROM events
          WHERE events.thread_id = agent_runs.thread_id
            AND events.type = 'agent.attention'
            AND json_extract(events.payload, '$.sessionId') = terminal_sessions.id
          ORDER BY events.sequence DESC
          LIMIT 1
        ) AS latest_attention_state,
        (
          SELECT events.timestamp
          FROM events
          WHERE events.thread_id = agent_runs.thread_id
            AND events.type = 'agent.attention'
            AND json_extract(events.payload, '$.sessionId') = terminal_sessions.id
          ORDER BY events.sequence DESC
          LIMIT 1
        ) AS latest_attention_at,
        terminal_chunks.text AS latest_output,
        terminal_chunks.created_at AS latest_output_at,
        terminal_inputs.text AS latest_input,
        terminal_inputs.created_at AS latest_input_at
      FROM agent_runs
      LEFT JOIN terminal_sessions
        ON terminal_sessions.id = agent_runs.terminal_session_id
        OR terminal_sessions.agent_run_id = agent_runs.id
      LEFT JOIN terminal_chunks
        ON terminal_chunks.session_id = terminal_sessions.id
        AND terminal_chunks.sequence = (
          SELECT MAX(sequence)
          FROM terminal_chunks latest_chunks
          WHERE latest_chunks.session_id = terminal_sessions.id
        )
      LEFT JOIN terminal_inputs
        ON terminal_inputs.session_id = terminal_sessions.id
        AND terminal_inputs.sequence = (
          SELECT MAX(sequence)
          FROM terminal_inputs latest_inputs
          WHERE latest_inputs.session_id = terminal_sessions.id
        )
      WHERE agent_runs.thread_id = ?
      ORDER BY COALESCE(latest_output_at, latest_input_at, terminal_started_at, agent_runs.started_at, agent_runs.created_at) DESC
    `
    )
    .all(threadId) as ToolLaneRow[];

  return rows.map((row) => {
    const terminalSessionId = row.resolved_terminal_session_id ?? row.terminal_session_id;
    const latestActivity = latestLaneActivity(row);
    return {
      id: row.id as AgentRunId,
      threadId: row.thread_id as ThreadId,
      taskId: row.task_id as TaskId,
      runId: row.id as AgentRunId,
      toolId: row.adapter_id as AdapterId,
      role: toolLaneRole(row.role as AgentRole),
      runRole: row.role as AgentRole,
      status: toolLaneStatus(
        row.status as AgentRunStatus,
        row.terminal_status ? (row.terminal_status as TerminalSessionStatus) : undefined,
        row.latest_attention_state ? (row.latest_attention_state as AgentAttentionState) : undefined
      ),
      ...(terminalSessionId ? { terminalSessionId: terminalSessionId as TerminalSessionId } : {}),
      ...(row.worktree_id ? { worktreeId: row.worktree_id as WorktreeId } : {}),
      latestActivity,
      latestActivityAt: new Date(
        row.latest_output_at ??
          row.latest_input_at ??
          row.latest_attention_at ??
          row.terminal_started_at ??
          row.started_at ??
          row.completed_at ??
          row.created_at
      ),
    };
  });
}

export function findReusableToolLane(
  db: Database.Database,
  options: {
    readonly threadId: ThreadId;
    readonly provider?: string;
  }
): ToolLaneProjection | undefined {
  const expectedToolId = adapterIdForProvider(options.provider);
  return listToolLaneProjections(db, options.threadId).find((lane) => {
    if (!lane.terminalSessionId || lane.toolId !== expectedToolId) {
      return false;
    }
    return ['running', 'waiting_for_input', 'needs_approval'].includes(lane.status);
  });
}

export function followUpTerminalInput(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed ? `${trimmed}\n` : '\n';
}

function adapterIdForProvider(provider: string | undefined): AdapterId {
  switch (provider) {
    case 'codex':
      return 'codex' as AdapterId;
    case 'generic':
      return 'generic' as AdapterId;
    case 'claude':
    case 'cloudcode':
    case undefined:
      return 'claude' as AdapterId;
    default:
      return provider as AdapterId;
  }
}

function latestLaneActivity(row: ToolLaneRow): string {
  const latestOutput = preview(row.latest_output);
  if (latestOutput) {
    return latestOutput;
  }
  const latestInput = preview(row.latest_input);
  if (latestInput) {
    return `Input: ${latestInput}`;
  }
  if (row.terminal_command) {
    return row.terminal_command;
  }
  return row.status.replace(/_/g, ' ');
}

function preview(text: string | null): string | undefined {
  const normalized = text?.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function toolLaneRole(role: AgentRole): ToolLaneRole {
  switch (role) {
    case 'reviewer':
      return 'reviewer';
    case 'tester':
      return 'tester';
    case 'backend':
    case 'frontend':
    case 'architect':
    case 'integration':
    case 'debugger':
      return 'implementer';
    case 'custom':
      return 'custom';
  }
}

function toolLaneStatus(
  runStatus: AgentRunStatus,
  terminalStatus: TerminalSessionStatus | undefined,
  attentionState: AgentAttentionState | undefined
): ToolLaneStatus {
  if (runStatus === 'approval_required') {
    return 'needs_approval';
  }
  if (runStatus === 'waiting_for_user') {
    return 'waiting_for_input';
  }
  if (runStatus === 'needs_retry') {
    return 'stuck';
  }
  if (runStatus === 'review_ready') {
    return 'reviewable';
  }
  if (['done', 'merged', 'archived'].includes(runStatus)) {
    return 'completed';
  }
  if (['failed', 'crashed', 'cancelled', 'discarded'].includes(runStatus)) {
    return 'failed';
  }
  if (terminalStatus === 'stopped' || terminalStatus === 'detached') {
    return 'stopped';
  }
  if (terminalStatus === 'crashed') {
    return 'failed';
  }
  if (attentionState === 'needs_approval') {
    return 'needs_approval';
  }
  if (attentionState === 'needs_input') {
    return 'waiting_for_input';
  }
  if (attentionState === 'possibly_stuck' || attentionState === 'stuck') {
    return 'stuck';
  }
  if (attentionState === 'failed') {
    return 'failed';
  }
  if (attentionState === 'completed') {
    return 'reviewable';
  }
  if (terminalStatus === 'waiting') {
    return 'waiting_for_input';
  }
  if (terminalStatus === 'running') {
    return 'running';
  }
  return 'starting';
}

interface ToolLaneRow {
  readonly id: string;
  readonly thread_id: string;
  readonly task_id: string;
  readonly role: string;
  readonly adapter_id: string;
  readonly worktree_id: string | null;
  readonly terminal_session_id: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly resolved_terminal_session_id: string | null;
  readonly terminal_status: string | null;
  readonly terminal_command: string | null;
  readonly terminal_started_at: string | null;
  readonly terminal_stopped_at: string | null;
  readonly latest_attention_state: string | null;
  readonly latest_attention_at: string | null;
  readonly latest_output: string | null;
  readonly latest_output_at: string | null;
  readonly latest_input: string | null;
  readonly latest_input_at: string | null;
}
