/**
 * Thread Service
 * CRUD operations for Doorway threads, messages, and runs.
 */

import type Database from 'better-sqlite3';
import type {
  ThreadId,
  MessageId,
  AgentRunId,
  TerminalSessionId,
  WorktreeId,
  ProjectId,
  TaskId,
  DoorwayThread,
  DoorwayMessage,
  AgentRun,
  Worktree,
  ThreadStatus,
  MessageRole,
  AgentRunStatus,
  WorktreeStatus,
  AgentRole,
  Attachment,
  ProviderId,
  MessageAppendedPayload,
  ThreadStatusChangedPayload,
} from '@doorway/protocol';
import { NotFoundError, ValidationError } from './errors.js';
import { toISOString, generateId } from './id-gen.js';
import { assertProjectExists } from './project-service.js';
import { recordEvent } from './event-service.js';

/**
 * Create a new Doorway thread.
 */
export function createThread(
  db: Database.Database,
  projectId: ProjectId,
  title: string,
  goal: string,
  options?: {
    permissionMode?: 'open' | 'restricted' | 'locked';
    tags?: readonly string[];
  }
): DoorwayThread {
  assertProjectExists(db, projectId);

  const threadId = generateId('thread') as ThreadId;
  const now = toISOString(new Date());

  db.prepare(
    `
    INSERT INTO threads (id, project_id, title, status, goal, permission_mode, tags, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `
  ).run(
    threadId,
    projectId,
    title,
    goal,
    options?.permissionMode ?? 'open',
    JSON.stringify(options?.tags ?? []),
    now,
    now
  );

  return {
    id: threadId,
    projectId,
    title,
    status: 'active',
    createdAt: new Date(now),
    updatedAt: new Date(now),
    messages: [],
    events: [],
    agentRuns: [],
    metadata: {
      goal,
      tags: options?.tags ?? [],
      permissionMode: options?.permissionMode ?? 'open',
    },
  };
}

/**
 * Get a thread by ID with all related data.
 */
export function getThread(db: Database.Database, threadId: ThreadId): DoorwayThread {
  const threadRow = db
    .prepare(
      `
    SELECT id, project_id, title, status, goal, permission_mode, tags, created_at, updated_at
    FROM threads
    WHERE id = ?
  `
    )
    .get(threadId) as ThreadRow | undefined;

  if (!threadRow) {
    throw new NotFoundError('Thread', threadId);
  }

  const messages = getMessagesForThread(db, threadId);
  const agentRuns = getAgentRunsForThread(db, threadId);

  return {
    id: threadRow.id as ThreadId,
    projectId: threadRow.project_id as ProjectId,
    title: threadRow.title,
    status: threadRow.status as ThreadStatus,
    createdAt: new Date(threadRow.created_at),
    updatedAt: new Date(threadRow.updated_at),
    messages,
    events: [], // Events loaded separately if needed
    agentRuns,
    metadata: {
      goal: threadRow.goal,
      tags: JSON.parse(threadRow.tags) as readonly string[],
      permissionMode: threadRow.permission_mode as 'open' | 'restricted' | 'locked',
    },
  };
}

/**
 * List all threads for a project.
 */
