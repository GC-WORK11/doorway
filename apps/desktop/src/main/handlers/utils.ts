/**
 * Handler Utilities
 *
 * Shared utility functions for IPC handlers.
 */

import type { AgentEvent } from '@doorway/orchestrator';
import type { MemoryItem } from '@doorway/orchestrator';
import type {
  AgentRunId,
  EventPayload,
  EventType,
  FileChangeType,
  HandoffCapsuleId,
  MergeAssessmentProjection,
  ProjectMemorySource,
  TaskId,
  TerminalSessionId,
  ThreadId,
  ThreadReplayVerificationFailedPayload,
  ThreadReplayVerificationSucceededPayload,
  WorktreeId,
} from '@doorway/protocol';
import * as path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import {
  generateId,
  recordTerminalStarted,
  appendTerminalChunk,
  recordTerminalStopped,
  parseReplayEventsJsonl,
  exportThreadReplayJsonl,
  assertThreadToolEnabledWithReceipt,
} from '@doorway/core';

// ============================================================================
// Types
// ============================================================================

interface HandoffTerminalChunkRow {
  readonly text: string;
  readonly is_stdout: number;
  readonly is_stderr: number;
  readonly created_at: string;
}

interface BrowserEvidenceActionInput {
  readonly timestamp: Date | string;
  readonly type: string;
  readonly selector?: string;
  readonly text?: string;
  readonly url?: string;
  readonly screenshot?: string;
}

interface BrowserEvidenceBundleResult {
  readonly path: string;
  readonly actionCount: number;
  readonly screenshotCount: number;
  readonly createdAt: string;
}

interface ThreadReplayExportResult {
  readonly path: string;
  readonly eventCount: number;
  readonly createdAt: string;
}

export interface ThreadReplayVerificationResult {
  readonly path: string;
  readonly eventCount: number;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly threadIds: readonly ThreadId[];
}

export interface RendererClarificationPayload {
  readonly clarificationId: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly question: string;
  readonly context: string;
  readonly suggestedResponses?: readonly string[];
  readonly faultType: 'clarification_request';
  readonly reason: string;
  readonly message: string;
}

// ============================================================================
// Thread Utilities
// ============================================================================

export function shouldCreateThreadForAgentLaunch(req: {
  readonly threadId?: string;
  readonly projectId?: string;
}): boolean {
  return !req.threadId && Boolean(req.projectId);
}

export function handoffGoalFromThreadRow(row: {
  readonly title: string;
  readonly goal: string | null;
}): string {
  return row.goal?.trim() || row.title;
}

export function latestAgentRunId(
  rows: readonly { readonly id: string; readonly created_at: string }[]
): string | undefined {
  return [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at))[0]?.id;
}

// ============================================================================
// Git/Worktree Utilities
// ============================================================================

export function mapGitDiffStatus(status: string): FileChangeType {
  switch (status) {
    case 'added':
      return 'created';
    case 'modified':
    case 'deleted':
    case 'renamed':
      return status;
    default:
      return 'modified';
  }
}

