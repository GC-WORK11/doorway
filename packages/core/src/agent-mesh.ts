import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type {
  MeshAgentKind,
  MeshAgentStatus,
  MeshMessageKind,
  MeshMessageProjection,
  ThreadId,
} from '@doorway/protocol';
import { NotFoundError, ValidationError } from './errors.js';
import { generateId, toISOString } from './id-gen.js';
import { redactTerminalText } from './terminal-evidence.js';

export type { MeshAgentKind, MeshAgentStatus, MeshMessageKind, MeshMessageProjection };

export type MeshLoopStatus = 'active' | 'warning' | 'paused' | 'approval_required' | 'hard_stopped';

export interface RegisteredMeshAgent {
  readonly id: string;
  readonly threadId: string;
  readonly displayName: string;
  readonly kind: MeshAgentKind;
  readonly toolName: string;
  readonly role: string;
  readonly status: MeshAgentStatus;
  readonly terminalSessionId?: string;
  readonly worktreeId?: string;
  readonly runId?: string;
  readonly mailboxId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MeshMessage {
  readonly id: string;
  readonly threadId: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly kind: MeshMessageKind;
  readonly content: string;
  readonly evidenceRefs: readonly string[];
  readonly status: 'unhandled' | 'handled';
  readonly requiresHumanApproval: boolean;
  readonly createdAt: Date;
  readonly handledAt?: Date;
}

export interface MeshLoopMetric {
  readonly id: string;
  readonly threadId: string;
  readonly routeKey: string;
  readonly messageCount: number;
  readonly repeatedHashCount: number;
  readonly lastContentHash?: string;
  readonly lastNewEvidenceAt?: Date;
  readonly status: MeshLoopStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface MeshAgentRow {
  readonly id: string;
  readonly thread_id: string;
  readonly display_name: string;
  readonly kind: string;
  readonly tool_name: string;
  readonly role: string;
  readonly status: string;
  readonly terminal_session_id: string | null;
  readonly worktree_id: string | null;
  readonly run_id: string | null;
  readonly mailbox_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MeshMessageRow {
  readonly id: string;
  readonly thread_id: string;
  readonly from_agent_id: string;
  readonly to_agent_id: string;
  readonly kind: string;
  readonly content: string;
  readonly evidence_refs: string;
  readonly status: string;
  readonly requires_human_approval: number;
  readonly created_at: string;
  readonly handled_at: string | null;
}

interface MeshMessageProjectionRow extends MeshMessageRow {
  readonly from_display_name: string;
  readonly from_agent_kind: string;
  readonly to_display_name: string;
  readonly to_agent_kind: string;
}

interface MeshLoopMetricRow {
  readonly id: string;
  readonly thread_id: string;
  readonly route_key: string;
  readonly message_count: number;
  readonly repeated_hash_count: number;
  readonly last_content_hash: string | null;
  readonly last_new_evidence_at: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export function registerMeshAgent(
  db: Database.Database,
  input: {
    readonly threadId: string;
    readonly displayName: string;
    readonly kind: MeshAgentKind;
    readonly toolName: string;
    readonly role: string;
    readonly status?: MeshAgentStatus;
    readonly terminalSessionId?: string;
    readonly worktreeId?: string;
    readonly runId?: string;
  }
): RegisteredMeshAgent {
  assertThreadExists(db, input.threadId);
  const now = toISOString(new Date());
  const agentId = generateId('mesh_agent');
  const mailboxId = generateId('mailbox');

  db.prepare(
    `
    INSERT INTO agent_mesh_agents (
      id, thread_id, display_name, kind, tool_name, role, status,
      terminal_session_id, worktree_id, run_id, mailbox_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    agentId,
    input.threadId,
    input.displayName,
    input.kind,
    input.toolName,
    input.role,
    input.status ?? 'starting',
    input.terminalSessionId ?? null,
    input.worktreeId ?? null,
    input.runId ?? null,
    mailboxId,
    now,
    now
  );

  return getMeshAgent(db, agentId);
}

export function listMeshAgents(
  db: Database.Database,
  threadId: string
): readonly RegisteredMeshAgent[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM agent_mesh_agents
      WHERE thread_id = ?
      ORDER BY created_at ASC, id ASC
    `
    )
    .all(threadId) as MeshAgentRow[];
  return rows.map(rowToMeshAgent);
}

export function sendPeerMessage(
  db: Database.Database,
  input: {
    readonly threadId: string;
    readonly fromAgentId: string;
    readonly toAgentId: string;
    readonly kind: MeshMessageKind;
    readonly content: string;
    readonly evidenceRefs?: readonly string[];
    readonly requiresHumanApproval?: boolean;
  }
): MeshMessage {
  const fromAgent = getMeshAgent(db, input.fromAgentId);
  const toAgent = getMeshAgent(db, input.toAgentId);
  if (fromAgent.threadId !== input.threadId || toAgent.threadId !== input.threadId) {
    throw new ValidationError('Peer messages must stay inside one Doorway thread.', {
      threadId: input.threadId,
      fromAgentThreadId: fromAgent.threadId,
      toAgentThreadId: toAgent.threadId,
    });
  }

  const loopMetric = updateMeshLoopMetric(db, {
    threadId: input.threadId,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    content: input.content,
    evidenceRefs: input.evidenceRefs ?? [],
  });
  const requiresLoopApproval =
    loopMetric.status === 'paused' ||
    loopMetric.status === 'approval_required' ||
    loopMetric.status === 'hard_stopped';
  const messageId = generateId('mesh_msg');
  const createdAt = toISOString(new Date());
  db.prepare(
    `
    INSERT INTO mesh_messages (
      id, thread_id, from_agent_id, to_agent_id, kind, content, evidence_refs,
      status, requires_human_approval, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'unhandled', ?, ?)
  `
  ).run(
    messageId,
    input.threadId,
    input.fromAgentId,
    input.toAgentId,
    input.kind,
    redactTerminalText(input.content),
    JSON.stringify(input.evidenceRefs ?? []),
    input.requiresHumanApproval === true || requiresLoopApproval ? 1 : 0,
    createdAt
  );

  return getMeshMessage(db, messageId);
}

export function listMeshLoopMetrics(
  db: Database.Database,
  threadId: string
): readonly MeshLoopMetric[] {
  assertThreadExists(db, threadId);
  const rows = db
    .prepare(
      `
      SELECT *
      FROM mesh_loop_metrics
      WHERE thread_id = ?
      ORDER BY updated_at DESC, route_key ASC
    `
    )
    .all(threadId) as MeshLoopMetricRow[];
  return rows.map(rowToMeshLoopMetric);
}

export function pullPeerMessages(
  db: Database.Database,
  agentId: string,
  options?: { readonly includeHandled?: boolean }
): readonly MeshMessage[] {
  getMeshAgent(db, agentId);
  const rows = db
    .prepare(
      `
      SELECT *
      FROM mesh_messages
      WHERE to_agent_id = ?
        AND (? = 1 OR status = 'unhandled')
      ORDER BY created_at ASC, id ASC
    `
    )
    .all(agentId, options?.includeHandled === true ? 1 : 0) as MeshMessageRow[];
  return rows.map(rowToMeshMessage);
}

export function markPeerMessageHandled(db: Database.Database, messageId: string): MeshMessage {
  getMeshMessage(db, messageId);
  db.prepare(
    `
    UPDATE mesh_messages
    SET status = 'handled', handled_at = ?
    WHERE id = ?
  `
  ).run(toISOString(new Date()), messageId);
  return getMeshMessage(db, messageId);
}

export function listThreadPeerMessages(
  db: Database.Database,
  threadId: string
): readonly MeshMessageProjection[] {
  assertThreadExists(db, threadId);
  const rows = db
    .prepare(
      `
      SELECT
        messages.*,
        from_agent.display_name AS from_display_name,
        from_agent.kind AS from_agent_kind,
        to_agent.display_name AS to_display_name,
        to_agent.kind AS to_agent_kind
      FROM mesh_messages messages
      JOIN agent_mesh_agents from_agent ON from_agent.id = messages.from_agent_id
      JOIN agent_mesh_agents to_agent ON to_agent.id = messages.to_agent_id
      WHERE messages.thread_id = ?
      ORDER BY messages.created_at DESC, messages.id DESC
    `
    )
    .all(threadId) as MeshMessageProjectionRow[];

  return rows.map(rowToMeshMessageProjection);
}

function assertThreadExists(db: Database.Database, threadId: string): void {
  const row = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId) as
    | { readonly id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('Thread', threadId);
  }
}

function getMeshAgent(db: Database.Database, agentId: string): RegisteredMeshAgent {
  const row = db.prepare('SELECT * FROM agent_mesh_agents WHERE id = ?').get(agentId) as
    | MeshAgentRow
    | undefined;
  if (!row) {
    throw new NotFoundError('Mesh agent', agentId);
  }
  return rowToMeshAgent(row);
}

function getMeshMessage(db: Database.Database, messageId: string): MeshMessage {
  const row = db.prepare('SELECT * FROM mesh_messages WHERE id = ?').get(messageId) as
    | MeshMessageRow
    | undefined;
  if (!row) {
    throw new NotFoundError('Mesh message', messageId);
  }
  return rowToMeshMessage(row);
}

function updateMeshLoopMetric(
  db: Database.Database,
  input: {
    readonly threadId: string;
    readonly fromAgentId: string;
    readonly toAgentId: string;
    readonly content: string;
    readonly evidenceRefs: readonly string[];
  }
): MeshLoopMetric {
  const routeKey = [input.fromAgentId, input.toAgentId].sort().join(':');
  const contentHash = hashPeerMessageContent(input.content);
  const now = toISOString(new Date());
  const existing = db
    .prepare('SELECT * FROM mesh_loop_metrics WHERE thread_id = ? AND route_key = ?')
    .get(input.threadId, routeKey) as MeshLoopMetricRow | undefined;
  const messageCount = (existing?.message_count ?? 0) + 1;
  const repeatedHashCount =
    existing?.last_content_hash === contentHash ? existing.repeated_hash_count + 1 : 0;
  const lastNewEvidenceAt =
    input.evidenceRefs.length > 0 ? now : (existing?.last_new_evidence_at ?? null);
  const status = meshLoopStatus({
    messageCount,
    repeatedHashCount,
    hasNewEvidence: Boolean(lastNewEvidenceAt),
  });

  if (existing) {
    db.prepare(
      `
      UPDATE mesh_loop_metrics
      SET message_count = ?,
          repeated_hash_count = ?,
          last_content_hash = ?,
          last_new_evidence_at = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `
    ).run(
      messageCount,
      repeatedHashCount,
      contentHash,
      lastNewEvidenceAt,
      status,
      now,
      existing.id
    );
    return getMeshLoopMetric(db, existing.id);
  }

  const metricId = generateId('mesh_loop');
  db.prepare(
    `
    INSERT INTO mesh_loop_metrics (
      id, thread_id, route_key, message_count, repeated_hash_count, last_content_hash,
      last_new_evidence_at, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    metricId,
    input.threadId,
    routeKey,
    messageCount,
    repeatedHashCount,
    contentHash,
    lastNewEvidenceAt,
    status,
    now,
    now
  );
  return getMeshLoopMetric(db, metricId);
}

function getMeshLoopMetric(db: Database.Database, metricId: string): MeshLoopMetric {
  const row = db.prepare('SELECT * FROM mesh_loop_metrics WHERE id = ?').get(metricId) as
    | MeshLoopMetricRow
    | undefined;
  if (!row) {
    throw new NotFoundError('Mesh loop metric', metricId);
  }
  return rowToMeshLoopMetric(row);
}

function hashPeerMessageContent(content: string): string {
  return createHash('sha256').update(content.trim().toLowerCase()).digest('hex');
}

function meshLoopStatus(input: {
  readonly messageCount: number;
  readonly repeatedHashCount: number;
  readonly hasNewEvidence: boolean;
}): MeshLoopStatus {
  if (!input.hasNewEvidence && input.messageCount >= 12) {
    return 'hard_stopped';
  }
  if (input.messageCount >= 12 || input.repeatedHashCount >= 6) {
    return 'approval_required';
  }
  if (input.messageCount >= 8 || input.repeatedHashCount >= 4) {
    return 'paused';
  }
  if (input.messageCount >= 4 || input.repeatedHashCount >= 2) {
    return 'warning';
  }
  return 'active';
}

function rowToMeshAgent(row: MeshAgentRow): RegisteredMeshAgent {
  return {
    id: row.id,
    threadId: row.thread_id,
    displayName: row.display_name,
    kind: row.kind as MeshAgentKind,
    toolName: row.tool_name,
    role: row.role,
    status: row.status as MeshAgentStatus,
    ...(row.terminal_session_id ? { terminalSessionId: row.terminal_session_id } : {}),
    ...(row.worktree_id ? { worktreeId: row.worktree_id } : {}),
    ...(row.run_id ? { runId: row.run_id } : {}),
    mailboxId: row.mailbox_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToMeshMessage(row: MeshMessageRow): MeshMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_agent_id,
    kind: row.kind as MeshMessageKind,
    content: row.content,
    evidenceRefs: JSON.parse(row.evidence_refs) as string[],
    status: row.status as MeshMessage['status'],
    requiresHumanApproval: row.requires_human_approval === 1,
    createdAt: new Date(row.created_at),
    ...(row.handled_at ? { handledAt: new Date(row.handled_at) } : {}),
  };
}

function rowToMeshLoopMetric(row: MeshLoopMetricRow): MeshLoopMetric {
  return {
    id: row.id,
    threadId: row.thread_id,
    routeKey: row.route_key,
    messageCount: row.message_count,
    repeatedHashCount: row.repeated_hash_count,
    ...(row.last_content_hash ? { lastContentHash: row.last_content_hash } : {}),
    ...(row.last_new_evidence_at ? { lastNewEvidenceAt: new Date(row.last_new_evidence_at) } : {}),
    status: row.status as MeshLoopStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToMeshMessageProjection(row: MeshMessageProjectionRow): MeshMessageProjection {
  return {
    id: row.id,
    threadId: row.thread_id as ThreadId,
    fromAgentId: row.from_agent_id,
    fromDisplayName: row.from_display_name,
    fromAgentKind: row.from_agent_kind as MeshAgentKind,
    toAgentId: row.to_agent_id,
    toDisplayName: row.to_display_name,
    toAgentKind: row.to_agent_kind as MeshAgentKind,
    kind: row.kind as MeshMessageKind,
    content: row.content,
    evidenceRefs: JSON.parse(row.evidence_refs) as string[],
    status: row.status as MeshMessageProjection['status'],
    requiresHumanApproval: row.requires_human_approval === 1,
    createdAt: new Date(row.created_at),
    ...(row.handled_at ? { handledAt: new Date(row.handled_at) } : {}),
    evidence: [
      {
        kind: 'mesh',
        id: row.id,
        label: `${row.from_display_name} -> ${row.to_display_name}`,
      },
    ],
  };
}
