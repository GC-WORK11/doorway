import type Database from 'better-sqlite3';
import type { TaskId, ThreadId, ToolCapabilityProjection } from '@doorway/protocol';
import { generateId, toISOString } from './id-gen.js';
import { recordPermissionReceipt } from './permission-evidence.js';

type ToolCapabilityDefinition = Omit<ToolCapabilityProjection, 'enabled' | 'status'> & {
  readonly requires: 'project' | 'thread';
};

interface ToolPermissionRow {
  readonly tool_id: string;
  readonly enabled: number;
}

export const builtInToolCapabilities: readonly ToolCapabilityDefinition[] = [
  {
    id: 'tool.claude-code',
    name: 'Claude Code',
    surface: 'agent',
    requires: 'project',
    permissions: ['pty_execution', 'worktree_write', 'approval_receipts'],
    evidence: ['terminal_transcript', 'agent_run_event', 'worktree_diff'],
  },
  {
    id: 'tool.codex-cli',
    name: 'Codex CLI',
    surface: 'agent',
    requires: 'project',
    permissions: ['protocol_execution', 'worktree_write', 'model_selection'],
    evidence: ['json_stream', 'agent_run_event', 'worktree_diff'],
  },
  {
    id: 'tool.generic-cli',
    name: 'Generic CLI',
    surface: 'agent',
    requires: 'project',
    permissions: ['pty_execution', 'worktree_write', 'environment_variables'],
    evidence: ['terminal_transcript', 'agent_run_event', 'worktree_diff'],
  },
  {
    id: 'tool.browser-proof',
    name: 'Browser proof',
    surface: 'browser',
    requires: 'thread',
    permissions: ['browser_automation', 'screenshot_capture', 'evidence_export'],
    evidence: ['browser_action', 'screenshot', 'browser_bundle'],
  },
  {
    id: 'tool.review-merge',
    name: 'Review merge',
    surface: 'worktree',
    requires: 'thread',
    permissions: ['diff_read', 'merge_preview', 'merge_approval'],
    evidence: ['merge_assessment', 'permission_receipt', 'test_proof'],
  },
];

export function toolIdForAgentProvider(provider: string | undefined): string {
  switch (provider) {
    case 'codex':
      return 'tool.codex-cli';
    case 'generic':
      return 'tool.generic-cli';
    case 'claude':
    case 'cloudcode':
    case undefined:
      return 'tool.claude-code';
    default:
      return `tool.${provider}`;
  }
}

export function listToolCapabilities(
  db: Database.Database,
  options: {
    readonly projectId?: string;
    readonly threadId?: string;
  } = {}
): readonly ToolCapabilityProjection[] {
  const enabledByTool = new Map<string, boolean>();
  if (options.threadId) {
    const rows = db
      .prepare('SELECT tool_id, enabled FROM thread_tool_permissions WHERE thread_id = ?')
      .all(options.threadId) as ToolPermissionRow[];
    for (const row of rows) {
      enabledByTool.set(row.tool_id, row.enabled === 1);
    }
  }

  return builtInToolCapabilities.map((tool) => {
    const { requires, ...projection } = tool;
    return {
      ...projection,
      enabled: enabledByTool.get(tool.id) ?? true,
      status:
        requires === 'project'
          ? options.projectId
            ? 'available'
            : 'requires_project'
          : options.threadId
            ? 'available'
            : 'requires_thread',
    };
  });
}

export function setThreadToolEnabled(
  db: Database.Database,
  options: {
    readonly threadId: string;
    readonly toolId: string;
    readonly enabled: boolean;
  }
): ToolCapabilityProjection {
  const tool = builtInToolCapabilities.find((item) => item.id === options.toolId);
  if (!tool) {
    throw new Error(`Unknown tool capability: ${options.toolId}`);
  }

  db.prepare(
    `
    INSERT INTO thread_tool_permissions (thread_id, tool_id, enabled, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(thread_id, tool_id)
    DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
  `
  ).run(options.threadId, options.toolId, options.enabled ? 1 : 0, new Date().toISOString());

  const updated = listToolCapabilities(db, { threadId: options.threadId }).find(
    (item) => item.id === options.toolId
  );
  if (!updated) {
    throw new Error(`Tool capability was not projected after update: ${options.toolId}`);
  }
  return updated;
}

export function assertThreadToolEnabled(
  db: Database.Database,
  threadId: string,
  toolId: string
): void {
  const row = db
    .prepare('SELECT enabled FROM thread_tool_permissions WHERE thread_id = ? AND tool_id = ?')
    .get(threadId, toolId) as { readonly enabled: number } | undefined;
  if (row?.enabled === 0) {
    throw new Error(`Tool is disabled for this thread: ${toolId}`);
  }
}

export function assertThreadToolEnabledWithReceipt(
  db: Database.Database,
  options: {
    readonly threadId: string;
    readonly toolId: string;
    readonly command: string;
  }
): void {
  const row = db
    .prepare('SELECT enabled FROM thread_tool_permissions WHERE thread_id = ? AND tool_id = ?')
    .get(options.threadId, options.toolId) as { readonly enabled: number } | undefined;
  if (row?.enabled !== 0) {
    return;
  }

  const taskId = createPolicyDenialTask(db, options.threadId, options.toolId);
  recordPermissionReceipt(db, options.threadId as ThreadId, {
    taskId,
    command: options.command,
    riskCategory: 'tool_disabled',
    decision: 'denied',
    userNotes: `Blocked by thread tool policy: ${options.toolId}`,
  });
  throw new Error(`Tool is disabled for this thread: ${options.toolId}`);
}

function createPolicyDenialTask(db: Database.Database, threadId: string, toolId: string): TaskId {
  const thread = db.prepare('SELECT project_id FROM threads WHERE id = ?').get(threadId) as
    | { readonly project_id: string }
    | undefined;
  if (!thread) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  const taskId = generateId('task') as TaskId;
  db.prepare(
    `
    INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    taskId,
    thread.project_id,
    `Denied ${toolId} launch`,
    'policy',
    'blocked',
    toISOString(new Date())
  );
  return taskId;
}