export function taskIdFromDoorwayBranch(branch: string): string | null {
  const normalized = branch.replace(/^refs\/heads\//, '');
  const match = normalized.match(/^doorway\/([^/]+)/);
  return match?.[1] ?? null;
}

export function forkWorktreeBranchName(sourceBranch: string, suffix: string): string {
  const normalized = sourceBranch.replace(/^refs\/heads\//, '');
  const role = normalized.split('/').slice(2).join('-') || 'worktree';
  return `fork-${role.replace(/[^a-zA-Z0-9-_]/g, '-')}-${suffix}`;
}

export function assertCleanForkSource(
  status: { readonly exists: boolean; readonly isClean: boolean },
  worktreePath: string
): void {
  if (!status.exists) {
    throw new Error(`Doorway worktree path no longer exists: ${worktreePath}`);
  }
  if (!status.isClean) {
    throw new Error(
      `Cannot fork dirty worktree without committing or stashing changes: ${worktreePath}`
    );
  }
}

export function assertCleanArchiveSource(
  status: { readonly exists: boolean; readonly isClean: boolean },
  worktreePath: string
): void {
  if (!status.exists) {
    throw new Error(`Doorway worktree path no longer exists: ${worktreePath}`);
  }
  if (!status.isClean) {
    throw new Error(
      `Cannot archive dirty worktree without committing or stashing changes: ${worktreePath}`
    );
  }
}

// ============================================================================
// Merge Utilities
// ============================================================================

export function buildWorktreeMergeApproval(worktree: {
  readonly branch: string;
  readonly path: string;
}): {
  readonly taskId: TaskId;
  readonly command: string;
  readonly riskCategory: string;
  readonly decision: 'approved';
  readonly userNotes: string;
} {
  const taskId = taskIdFromDoorwayBranch(worktree.branch);
  if (!taskId) {
    throw new Error(`Cannot approve non-Doorway branch: ${worktree.branch}`);
  }
  return {
    taskId: taskId as TaskId,
    command: `merge ${worktree.branch.replace(/^refs\/heads\//, '')}`,
    riskCategory: 'merge_approval',
    decision: 'approved',
    userNotes: `Approved merge review for ${worktree.path}`,
  };
}

export function latestMergeAssessmentForTask(
  assessments: readonly MergeAssessmentProjection[],
  taskId: TaskId
): MergeAssessmentProjection | undefined {
  return assessments
    .filter((assessment) => assessment.taskId === taskId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
}

export function assertReadyForIntegrationMerge(
  assessments: readonly MergeAssessmentProjection[],
  taskId: TaskId
): void {
  const latest = latestMergeAssessmentForTask(assessments, taskId);
  if (!latest) {
    throw new Error(`Merge readiness has not been evaluated for task ${taskId}`);
  }
  if (latest.score !== 'ready') {
    throw new Error(`Latest MergeJudge score for task ${taskId} is ${latest.score}`);
  }
}

export function selectPostMergeTestCommand(commands: {
  readonly test?: string;
  readonly typecheck?: string;
  readonly lint?: string;
  readonly build?: string;
}): string | undefined {
  return commands.test;
}

// ============================================================================
// Handoff Utilities
// ============================================================================

export function normalizeHandoffProvider(
  provider: string | undefined
): 'claude' | 'codex' | 'reviewer' {
  if (provider === 'claude' || provider === 'codex' || provider === 'reviewer') {
    return provider;
  }
  return 'codex';
}

type ToolPolicyDatabase = Parameters<typeof assertThreadToolEnabledWithReceipt>[0];

export function assertReviewMergeToolEnabled(
  db: ToolPolicyDatabase,
  threadId: string,
  command: string
): void {
  assertThreadToolEnabledWithReceipt(db, {
    threadId,
    toolId: 'tool.review-merge',
    command,
  });
}

export function livePermissionDecisionOptions(
  rows: readonly {
    readonly id: string;
    readonly task_id: string;
    readonly terminal_session_id?: string | null;
  }[],
  request: {
    readonly runId?: string;
    readonly sessionId?: string;
    readonly command: string;
    readonly decision: 'approved' | 'denied';
    readonly riskCategory?: string;
    readonly userNotes?: string;
  }
): {
  readonly taskId: TaskId;
  readonly runId?: AgentRunId;
  readonly command: string;
  readonly riskCategory: string;
  readonly decision: 'approved' | 'denied';
  readonly userNotes: string;
} {
  const row =
    (request.runId ? rows.find((item) => item.id === request.runId) : undefined) ??
    (request.sessionId
      ? rows.find((item) => item.terminal_session_id === request.sessionId)
      : undefined) ??
    rows[0];
  if (!row) {
    throw new Error('No agent run exists for this live permission request.');
  }

  return {
    taskId: row.task_id as TaskId,
    runId: row.id as AgentRunId,
    command: request.command,
    riskCategory: request.riskCategory ?? 'live_permission',
    decision: request.decision,
    userNotes:
      request.userNotes ??
      (request.decision === 'approved'
        ? 'Approved from live permission modal.'
        : 'Denied from live permission modal.'),
  };
}

export function memorySourcesForEvent(
  items: readonly Pick<MemoryItem, 'sourceFile' | 'category' | 'content'>[]
): readonly ProjectMemorySource[] {
  return items.map((item) => ({
    sourceFile: item.sourceFile,
    category: item.category,
    contentLength: item.content.length,
  }));
}

// ============================================================================
// Evidence Utilities
// ============================================================================

export function terminalChunkRowsToAgentEvents(
  rows: readonly HandoffTerminalChunkRow[]
): AgentEvent[] {
  return rows.map((row) => ({
    type: row.is_stderr === 1 ? 'stderr' : 'stdout',
    data: row.text,
    timestamp: new Date(row.created_at),
  }));
}

export function browserEvidenceBundleJson(
  threadId: ThreadId,
  actions: readonly BrowserEvidenceActionInput[],
  createdAt: string
): string {
  return JSON.stringify(
    {
      kind: 'browser-evidence',
      threadId,
      createdAt,
      actions: actions.map((action, index) => ({
        sequence: index + 1,
        timestamp:
          action.timestamp instanceof Date ? action.timestamp.toISOString() : action.timestamp,
        type: action.type,
        ...(action.url ? { url: action.url } : {}),
        ...(action.selector ? { selector: action.selector } : {}),
        ...(action.text ? { text: action.text } : {}),
        ...(action.screenshot ? { screenshot: action.screenshot } : {}),
      })),
    },
    null,
    2
  );
}

export async function writeBrowserEvidenceBundle(options: {
  readonly dataDir: string;
  readonly threadId: ThreadId;
  readonly actions: readonly BrowserEvidenceActionInput[];
}): Promise<BrowserEvidenceBundleResult> {
  if (options.actions.length === 0) {
    throw new Error('No browser actions recorded for this thread.');
  }
  const createdAt = new Date().toISOString();
  const safeThreadId = String(options.threadId).replace(/[^A-Za-z0-9_-]/g, '-');
  const evidenceDir = path.join(options.dataDir, 'evidence', safeThreadId, 'browser');
  await mkdir(evidenceDir, { recursive: true });

  const filePath = path.join(evidenceDir, `bundle-${Date.now().toString(36)}.json`);
  await writeFile(
    filePath,
    browserEvidenceBundleJson(options.threadId, options.actions, createdAt),
    'utf-8'
  );

  return {
    path: filePath,
    actionCount: options.actions.length,
    screenshotCount: options.actions.filter((action) => Boolean(action.screenshot)).length,
    createdAt,
  };
}

// ============================================================================
// Replay Utilities
// ============================================================================

export async function writeThreadReplayJsonl(options: {
  readonly dataDir: string;
  readonly threadId: ThreadId;
  readonly jsonl: string;
}): Promise<ThreadReplayExportResult> {
  const createdAt = new Date().toISOString();
  const safeThreadId = String(options.threadId).replace(/[^A-Za-z0-9_-]/g, '-');
  const replayDir = path.join(options.dataDir, 'evidence', safeThreadId, 'replay');
  await mkdir(replayDir, { recursive: true });

  const filePath = path.join(replayDir, `thread-${Date.now().toString(36)}.jsonl`);
  await writeFile(filePath, options.jsonl, 'utf-8');

  return {
    path: filePath,
    eventCount: options.jsonl.trim() ? options.jsonl.trim().split('\n').length : 0,
    createdAt,
  };
}

export async function writeWorktreeRollbackPatch(options: {
  readonly dataDir: string;
  readonly threadId: ThreadId;
  readonly patch: string;
}): Promise<{ readonly path: string; readonly patchBytes: number; readonly createdAt: string }> {
  const trimmed = options.patch.trim();
  if (!trimmed) {
    throw new Error('No worktree changes available for rollback patch export.');
  }
  const createdAt = new Date().toISOString();
  const safeThreadId = String(options.threadId).replace(/[^A-Za-z0-9_-]/g, '-');
  const rollbackDir = path.join(options.dataDir, 'evidence', safeThreadId, 'rollback');
  await mkdir(rollbackDir, { recursive: true });

  const filePath = path.join(rollbackDir, `rollback-${Date.now().toString(36)}.patch`);
  await writeFile(filePath, options.patch, 'utf-8');

  return {
    path: filePath,
    patchBytes: Buffer.byteLength(options.patch, 'utf-8'),
    createdAt,
  };
}

export async function verifyThreadReplayJsonlFile(
  filePath: unknown
): Promise<ThreadReplayVerificationResult> {
  const replayPath = pathTextFromRequest(filePath);
  const events = parseReplayEventsJsonl(await readFile(replayPath, 'utf-8'));
  const first = events[0];
  const last = events[events.length - 1];
  const threadIds = [...new Set(events.map((event) => event.threadId))];

  return {
    path: replayPath,
    eventCount: events.length,
    firstSequence: first?.sequence ?? null,
    lastSequence: last?.sequence ?? null,
    threadIds,
  };
}

export function threadReplayVerificationFailedPayload(
  filePath: unknown,
  error: unknown,
  createdAt: string
): ThreadReplayVerificationFailedPayload {
  const replayPath =
    typeof filePath === 'string' && filePath.trim() ? filePath.trim() : 'unknown path';
  return {
    path: replayPath,
    error: error instanceof Error ? error.message : String(error),
    createdAt,
  };
}

export function threadReplayVerificationSucceededPayload(
  verification: ThreadReplayVerificationResult,
  createdAt: string
): ThreadReplayVerificationSucceededPayload {
  return {
    path: verification.path,
    eventCount: verification.eventCount,
    firstSequence: verification.firstSequence,
    lastSequence: verification.lastSequence,
    threadIds: verification.threadIds,
    createdAt,
  };
}

// ============================================================================
// Validation Utilities
// ============================================================================

export function clipboardTextFromRequest(text: unknown): string {
  if (typeof text !== 'string') {
    throw new Error('Clipboard text must be a string');
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Clipboard text is empty');
  }
  return trimmed;
}

export function pathTextFromRequest(pathValue: unknown): string {
  if (typeof pathValue !== 'string') {
    throw new Error('Path must be a string');
  }
  const trimmed = pathValue.trim();
  if (!trimmed) {
    throw new Error('Path is empty');
  }
  return trimmed;
}

export function handoffUsageEventPayload(req: {
  readonly threadId?: unknown;
  readonly capsuleId?: unknown;
  readonly action?: unknown;
  readonly worktreePath?: unknown;
  readonly filePath?: unknown;
}):
  | {
      readonly threadId: ThreadId;
      readonly payload: {
        readonly capsuleId: HandoffCapsuleId;
        readonly threadId: ThreadId;
        readonly action: 'copy_next_prompt' | 'open_worktree' | 'open_changed_file';
        readonly worktreePath?: string;
        readonly filePath?: string;
      };
    }
  | undefined {
  if (req.threadId === undefined && req.capsuleId === undefined) {
    return undefined;
  }
  if (typeof req.threadId !== 'string' || typeof req.capsuleId !== 'string') {
    throw new Error('Handoff usage requires threadId and capsuleId');
  }
  if (
    req.action !== 'copy_next_prompt' &&
    req.action !== 'open_worktree' &&
    req.action !== 'open_changed_file'
  ) {
    throw new Error('Handoff usage action is invalid');
  }
  const threadId = req.threadId as ThreadId;
  const worktreePath =
    req.worktreePath === undefined ? undefined : pathTextFromRequest(req.worktreePath);
  const filePath = req.filePath === undefined ? undefined : pathTextFromRequest(req.filePath);
  return {
    threadId,
    payload: {
      capsuleId: req.capsuleId as HandoffCapsuleId,
      threadId,
      action: req.action,
      ...(worktreePath ? { worktreePath } : {}),
      ...(filePath ? { filePath } : {}),
    },
  };
}

export function clarificationRendererPayload(request: {
  readonly id: string;
  readonly runId: AgentRunId;
  readonly sessionId: TerminalSessionId;
  readonly threadId: ThreadId;
  readonly question: string;
  readonly context: string;
  readonly suggestedResponses?: readonly string[];
}): RendererClarificationPayload {
  return {
    clarificationId: request.id,
    runId: request.runId,
    sessionId: request.sessionId,
    threadId: request.threadId,
    question: request.question,
    context: request.context,
    ...(request.suggestedResponses ? { suggestedResponses: request.suggestedResponses } : {}),
    faultType: 'clarification_request',
    reason: 'Terminal output requested user input.',
    message: request.question,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function handoffEventsForRun(
  db: Parameters<typeof import('@doorway/core').listHandoffCapsules>[0],
  runId: string
): AgentEvent[] {
  const rows = db
    .prepare(
      `
      SELECT
        COALESCE(chunks.clean_text, chunks.text) AS text,
        chunks.is_stdout,
        chunks.is_stderr,
        chunks.created_at
      FROM agent_runs runs
      JOIN terminal_chunks chunks ON chunks.session_id = runs.terminal_session_id
      WHERE runs.id = ?
      ORDER BY chunks.sequence ASC
    `
    )
    .all(runId) as HandoffTerminalChunkRow[];

  return terminalChunkRowsToAgentEvents(rows);
}

function isHighRiskFile(filePath: string): boolean {
  return [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    '.env',
    'migrations/',
    'infra/',
    'deployment/',
    '.doorway/',
  ].some((pattern) => filePath.includes(pattern));
}

export async function runPostMergeTest(
  db: Parameters<typeof recordTerminalStarted>[0],
  threadId: Parameters<typeof recordTerminalStarted>[1],
  cwd: string,
  command: string
): Promise<{ readonly exitCode: number | undefined; readonly output: string }> {
  const sessionId = generateId('term') as TerminalSessionId;
  const child = spawn('/bin/sh', ['-lc', command], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';

  recordTerminalStarted(db, threadId, {
    sessionId,
    runtime: 'external',
    workingDirectory: cwd,
    command,
    pid: child.pid ?? 0,
  });

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8');
    output += text;
    appendTerminalChunk(db, threadId, { sessionId, text, isStdout: true, isStderr: false });
  });
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8');
    output += text;
    appendTerminalChunk(db, threadId, { sessionId, text, isStdout: false, isStderr: true });
  });

  return new Promise((resolve, reject) => {
    child.on('error', (error) => {
      recordTerminalStopped(db, threadId, { sessionId, exitCode: 1, signal: undefined });
      reject(error);
    });
    child.on('close', (code, signal) => {
      const exitCode = code ?? undefined;
      recordTerminalStopped(db, threadId, {
        sessionId,
        exitCode,
        signal: signal ?? undefined,
      });
      resolve({ exitCode, output });
    });
  });
}

// Re-export for convenience
export { exportThreadReplayJsonl };

// Named exports for use in handlers
export { handoffEventsForRun, isHighRiskFile };