export function listThreads(
  db: Database.Database,
  projectId: ProjectId,
  options?: {
    status?: ThreadStatus;
    limit?: number;
    offset?: number;
  }
): readonly DoorwayThread[] {
  let query = 'SELECT * FROM threads WHERE project_id = ?';
  const params: (string | number)[] = [projectId];

  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY updated_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  if (options?.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  const rows = db.prepare(query).all(...params) as ThreadRow[];

  return rows.map((row) => ({
    id: row.id as ThreadId,
    projectId: row.project_id as ProjectId,
    title: row.title,
    status: row.status as ThreadStatus,
    goal: row.goal,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    messages: [], // Lazy load if needed
    events: [],
    agentRuns: [],
    metadata: {
      goal: row.goal,
      tags: JSON.parse(row.tags) as readonly string[],
      permissionMode: row.permission_mode as 'open' | 'restricted' | 'locked',
    },
  }));
}

/**
 * Update thread status.
 */
export function updateThreadStatus(
  db: Database.Database,
  threadId: ThreadId,
  status: ThreadStatus
): void {
  const now = toISOString(new Date());
  const existing = db.prepare('SELECT status FROM threads WHERE id = ?').get(threadId) as
    | { status: string }
    | undefined;

  if (!existing) {
    throw new NotFoundError('Thread', threadId);
  }

  const result = db
    .prepare(
      `
    UPDATE threads SET status = ?, updated_at = ? WHERE id = ?
  `
    )
    .run(status, now, threadId);

  if (result.changes === 0) {
    throw new NotFoundError('Thread', threadId);
  }

  recordEvent(db, threadId, 'thread.status_changed', {
    threadId,
    previousStatus: existing.status as ThreadStatus,
    newStatus: status,
  } satisfies ThreadStatusChangedPayload);
}

/**
 * Append a message to a thread.
 */
export function appendMessage(
  db: Database.Database,
  threadId: ThreadId,
  role: MessageRole,
  content: string,
  options?: {
    provider?: string;
    model?: string;
    attachments?: readonly Attachment[];
  }
): DoorwayMessage {
  const messageId = generateId('msg') as MessageId;
  const now = toISOString(new Date());

  db.prepare(
    `
    INSERT INTO messages (id, thread_id, role, content, attachments, provider, model, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    messageId,
    threadId,
    role,
    content,
    JSON.stringify(options?.attachments ?? []),
    options?.provider ?? null,
    options?.model ?? null,
    now
  );

  // Update thread updated_at
  db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(now, threadId);

  recordEvent(db, threadId, 'message.appended', {
    messageId,
    threadId,
    role,
    content,
    ...(options?.provider ? { provider: options.provider as ProviderId } : {}),
  } satisfies MessageAppendedPayload);

  return {
    id: messageId,
    threadId,
    role,
    content,
    attachments: options?.attachments ?? [],
    createdAt: new Date(now),
    provider: (options?.provider ?? undefined) as ProviderId | undefined,
    model: options?.model,
  };
}

/**
 * Get messages for a thread.
 */
export function getMessagesForThread(
  db: Database.Database,
  threadId: ThreadId
): readonly DoorwayMessage[] {
  const rows = db
    .prepare(
      `
    SELECT id, thread_id, role, content, attachments, provider, model, created_at
    FROM messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
  `
    )
    .all(threadId) as MessageRow[];

  return rows.map((row) => ({
    id: row.id as MessageId,
    threadId: row.thread_id as ThreadId,
    role: row.role as MessageRole,
    content: row.content,
    attachments: JSON.parse(row.attachments) as readonly Attachment[],
    createdAt: new Date(row.created_at),
    provider: (row.provider ?? undefined) as ProviderId | undefined,
    model: row.model ?? undefined,
  }));
}

/**
 * Create an agent run.
 */
export function createAgentRun(
  db: Database.Database,
  threadId: ThreadId,
  taskId: TaskId,
  role: AgentRole,
  adapterId: string,
  worktreeId: WorktreeId | undefined,
  terminalSessionId: TerminalSessionId | undefined
): AgentRun {
  const runId = generateId('run') as AgentRunId;
  const now = toISOString(new Date());

  db.prepare(
    `
    INSERT INTO agent_runs (id, thread_id, task_id, role, adapter_id, worktree_id, terminal_session_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?)
  `
  ).run(
    runId,
    threadId,
    taskId,
    role,
    adapterId,
    worktreeId ?? null,
    terminalSessionId ?? null,
    now
  );

  return {
    id: runId,
    threadId,
    taskId,
    role,
    adapterId: adapterId as import('@doorway/protocol').AdapterId,
    ...(worktreeId ? { worktreeId } : {}),
    ...(terminalSessionId ? { terminalSessionId } : {}),
    status: 'created',
    createdAt: new Date(now),
    fileChanges: [],
    transcript: [],
  };
}

export function upsertAgentRunLaunch(
  db: Database.Database,
  options: {
    readonly runId: AgentRunId;
    readonly threadId: ThreadId;
    readonly taskId: TaskId;
    readonly role: AgentRole;
    readonly adapterId: string;
    readonly worktreeId?: WorktreeId;
    readonly terminalSessionId: TerminalSessionId;
    readonly status: AgentRunStatus;
    readonly startedAt: Date;
  }
): void {
  const startedAt = toISOString(options.startedAt);

  db.prepare(
    `
    INSERT INTO agent_runs (
      id, thread_id, task_id, role, adapter_id, worktree_id, terminal_session_id, status, created_at, started_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      worktree_id = excluded.worktree_id,
      terminal_session_id = excluded.terminal_session_id,
      status = excluded.status,
      started_at = excluded.started_at
  `
  ).run(
    options.runId,
    options.threadId,
    options.taskId,
    options.role,
    options.adapterId,
    options.worktreeId ?? null,
    options.terminalSessionId,
    options.status,
    startedAt,
    startedAt
  );
}

/**
 * Update agent run status.
 */
export function updateAgentRunStatus(
  db: Database.Database,
  runId: AgentRunId,
  status: AgentRunStatus,
  options?: {
    exitCode?: number;
    summary?: string;
    startedAt?: Date;
    completedAt?: Date;
  }
): void {
  const updates: string[] = ['status = ?'];
  const params: (string | number | null)[] = [status];

  if (options?.exitCode !== undefined) {
    updates.push('exit_code = ?');
    params.push(options.exitCode);
  }

  if (options?.summary !== undefined) {
    updates.push('summary = ?');
    params.push(options.summary);
  }

  if (options?.startedAt !== undefined) {
    updates.push('started_at = ?');
    params.push(toISOString(options.startedAt));
  }

  if (options?.completedAt !== undefined) {
    updates.push('completed_at = ?');
    params.push(toISOString(options.completedAt));
  }

  params.push(runId);

  const result = db
    .prepare(
      `
    UPDATE agent_runs SET ${updates.join(', ')} WHERE id = ?
  `
    )
    .run(...params);

  if (result.changes === 0) {
    throw new NotFoundError('AgentRun', runId);
  }
}

/**
 * Get agent runs for a thread.
 */
export function getAgentRunsForThread(
  db: Database.Database,
  threadId: ThreadId
): readonly AgentRun[] {
  const rows = db
    .prepare(
      `
    SELECT id, thread_id, task_id, role, adapter_id, worktree_id, terminal_session_id, 
           status, exit_code, summary, created_at, started_at, completed_at
    FROM agent_runs
    WHERE thread_id = ?
    ORDER BY created_at ASC
  `
    )
    .all(threadId) as AgentRunRow[];

  return rows.map((row) => ({
    id: row.id as AgentRunId,
    threadId: row.thread_id as ThreadId,
    taskId: row.task_id as TaskId,
    role: row.role as AgentRole,
    adapterId: row.adapter_id as import('@doorway/protocol').AdapterId,
    ...(row.worktree_id ? { worktreeId: row.worktree_id as WorktreeId } : {}),
    ...(row.terminal_session_id
      ? { terminalSessionId: row.terminal_session_id as TerminalSessionId }
      : {}),
    status: row.status as AgentRunStatus,
    exitCode: row.exit_code ?? undefined,
    summary: row.summary ?? undefined,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    fileChanges: [], // Lazy load if needed
    transcript: [],
  }));
}

/**
 * Create a worktree record.
 */
export function createWorktree(
  db: Database.Database,
  projectId: ProjectId,
  taskId: TaskId,
  path: string,
  branch: string,
  options?: {
    agentRunId?: AgentRunId;
  }
): Worktree {
  const worktreeId = generateId('wt') as WorktreeId;
  const now = toISOString(new Date());

  db.prepare(
    `
    INSERT INTO worktrees (id, project_id, task_id, agent_run_id, path, branch, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
  `
  ).run(worktreeId, projectId, taskId, options?.agentRunId ?? null, path, branch, now);

  return {
    id: worktreeId,
    projectId,
    taskId,
    agentRunId: options?.agentRunId,
    path,
    branch,
    status: 'active',
    createdAt: new Date(now),
    fileChanges: [],
  };
}

/**
 * Archive a worktree.
 */
export function archiveWorktree(db: Database.Database, worktreeId: WorktreeId): void {
  const now = toISOString(new Date());

  const result = db
    .prepare(
      `
    UPDATE worktrees SET status = 'archived', archived_at = ? WHERE id = ?
  `
    )
    .run(now, worktreeId);

  if (result.changes === 0) {
    throw new NotFoundError('Worktree', worktreeId);
  }
}

/**
 * List worktrees for a project.
 */
export function listWorktrees(
  db: Database.Database,
  projectId: ProjectId,
  options?: {
    status?: WorktreeStatus;
    taskId?: TaskId;
  }
): readonly Worktree[] {
  let query = 'SELECT * FROM worktrees WHERE project_id = ?';
  const params: string[] = [projectId];

  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  if (options?.taskId) {
    query += ' AND task_id = ?';
    params.push(options.taskId);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as WorktreeRow[];

  return rows.map((row) => ({
    id: row.id as WorktreeId,
    projectId: row.project_id as ProjectId,
    taskId: row.task_id as TaskId,
    agentRunId: row.agent_run_id as AgentRunId | undefined,
    path: row.path,
    branch: row.branch,
    status: row.status as WorktreeStatus,
    createdAt: new Date(row.created_at),
    archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
    fileChanges: [],
  }));
}

// Type definitions for database rows
interface ThreadRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  goal: string;
  permission_mode: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  attachments: string;
  provider: string | null;
  model: string | null;
  created_at: string;
}

interface AgentRunRow {
  id: string;
  thread_id: string;
  task_id: string;
  role: string;
  adapter_id: string;
  worktree_id: string;
  terminal_session_id: string;
  status: string;
  exit_code: number | null;
  summary: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface WorktreeRow {
  id: string;
  project_id: string;
  task_id: string;
  agent_run_id: string | null;
  path: string;
  branch: string;
  status: string;
  created_at: string;
  archived_at: string | null;
}

import { createDatabase } from './database.js';

export class ThreadService {
  private db: Database.Database;

  constructor(config: { inMemory?: boolean; dbPath?: string }) {
    // If inMemory is true, better-sqlite3 uses ':memory:'
    const dataPath = config.inMemory ? ':memory:' : config.dbPath || '.doorway';
    this.db = createDatabase({ dataPath });
  }

  createThread(options: {
    title?: string;
    worktreePath?: string;
    goal?: string;
    projectId: string;
  }) {
    if (!options.projectId) {
      throw new ValidationError('Thread creation requires a real project id.');
    }

    const thread = createThread(
      this.db,
      options.projectId as ProjectId,
      options.title ?? 'New Thread',
      options.goal ?? ''
    );

    recordEvent(this.db, thread.id, 'thread.created', {
      threadId: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      goal: thread.metadata.goal,
    });

    return thread;
  }

  getThread(threadId: string) {
    return getThread(this.db, threadId as ThreadId);
  }

  listThreads(projectId: string) {
    return listThreads(this.db, projectId as ProjectId);
  }

  addMessage(threadId: string, options: { role: string; content: string }) {
    return appendMessage(
      this.db,
      threadId as ThreadId,
      options.role as MessageRole,
      options.content
    );
  }

  getMessages(threadId: string) {
    return getMessagesForThread(this.db, threadId as ThreadId);
  }

  startAgentRun(threadId: string, options: { provider: string; model: string; role: string }) {
    return createAgentRun(
      this.db,
      threadId as ThreadId,
      'default_task' as TaskId,
      options.role as AgentRole,
      options.provider,
      'default_worktree' as import('@doorway/protocol').WorktreeId,
      'default_session' as import('@doorway/protocol').TerminalSessionId
    );
  }
}
