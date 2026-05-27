/**
 * IPC Handlers
 *
 * All IPC handlers organized by domain.
 */

import { ipcMain, BrowserWindow, clipboard, shell, dialog } from 'electron';
import {
  ProjectService,
  ThreadService,
  dbEventBus,
  createCompactCheckpoint,
  findReusableToolLane,
  followUpTerminalInput,
  getEvents,
  getThreadOperationalMemory,
  listCompactCheckpoints,
  listTerminalProjections,
  listToolLaneProjections,
  getTerminalTranscript,
  listTerminalInputs,
  listHandoffCapsules,
  listThreadPeerMessages,
  listTaskGraphsForThread,
  updateTaskNodeStatus,
  listProviderModels,
  listToolCapabilities,
  listProjectPlugins,
  setThreadToolEnabled,
  assertThreadToolEnabledWithReceipt,
  toolIdForAgentProvider,
  listProofs,
  listPermissionReceipts,
  listMergeAssessments,
  recordPermissionReceipt,
  recordMergeAssessment,
  recordEvent,
  recordTerminalStarted,
  appendTerminalChunk,
  recordTerminalInput,
  recordTerminalStateDetection,
  recordTerminalStopped,
  recordProcessSnapshot,
  recordProcessSnapshotFailed,
  recordTerminalFileDeltaSnapshot,
  recordTerminalFileDeltaFailed,
  createAutomation,
  deleteAutomation,
  getAutomationById,
  listAutomations,
  listAutomationRuns,
  updateAutomation,
  parseMultiAgentDirective,
  type ClarificationRequest,
} from '@doorway/core';
import { isValidCronExpression, Orchestrator, SchedulerRuntime } from '@doorway/orchestrator';
import {
  ClaudeCodeAdapter,
  CodexCliAdapter,
  CursorAdapter,
  GeminiAdapter,
  AgyAdapter,
} from '@doorway/adapters';
import {
  captureProcessTree,
  SessionManager,
  startFileDeltaWatcher,
  type FileDeltaWatcher,
} from '@doorway/terminal-runtime';
import {
  WorktreeManager,
  GitEngine,
  GitDiffService,
  getCurrentBranch,
  getStatus,
  TestCommandDiscoveryService,
} from '@doorway/git-engine';
import { createMergeEngine, type MergePlan } from '@doorway/review-merge';
import type {
  AdapterId,
  AgentLaunchOptions,
  AgentRunId,
  DiffProjection,
  EventPayload,
  EventType,
  TerminalInputSource,
  TerminalSessionId,
  TaskId,
  ThreadId,
  WorktreeId,
} from '@doorway/protocol';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { vault } from '../vault.js';
import {
  shouldCreateThreadForAgentLaunch,
  handoffGoalFromThreadRow,
  latestAgentRunId,
  taskIdFromDoorwayBranch,
  forkWorktreeBranchName,
  assertCleanForkSource,
  assertCleanArchiveSource,
  buildWorktreeMergeApproval,
  latestMergeAssessmentForTask,
  assertReadyForIntegrationMerge,
  selectPostMergeTestCommand,
  normalizeHandoffProvider,
  memorySourcesForEvent,
  terminalChunkRowsToAgentEvents,
  writeBrowserEvidenceBundle,
  writeThreadReplayJsonl,
  writeWorktreeRollbackPatch,
  verifyThreadReplayJsonlFile,
  threadReplayVerificationFailedPayload,
  threadReplayVerificationSucceededPayload,
  clipboardTextFromRequest,
  pathTextFromRequest,
  handoffUsageEventPayload,
  clarificationRendererPayload,
  runPostMergeTest,
  handoffEventsForRun,
  isHighRiskFile,
  exportThreadReplayJsonl,
  mapGitDiffStatus,
  type ThreadReplayVerificationResult,
} from './utils.js';
import { registerStreamingHandlers, terminalStreamHub } from './streaming-ipc.js';
import {
  createFaultRecoveryService,
  type RecoveryAction,
  type RunningProcess,
} from '@doorway/core';

// ============================================================================
// Types
// ============================================================================

interface MainHandlersConfig {
  cwd?: string;
  dataDir?: string;
}

// ============================================================================
// Main Window Management
// ============================================================================

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

async function captureAndRecordProcessSnapshot(options: {
  readonly db: ReturnType<typeof import('@doorway/core').createDatabase>;
  readonly threadId: ThreadId;
  readonly sessionId: TerminalSessionId;
  readonly rootPid: number;
  readonly phase: 'started' | 'running' | 'stopped';
}): Promise<void> {
  try {
    const snapshot = await captureProcessTree(options.rootPid);
    if (snapshot.nodes.length === 0) {
      recordProcessSnapshotFailed(options.db, options.threadId, {
        sessionId: options.sessionId,
        phase: options.phase,
        rootPid: options.rootPid,
        reason: 'No process rows were visible for the terminal root pid.',
      });
      return;
    }
    recordProcessSnapshot(options.db, options.threadId, {
      sessionId: options.sessionId,
      phase: options.phase,
      rootPid: options.rootPid,
      nodes: snapshot.nodes,
    });
  } catch (error) {
    recordProcessSnapshotFailed(options.db, options.threadId, {
      sessionId: options.sessionId,
      phase: options.phase,
      rootPid: options.rootPid,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function startAndRecordFileDeltaWatcher(options: {
  readonly db: ReturnType<typeof import('@doorway/core').createDatabase>;
  readonly threadId: ThreadId;
  readonly sessionId: TerminalSessionId;
  readonly rootPath: string;
}): Promise<FileDeltaWatcher> {
  return startFileDeltaWatcher({
    rootPath: options.rootPath,
    onDelta: (delta) => {
      recordTerminalFileDeltaSnapshot(options.db, options.threadId, {
        sessionId: options.sessionId,
        phase: delta.phase,
        rootPath: delta.rootPath,
        changes: delta.changes,
      });
    },
    onError: (error) => {
      recordTerminalFileDeltaFailed(options.db, options.threadId, {
        sessionId: options.sessionId,
        phase: 'running',
        rootPath: options.rootPath,
        reason: error.message,
      });
    },
  });
}

async function flushAndCloseFileDeltaWatcher(options: {
  readonly db: ReturnType<typeof import('@doorway/core').createDatabase>;
  readonly threadId: ThreadId;
  readonly sessionId: TerminalSessionId;
  readonly watcher: FileDeltaWatcher;
}): Promise<void> {
  try {
    await options.watcher.flush('stopped');
  } catch (error) {
    recordTerminalFileDeltaFailed(options.db, options.threadId, {
      sessionId: options.sessionId,
      phase: 'stopped',
      rootPath: options.watcher.rootPath,
      reason: error instanceof Error ? error.message : String(error),
    });
  } finally {
    options.watcher.close();
  }
}

// ============================================================================
// Project Handlers
// ============================================================================

function registerProjectHandlers(projectService: ProjectService): void {
  ipcMain.handle('project:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('project:open', async (_event, req) => {
    return projectService.openProject({
      path: req.path,
      name: req.name,
      packageManager: req.packageManager,
      framework: req.framework,
      mode: req.mode,
    });
  });

  ipcMain.handle('project:list', async () => {
    return projectService.listProjects();
  });

  ipcMain.handle('project:memory-sources', async (_event, req) => {
    return memorySourcesForEvent(
      await orchestrator.memory.previewProjectMemory(pathTextFromRequest(req.path))
    );
  });

  ipcMain.handle('project:list-plugins', async (_event, req) => {
    return listProjectPlugins(projectService.getProject(req.projectId).path);
  });
}

// ============================================================================
// Thread Handlers
// ============================================================================

function registerThreadHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  threadService: ThreadService,
  orchestrator: Orchestrator,
  dataDir: string
): void {
  ipcMain.handle('thread:create', async (_event, req) => {
    return threadService.createThread({
      projectId: req.projectId,
      title: req.title,
      goal: req.goal,
    });
  });

  ipcMain.handle('thread:get', async (_event, { id }) => {
    return threadService.getThread(id);
  });

  ipcMain.handle('thread:list', async (_event, req) => {
    if (!req?.projectId) {
      return [];
    }
    return threadService.listThreads(req.projectId);
  });

  ipcMain.handle('thread:add-message', async (_event, { threadId, role, content }) => {
    return threadService.addMessage(threadId, { role, content });
  });

  ipcMain.handle('thread:get-messages', async (_event, { threadId }) => {
    return threadService.getMessages(threadId);
  });

  ipcMain.handle('thread:get-events', async (_event, { threadId }) => {
    return getEvents(db, threadId);
  });

  ipcMain.handle('thread:get-operational-memory', async (_event, { threadId }) => {
    return getThreadOperationalMemory(db, threadId);
  });

  ipcMain.handle('thread:export-replay', async (_event, { threadId }) => {
    if (typeof threadId !== 'string' || !threadId.trim()) {
      throw new Error('Thread replay export requires threadId.');
    }
    const threadKey = threadId as ThreadId;
    const exported = await writeThreadReplayJsonl({
      dataDir,
      threadId: threadKey,
      jsonl: exportThreadReplayJsonl(db, threadKey),
    });
    recordEvent(db, threadKey, 'thread.replay_exported', {
      path: exported.path,
      eventCount: exported.eventCount,
      createdAt: exported.createdAt,
    });
    return exported;
  });

  ipcMain.handle('thread:verify-replay', async (_event, { path: replayPath, threadId }) => {
    try {
      const verification = await verifyThreadReplayJsonlFile(replayPath);
      if (typeof threadId === 'string' && threadId.trim()) {
        recordEvent(
          db,
          threadId.trim() as ThreadId,
          'thread.replay_verification_succeeded',
          threadReplayVerificationSucceededPayload(verification, new Date().toISOString())
        );
      }
      return verification;
    } catch (error) {
      if (typeof threadId === 'string' && threadId.trim()) {
        recordEvent(
          db,
          threadId.trim() as ThreadId,
          'thread.replay_verification_failed',
          threadReplayVerificationFailedPayload(replayPath, error, new Date().toISOString())
        );
      }
      throw error;
    }
  });

  ipcMain.handle('thread:get-proofs', async (_event, { threadId }) => {
    return listProofs(db, threadId);
  });

  ipcMain.handle('thread:get-permission-receipts', async (_event, { threadId }) => {
    return listPermissionReceipts(db, threadId);
  });

  ipcMain.handle('thread:get-merge-assessments', async (_event, { threadId }) => {
    return listMergeAssessments(db, threadId);
  });

  ipcMain.handle('thread:get-handoff-capsules', async (_event, { threadId }) => {
    return listHandoffCapsules(db, threadId);
  });

  ipcMain.handle('thread:get-peer-messages', async (_event, { threadId }) => {
    return listThreadPeerMessages(db, threadId);
  });

  ipcMain.handle('thread:get-task-graphs', async (_event, { threadId }) => {
    return listTaskGraphsForThread(db, threadId);
  });

  ipcMain.handle('thread:get-compact-checkpoints', async (_event, { threadId }) => {
    return listCompactCheckpoints(db, threadId);
  });

  ipcMain.handle('thread:create-compact-checkpoint', async (_event, { threadId }) => {
    if (typeof threadId !== 'string' || !threadId.trim()) {
      throw new Error('Compact checkpoint requires threadId.');
    }
    return createCompactCheckpoint(db, threadId.trim() as ThreadId);
  });
}

// ============================================================================
// Permission Handlers
// ============================================================================

function registerPermissionHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  threadService: ThreadService
): void {
  ipcMain.handle('permission:decide', async (_event, req) => {
    const rows = db
      .prepare(
        `
        SELECT id, task_id, terminal_session_id
        FROM agent_runs
        WHERE thread_id = ?
        ORDER BY created_at DESC
      `
      )
      .all(req.threadId) as {
      readonly id: string;
      readonly task_id: string;
      readonly terminal_session_id: string | null;
    }[];

    const row =
      (req.runId ? rows.find((item) => item.id === req.runId) : undefined) ??
      (req.sessionId
        ? rows.find((item) => item.terminal_session_id === req.sessionId)
        : undefined) ??
      rows[0];

    if (!row) {
      throw new Error('No agent run exists for this live permission request.');
    }

    return recordPermissionReceipt(db, req.threadId, {
      taskId: row.task_id as TaskId,
      runId: row.id as AgentRunId,
      command: req.command,
      riskCategory: req.riskCategory ?? 'live_permission',
      decision: req.decision,
      userNotes:
        req.userNotes ??
        (req.decision === 'approved'
          ? 'Approved from live permission modal.'
          : 'Denied from live permission modal.'),
    });
  });
}

// ============================================================================
// Tool/Provider Handlers
// ============================================================================

function registerToolHandlers(db: ReturnType<typeof import('@doorway/core').createDatabase>): void {
  ipcMain.handle('task-graph:update-node-status', async (_event, { threadId, nodeId, status }) => {
    return updateTaskNodeStatus(db, threadId, nodeId, status);
  });

  ipcMain.handle('provider:list-models', async () => {
    return listProviderModels(db);
  });

  ipcMain.handle('tools:list-capabilities', async (_event, req) => {
    return listToolCapabilities(db, {
      projectId:
        typeof req?.projectId === 'string' && req.projectId.trim().length > 0
          ? req.projectId
          : undefined,
      threadId:
        typeof req?.threadId === 'string' && req.threadId.trim().length > 0
          ? req.threadId
          : undefined,
    });
  });

  ipcMain.handle('tools:list-lanes', async (_event, req) => {
    const threadId = typeof req?.threadId === 'string' ? req.threadId.trim() : '';
    if (!threadId) {
      return [];
    }
    return listToolLaneProjections(db, threadId as ThreadId);
  });

  ipcMain.handle('tools:set-enabled', async (_event, req) => {
    const threadId = typeof req?.threadId === 'string' ? req.threadId.trim() : '';
    const toolId = typeof req?.toolId === 'string' ? req.toolId.trim() : '';
    if (!threadId || !toolId) {
      throw new Error('Updating a tool permission requires threadId and toolId.');
    }
    return setThreadToolEnabled(db, {
      threadId,
      toolId,
      enabled: Boolean(req.enabled),
    });
  });
}

type AutomationMutationRequest = {
  readonly projectId?: string;
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly cronExpression?: string;
  readonly command?: string;
  readonly enabled?: boolean;
};

export function assertAutomationMutationRequest(
  req: AutomationMutationRequest,
  mode: 'create' | 'update'
): void {
  if (mode === 'update' && !req.id?.trim()) {
    throw new Error('Automation update requires an id.');
  }
  if (mode === 'create' && !req.projectId?.trim()) {
    throw new Error('Automation creation requires a project id.');
  }
  if (mode === 'create' && !req.name?.trim()) {
    throw new Error('Automation creation requires a name.');
  }
  if (mode === 'create' && !req.command?.trim()) {
    throw new Error('Automation creation requires a command.');
  }
  if (mode === 'create' && !req.cronExpression?.trim()) {
    throw new Error('Automation creation requires a cron expression.');
  }
  if (req.cronExpression !== undefined && !isValidCronExpression(req.cronExpression)) {
    throw new Error(`Invalid automation cron expression: ${req.cronExpression}`);
  }
}

function registerAutomationHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  scheduler: SchedulerRuntime
): void {
  ipcMain.handle('automation:list', async (_event, { projectId }) => {
    return listAutomations(db, { projectId });
  });

  ipcMain.handle('automation:create', async (_event, req: AutomationMutationRequest) => {
    assertAutomationMutationRequest(req, 'create');
    return createAutomation(db, {
      projectId: req.projectId!,
      name: req.name!.trim(),
      description: req.description?.trim() || undefined,
      cronExpression: req.cronExpression!.trim(),
      command: req.command!.trim(),
      enabled: req.enabled,
    });
  });

  ipcMain.handle('automation:update', async (_event, req: AutomationMutationRequest) => {
    assertAutomationMutationRequest(req, 'update');
    const updated = updateAutomation(db, {
      id: req.id!.trim(),
      ...(req.name !== undefined ? { name: req.name.trim() } : {}),
      ...(req.description !== undefined ? { description: req.description.trim() } : {}),
      ...(req.cronExpression !== undefined ? { cronExpression: req.cronExpression.trim() } : {}),
      ...(req.command !== undefined ? { command: req.command.trim() } : {}),
      ...(req.enabled !== undefined ? { enabled: req.enabled } : {}),
    });
    if (!updated) {
      throw new Error(`Automation not found: ${req.id}`);
    }
    return updated;
  });

  ipcMain.handle('automation:delete', async (_event, { id }) => {
    if (!id?.trim()) {
      throw new Error('Automation deletion requires an id.');
    }
    return { deleted: deleteAutomation(db, id.trim()) };
  });

  ipcMain.handle('automation:runs', async (_event, { automationId }) => {
    if (!automationId?.trim()) {
      throw new Error('Automation history requires an automation id.');
    }
    return listAutomationRuns(db, automationId.trim(), { limit: 25 });
  });

  ipcMain.handle('automation:run-now', async (_event, { id }) => {
    if (!id?.trim() || !getAutomationById(db, id.trim())) {
      throw new Error(`Automation not found: ${id}`);
    }
    return scheduler.triggerAutomation(id.trim());
  });
}

// ============================================================================
// Clipboard/File Handlers
// ============================================================================

function registerClipboardHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>
): void {
  ipcMain.handle('clipboard:write-text', async (_event, { text, threadId, capsuleId }) => {
    clipboard.writeText(clipboardTextFromRequest(text));
    const usage = handoffUsageEventPayload({ threadId, capsuleId, action: 'copy_next_prompt' });
    if (usage) {
      recordEvent(db, usage.threadId, 'handoff.used' as EventType, usage.payload as EventPayload);
    }
    return { copied: true };
  });

  ipcMain.handle(
    'file:open-path',
    async (
      _event,
      { path: filePath, threadId, capsuleId, worktreePath, filePath: changedFilePath }
    ) => {
      const openedPath = pathTextFromRequest(filePath);
      const error = await shell.openPath(openedPath);
      if (error) {
        throw new Error(error);
      }
      const changedFilePathValue =
        changedFilePath === undefined ? undefined : pathTextFromRequest(changedFilePath);
      const usage = handoffUsageEventPayload({
        threadId,
        capsuleId,
        action: changedFilePathValue ? 'open_changed_file' : 'open_worktree',
        worktreePath: worktreePath ?? openedPath,
        ...(changedFilePathValue ? { filePath: changedFilePathValue } : {}),
      });
      if (usage) {
        recordEvent(db, usage.threadId, 'handoff.used' as EventType, usage.payload as EventPayload);
      }
      return { opened: true };
    }
  );
}

// ============================================================================
// Handoff Handlers
// ============================================================================

function registerHandoffHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  threadService: ThreadService,
  orchestrator: Orchestrator
): void {
  ipcMain.handle('handoff:create', async (_event, { threadId, worktreePath, targetProvider }) => {
    const threadRow = db.prepare('SELECT title, goal FROM threads WHERE id = ?').get(threadId) as
      | { title: string; goal: string | null }
      | undefined;
    if (!threadRow) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const runRows = db
      .prepare('SELECT id, created_at FROM agent_runs WHERE thread_id = ?')
      .all(threadId) as { id: string; created_at: string }[];
    const runId = latestAgentRunId(runRows);
    if (!runId) {
      throw new Error(`No agent run recorded for thread ${threadId}`);
    }

    let changedFiles: string[] = [];
    let branch: string | undefined;
    if (worktreePath) {
      const diffService = new GitDiffService(new GitEngine({ cwd: worktreePath }));
      const diff = await diffService.getWorktreeDiff(worktreePath);
      changedFiles = diff.changes.map((change) => change.path);
      branch = await getCurrentBranch(worktreePath);
    }

    await orchestrator.handoff.createPacket({
      threadId,
      runId,
      goal: handoffGoalFromThreadRow(threadRow),
      events: handoffEventsForRun(db, runId),
      changedFiles,
      providerType: normalizeHandoffProvider(targetProvider),
      ...(worktreePath ? { worktreePath } : {}),
      ...(branch ? { branch } : {}),
      brain: orchestrator.brain,
    });

    return listHandoffCapsules(db, threadId).at(-1);
  });
}

// ============================================================================
// Agent Handlers
// ============================================================================

function registerAgentHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  threadService: ThreadService,
  projectService: ProjectService,
  orchestrator: Orchestrator,
  sessionManager: SessionManager,
  cwd: string
): void {
  ipcMain.handle('agent:launch', async (_event, req) => {
    const { threadId, prompt, provider, launchOptions } = req as {
      readonly threadId?: string;
      readonly projectId?: string;
      readonly prompt: string;
      readonly provider?: string;
      readonly launchOptions?: AgentLaunchOptions;
      readonly taskId?: string;
    };

    // Check for multi-agent directive (e.g., "@claude @codex implement auth")
    const multiAgentDirective = parseMultiAgentDirective(prompt);
    const isMultiAgent = multiAgentDirective && multiAgentDirective.agentTargets.length > 1;

    let thread;
    if (threadId) {
      thread = await threadService.getThread(threadId);
    } else if (shouldCreateThreadForAgentLaunch(req)) {
      thread = await threadService.createThread({ projectId: req.projectId, goal: prompt });
    } else {
      throw new Error('Launching an agent without a thread requires projectId.');
    }

    const actualThreadId = thread.id;
    const projectId = thread.projectId;
    const project = projectService.getProject(projectId);

    // For multi-agent directives, use launch-best-of-n path
    if (isMultiAgent && multiAgentDirective) {
      const providers = multiAgentDirective.agentTargets.map((t) => t.provider);

      for (const launchProvider of providers) {
        assertThreadToolEnabledWithReceipt(db, {
          threadId: actualThreadId,
          toolId: toolIdForAgentProvider(launchProvider),
          command: `agent:launch ${launchProvider}`,
        });
      }

      await threadService.addMessage(actualThreadId, {
        role: 'user',
        content: prompt,
      });

      const runIds = await orchestrator.executeBestOfN(
        actualThreadId,
        projectId,
        multiAgentDirective.goal,
        providers,
        undefined,
        {
          projectPath: project.path,
          useWorktree: project.mode === 'git',
          ...(launchOptions ? { launchOptions } : {}),
        }
      );

      const main = getMainWindow();
      for (const runId of runIds) {
        const run = orchestrator.getRun(runId);
        const adapter = orchestrator.getAdapter(run?.provider || 'claude');
        adapter?.onEvent((event) => {
          orchestrator.recordEvent(thread.id, 'agent_event', { runId, ...event });
          if (main && !main.isDestroyed()) {
            main.webContents.send('agent:event', { runId, ...event });
          }
        });
      }

      return {
        runIds,
        threadId: actualThreadId,
        multiAgent: true,
      };
    }

    // Single agent path
    assertThreadToolEnabledWithReceipt(db, {
      threadId: actualThreadId,
      toolId: toolIdForAgentProvider(provider),
      command: `agent:launch ${provider ?? 'claude'}`,
    });

    await threadService.addMessage(actualThreadId, {
      role: 'user',
      content: prompt,
    });

    const reusableLane = findReusableToolLane(db, {
      threadId: actualThreadId as ThreadId,
      provider,
    });
    if (
      reusableLane?.terminalSessionId &&
      sessionManager.hasSession(reusableLane.terminalSessionId)
    ) {
      const followUpInput = followUpTerminalInput(prompt);
      sessionManager.sendInput(reusableLane.terminalSessionId, followUpInput);
      recordTerminalInput(db, actualThreadId as ThreadId, {
        sessionId: reusableLane.terminalSessionId,
        text: followUpInput,
        source: 'doorway',
      });
      return {
        runId: reusableLane.runId,
        sessionId: reusableLane.terminalSessionId,
        threadId: actualThreadId,
        reusedLane: true,
      };
    }

    const runId = await orchestrator.executeTask(actualThreadId, projectId, prompt, {
      provider: provider ?? 'claude',
      useWorktree: project.mode === 'git',
      projectPath: project.path,
      ...(launchOptions ? { launchOptions } : {}),
    });

    const run = orchestrator.getRun(runId);
    if (run) {
      const memorySources = memorySourcesForEvent(
        await orchestrator.memory.getActiveMemory(projectId)
      );
      recordEvent(db, actualThreadId as ThreadId, 'agent_run.created', {
        runId: runId as AgentRunId,
        threadId: actualThreadId as ThreadId,
        taskId: run.taskId,
        role: 'custom',
        adapterId: run.provider as AdapterId,
        ...(run.worktreeId ? { worktreeId: run.worktreeId as WorktreeId } : {}),
        ...(run.launchOptions ? { launchOptions: run.launchOptions } : {}),
        ...(memorySources.length > 0 ? { memorySources } : {}),
      });
    }

    const adapter = orchestrator.getAdapter(run?.provider || 'claude');
    const main = getMainWindow();
    adapter?.onEvent((event) => {
      orchestrator.recordEvent(req.taskId || 'default', 'agent_event', { runId, ...event });
      if (main && !main.isDestroyed()) {
        main.webContents.send('agent:event', { runId, ...event });
      }
    });

    return {
      runId,
      sessionId: run?.sessionId || 'current',
      threadId: actualThreadId,
    };
  });

  ipcMain.handle('agent:launch-best-of-n', async (_event, req) => {
    const { threadId, prompt, providers, launchOptions } = req as {
      readonly threadId?: string;
      readonly projectId?: string;
      readonly prompt: string;
      readonly providers?: string[];
      readonly launchOptions?: AgentLaunchOptions;
    };

    let thread;
    if (threadId) {
      thread = await threadService.getThread(threadId);
    } else {
      thread = await threadService.createThread({ projectId: req.projectId, goal: prompt });
    }

    const actualThreadId = thread.id;
    const projectId = thread.projectId;
    const project = projectService.getProject(projectId);
    for (const launchProvider of providers ?? ['claude', 'claude']) {
      assertThreadToolEnabledWithReceipt(db, {
        threadId: actualThreadId,
        toolId: toolIdForAgentProvider(launchProvider),
        command: `agent:launch-best-of-n ${launchProvider}`,
      });
    }

    await threadService.addMessage(actualThreadId, {
      role: 'user',
      content: prompt,
    });

    const runIds = await orchestrator.executeBestOfN(
      actualThreadId,
      projectId,
      prompt,
      providers ?? ['claude', 'claude'],
      undefined,
      {
        projectPath: project.path,
        useWorktree: project.mode === 'git',
        ...(launchOptions ? { launchOptions } : {}),
      }
    );

    const main = getMainWindow();
    for (const runId of runIds) {
      const run = orchestrator.getRun(runId);
      const adapter = orchestrator.getAdapter(run?.provider || 'claude');
      adapter?.onEvent((event) => {
        orchestrator.recordEvent(thread.id, 'agent_event', { runId, ...event });
        if (main && !main.isDestroyed()) {
          main.webContents.send('agent:event', { runId, ...event });
        }
      });
    }

    return {
      runIds,
      threadId: actualThreadId,
    };
  });

  ipcMain.handle('agent:interrupt', async (_event, { runId }) => {
    orchestrator.interruptRun(runId);
  });

  ipcMain.handle('agent:terminate', async (_event, { runId }) => {
    orchestrator.terminateRun(runId);
  });
}

// ============================================================================
// Clarification Handlers
// ============================================================================

function registerClarificationHandlers(): void {
  ipcMain.handle('clarification:answer', async (_event, { runId, answer }) => {
    if (!runId || typeof runId !== 'string') {
      throw new Error('clarification:answer requires runId');
    }
    if (!answer || typeof answer !== 'string') {
      throw new Error('clarification:answer requires answer');
    }
    const success = orchestrator.answerClarification(runId, answer);
    return { success, runId };
  });

  ipcMain.handle('clarification:get', async (_event, { clarificationId }) => {
    if (!clarificationId || typeof clarificationId !== 'string') {
      throw new Error('clarification:get requires clarificationId');
    }
    const request = orchestrator.getClarificationRequest(clarificationId);
    return request ?? null;
  });

  ipcMain.handle('clarification:pending', async (_event, { sessionId }) => {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('clarification:pending requires sessionId');
    }
    const request = orchestrator.getPendingClarification(sessionId as TerminalSessionId);
    return request ?? null;
  });

  ipcMain.handle('clarification:cancel', async (_event, { runId }) => {
    if (!runId || typeof runId !== 'string') {
      throw new Error('clarification:cancel requires runId');
    }
    const success = orchestrator.cancelClarification(runId);
    return { success, runId };
  });
}

// ============================================================================
// Terminal Handlers
// ============================================================================

function registerTerminalHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  sessionManager: SessionManager,
  cwd: string,
  sessionToThread: Map<string, string>,
  sessionToPid: Map<string, number>,
  sessionToFileWatchers: Map<string, FileDeltaWatcher>
): void {
  ipcMain.handle('terminal:create', async (_event, req) => {
    const workingDirectory = req?.cwd ?? cwd;
    const session = await sessionManager.launch({
      cwd: workingDirectory,
    });
    sessionToPid.set(session.sessionId, session.pid);
    if (typeof req?.threadId === 'string' && req.threadId.trim()) {
      const activeThreadId = req.threadId.trim();
      sessionToThread.set(session.sessionId, activeThreadId);
      recordTerminalStarted(db, activeThreadId as ThreadId, {
        sessionId: session.sessionId as TerminalSessionId,
        runtime: 'pty',
        workingDirectory,
        command: req?.command ?? (process.platform === 'win32' ? 'powershell.exe' : 'bash'),
        pid: session.pid,
      });
      void startAndRecordFileDeltaWatcher({
        db,
        threadId: activeThreadId as ThreadId,
        sessionId: session.sessionId as TerminalSessionId,
        rootPath: workingDirectory,
      })
        .then((watcher) => {
          if (sessionToThread.has(session.sessionId)) {
            sessionToFileWatchers.set(session.sessionId, watcher);
          } else {
            watcher.close();
          }
        })
        .catch((error: unknown) => {
          recordTerminalFileDeltaFailed(db, activeThreadId as ThreadId, {
            sessionId: session.sessionId as TerminalSessionId,
            phase: 'baseline',
            rootPath: workingDirectory,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
      void captureAndRecordProcessSnapshot({
        db,
        threadId: activeThreadId as ThreadId,
        sessionId: session.sessionId as TerminalSessionId,
        rootPid: session.pid,
        phase: 'started',
      });
    }
    return { sessionId: session.sessionId };
  });

  ipcMain.handle('terminal:write', async (_event, { sessionId, data, threadId, source }) => {
    sessionManager.sendInput(sessionId, data);
    if (typeof threadId === 'string' && threadId.trim()) {
      const inputSource: TerminalInputSource =
        source === 'permission_decision' || source === 'doorway' ? source : 'user';
      recordTerminalInput(db, threadId.trim() as ThreadId, {
        sessionId: sessionId as TerminalSessionId,
        text: data,
        source: inputSource,
      });
      const rootPid = sessionToPid.get(sessionId);
      if (rootPid && /[\r\n]/.test(data)) {
        setTimeout(() => {
          void captureAndRecordProcessSnapshot({
            db,
            threadId: threadId.trim() as ThreadId,
            sessionId: sessionId as TerminalSessionId,
            rootPid,
            phase: 'running',
          });
        }, 250);
      }
    }
  });

  ipcMain.handle('terminal:resize', async (_event, { sessionId, cols, rows }) => {
    sessionManager.resize(sessionId, cols, rows);
    terminalStreamHub.broadcast({
      type: 'resize',
      sessionId: sessionId as TerminalSessionId,
      cols,
      rows,
      timestamp: new Date().toISOString(),
    });
  });

  ipcMain.handle('terminal:stop', async (_event, { sessionId }) => {
    sessionManager.stop(sessionId);
    return { stopped: true };
  });

  ipcMain.handle('terminal:get-transcript', async (_event, { sessionId }) => {
    return getTerminalTranscript(db, sessionId);
  });

  ipcMain.handle('terminal:get-blocks', async (_event, { sessionId }) => {
    return sessionManager.getBlocks(sessionId as TerminalSessionId);
  });

  ipcMain.handle('terminal:get-inputs', async (_event, { sessionId }) => {
    return listTerminalInputs(db, sessionId);
  });

  ipcMain.handle('terminal:list', async (_event, { threadId }) => {
    return listTerminalProjections(db, threadId);
  });
}

// ============================================================================
// Worktree Handlers
// ============================================================================

function registerWorktreeHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  threadService: ThreadService,
  worktreeManager: WorktreeManager,
  diffService: GitDiffService,
  orchestrator: Orchestrator,
  cwd: string,
  dataDir: string
): void {
  ipcMain.handle('worktree:list', async () => {
    return worktreeManager.listWorktrees();
  });

  ipcMain.handle('worktree:diff', async (_event, { path: wtPath, threadId }) => {
    const diff = await diffService.getWorktreeDiff(wtPath);
    const files = await Promise.all(
      diff.changes.map(async (change) => {
        const patch = await diffService.getFileDiff(wtPath, change.path);
        return {
          path: change.path,
          status: mapGitDiffStatus(change.status),
          additions: change.additions,
          deletions: change.deletions,
          ...(patch ? { patch } : {}),
        };
      })
    );

    const projection: DiffProjection = {
      worktreeId: diff.worktreeId as DiffProjection['worktreeId'],
      files,
      totalAdditions: diff.totalAdditions,
      totalDeletions: diff.totalDeletions,
    };

    if (threadId) {
      recordEvent(db, threadId, 'diff.updated' as EventType, {
        path: wtPath,
        filesChanged: projection.files.length,
        totalAdditions: projection.totalAdditions,
        totalDeletions: projection.totalDeletions,
        ...(projection.worktreeId ? { worktreeId: projection.worktreeId } : {}),
      });
    }

    return projection;
  });

  ipcMain.handle('worktree:fork', async (_event, { threadId, worktreePath }) => {
    const thread = await threadService.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const worktrees = await worktreeManager.listWorktrees();
    const source = worktrees.find((item) => item.path === worktreePath);
    if (!source) {
      throw new Error(`Doorway worktree not found: ${worktreePath}`);
    }

    const taskId = taskIdFromDoorwayBranch(source.branch);
    if (!taskId) {
      throw new Error(`Cannot fork non-Doorway branch: ${source.branch}`);
    }

    assertCleanForkSource(await worktreeManager.getWorktreeStatus(source.path), source.path);

    const fork = await worktreeManager.createWorktree({
      taskId: taskId as TaskId,
      branchName: forkWorktreeBranchName(source.branch, Date.now().toString(36)),
      baseBranch: source.branch.replace(/^refs\/heads\//, ''),
    });

    recordEvent(db, threadId as ThreadId, 'worktree.created', {
      worktreeId: fork.id as WorktreeId,
      projectId: thread.projectId,
      taskId: taskId as TaskId,
      path: fork.path,
      branch: fork.branch,
      parentWorktreeId: source.id as WorktreeId,
      baseBranch: source.branch.replace(/^refs\/heads\//, ''),
    });

    return fork;
  });

  ipcMain.handle('worktree:archive', async (_event, { threadId, worktreePath, deleteBranch }) => {
    const thread = await threadService.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const worktrees = await worktreeManager.listWorktrees();
    const source = worktrees.find((item) => item.path === worktreePath);
    if (!source) {
      throw new Error(`Doorway worktree not found: ${worktreePath}`);
    }

    assertCleanArchiveSource(await worktreeManager.getWorktreeStatus(source.path), source.path);
    await worktreeManager.deleteWorktree(source.path);
    if (deleteBranch === true) {
      await worktreeManager.deleteDoorwayBranch(source.branch);
    }

    recordEvent(db, thread.id as ThreadId, 'worktree.archived', {
      worktreeId: source.id as WorktreeId,
      path: source.path,
      branch: source.branch,
      branchDeleted: deleteBranch === true,
      reason:
        deleteBranch === true
          ? `removed worktree and deleted merged branch ${source.branch.replace(/^refs\/heads\//, '')}`
          : `removed worktree; kept branch ${source.branch.replace(/^refs\/heads\//, '')}`,
    });

    return { archived: true, worktreeId: source.id, branchDeleted: deleteBranch === true };
  });

  ipcMain.handle('worktree:export-rollback-patch', async (_event, { threadId, worktreePath }) => {
    const thread = await threadService.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const worktrees = await worktreeManager.listWorktrees();
    const source = worktrees.find((item) => item.path === worktreePath);
    if (!source) {
      throw new Error(`Doorway worktree not found: ${worktreePath}`);
    }

    const patch = await diffService.getRollbackPatch(source.path);
    const exported = await writeWorktreeRollbackPatch({
      dataDir,
      threadId: thread.id as ThreadId,
      patch,
    });

    recordEvent(db, thread.id as ThreadId, 'worktree.rollback_patch_exported', {
      worktreeId: source.id as WorktreeId,
      path: exported.path,
      worktreePath: source.path,
      branch: source.branch,
      patchBytes: exported.patchBytes,
      createdAt: exported.createdAt,
    });

    return {
      path: exported.path,
      patchBytes: exported.patchBytes,
      worktreePath: source.path,
      branch: source.branch,
    };
  });
}

// ============================================================================
// Merge Handlers
// ============================================================================

function registerMergeHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  threadService: ThreadService,
  worktreeManager: WorktreeManager,
  diffService: GitDiffService,
  orchestrator: Orchestrator,
  cwd: string
): void {
  ipcMain.handle('merge:evaluate-readiness', async (_event, { threadId, worktreePath }) => {
    assertThreadToolEnabledWithReceipt(db, {
      threadId,
      toolId: 'tool.review-merge',
      command: 'merge:evaluate-readiness',
    });

    const worktrees = await worktreeManager.listWorktrees();
    const worktree = worktrees.find((item) => item.path === worktreePath);
    if (!worktree) {
      throw new Error(`Doorway worktree not found: ${worktreePath}`);
    }

    const taskId = taskIdFromDoorwayBranch(worktree.branch);
    if (!taskId) {
      throw new Error(`Cannot evaluate non-Doorway branch: ${worktree.branch}`);
    }

    const diff = await diffService.getWorktreeDiff(worktreePath);
    const sourceBranch = worktree.branch.replace(/^refs\/heads\//, '');
    const baseBranch = await getCurrentBranch(cwd);
    const mergePlan: MergePlan = {
      id: `plan_${Date.now().toString(36)}`,
      taskId: taskId as TaskId,
      integrationBranch: `doorway/preview/${taskId}-${Date.now().toString(36)}`,
      baseBranch,
      strategy: 'sequential',
      status: 'pending',
      createdAt: new Date(),
      items: [
        {
          runId: `run_preview_${Date.now().toString(36)}` as AgentRunId,
          sourceBranch,
          targetBranch: baseBranch,
          status: 'pending',
          changes: [],
        },
      ],
    };

    const preview = await createMergeEngine({ cwd }).previewMerge(mergePlan);
    const highRiskFiles = diff.changes
      .filter((change) => isHighRiskFile(change.path))
      .map((change) => change.path);
    const proofs = listProofs(db, threadId);
    const latestProof = proofs[proofs.length - 1];
    const testsPassed = latestProof?.status === 'pass';
    const hasApproval = listPermissionReceipts(db, threadId).some(
      (receipt) => receipt.decision === 'approved'
    );

    let score: 'blocked' | 'ready' | 'reviewable' | 'risky' = 'ready';
    let reason = 'Diff loaded cleanly, latest tests passed, and approval is recorded.';

    if (!preview.canMerge) {
      score = 'blocked';
      reason = `Merge preview failed: ${preview.message}`;
    } else if (latestProof?.status === 'fail') {
      score = 'risky';
      reason = `Latest test proof failed: ${latestProof.summary ?? latestProof.label}`;
    } else if (!testsPassed) {
      score = 'reviewable';
      reason = 'No passing test proof is recorded for this thread.';
    } else if (highRiskFiles.length > 0 && !hasApproval) {
      score = 'reviewable';
      reason = 'High-risk files changed and no approval receipt is recorded.';
    } else if (!hasApproval) {
      score = 'reviewable';
      reason = 'Awaiting approval receipt before merge.';
    }

    return recordMergeAssessment(db, threadId, {
      taskId: taskId as TaskId,
      score,
      reason,
      cleanApply: preview.canMerge,
      testsPassed,
      highRiskFiles: [...highRiskFiles, ...preview.potentialConflicts],
      hasApproval,
    });
  });

  ipcMain.handle('merge:approve-worktree', async (_event, { threadId, worktreePath }) => {
    assertThreadToolEnabledWithReceipt(db, {
      threadId,
      toolId: 'tool.review-merge',
      command: 'merge:approve-worktree',
    });

    const worktrees = await worktreeManager.listWorktrees();
    const worktree = worktrees.find((item) => item.path === worktreePath);
    if (!worktree) {
      throw new Error(`Doorway worktree not found: ${worktreePath}`);
    }

    return recordPermissionReceipt(db, threadId, buildWorktreeMergeApproval(worktree));
  });

  ipcMain.handle('merge:create-integration', async (_event, { threadId, worktreePath }) => {
    assertThreadToolEnabledWithReceipt(db, {
      threadId,
      toolId: 'tool.review-merge',
      command: 'merge:create-integration',
    });

    const worktrees = await worktreeManager.listWorktrees();
    const worktree = worktrees.find((item) => item.path === worktreePath);
    if (!worktree) {
      throw new Error(`Doorway worktree not found: ${worktreePath}`);
    }

    const taskId = taskIdFromDoorwayBranch(worktree.branch);
    if (!taskId) {
      throw new Error(`Cannot merge non-Doorway branch: ${worktree.branch}`);
    }
    const taskKey = taskId as TaskId;

    assertReadyForIntegrationMerge(listMergeAssessments(db, threadId), taskKey);

    const status = await getStatus(cwd);
    if (!status.isClean) {
      throw new Error(
        'Current project worktree must be clean before creating an integration merge.'
      );
    }

    const sourceBranch = worktree.branch.replace(/^refs\/heads\//, '');
    const baseBranch = await getCurrentBranch(cwd);
    const integrationBranch = `doorway/integration/${taskId}-${Date.now().toString(36)}`;
    const mergePlan: MergePlan = {
      id: `plan_${Date.now().toString(36)}`,
      taskId: taskKey,
      integrationBranch,
      baseBranch,
      strategy: 'sequential',
      status: 'pending',
      createdAt: new Date(),
      items: [
        {
          runId: `run_merge_${Date.now().toString(36)}` as AgentRunId,
          sourceBranch,
          targetBranch: baseBranch,
          status: 'pending',
          changes: [],
        },
      ],
    };

    recordEvent(db, threadId, 'merge.started' as EventType, {
      taskId: taskKey,
      integrationBranch,
      branches: [sourceBranch],
    });

    const result = await createMergeEngine({ cwd }).executeMerge(mergePlan);
    if (result.status === 'success') {
      recordEvent(db, threadId, 'merge.completed' as EventType, {
        taskId: taskKey,
        integrationBranch,
        conflicts: result.conflicts.map((conflict) => conflict.path),
        mergedBranches: result.mergedBranches,
      });

      const testCommandDiscovery = new TestCommandDiscoveryService();
      const command = selectPostMergeTestCommand(await testCommandDiscovery.discover(cwd));
      if (command) {
        const testResult = await runPostMergeTest(db, threadId, cwd, command);
        return {
          ...result,
          testResults: {
            passed: testResult.exitCode === 0,
            output: testResult.output,
          },
        };
      }
    } else {
      const conflict = result.conflicts[0];
      recordEvent(db, threadId, 'merge.conflict' as EventType, {
        taskId: taskKey,
        file: conflict?.path ?? sourceBranch,
        conflictDetails: conflict?.conflictMarkers ?? result.summary,
      });
    }
    return result;
  });
}

// ============================================================================
// Browser Handlers
// ============================================================================

function registerBrowserHandlers(
  db: ReturnType<typeof import('@doorway/core').createDatabase>,
  orchestrator: Orchestrator,
  dataDir: string
): void {
  ipcMain.handle('browser:launch', async (_event, options) => {
    if (typeof options?.threadId === 'string' && options.threadId.trim()) {
      assertThreadToolEnabledWithReceipt(db, {
        threadId: options.threadId.trim(),
        toolId: 'tool.browser-proof',
        command: 'browser:launch',
      });
    }
    return orchestrator.launchBrowser(options);
  });

  ipcMain.handle('browser:toggle-control', async (_event, { isAgent }) => {
    orchestrator.toggleBrowserControl(isAgent);
  });

  ipcMain.handle('browser:export-evidence', async (_event, { threadId }) => {
    if (typeof threadId !== 'string' || !threadId.trim()) {
      throw new Error('Browser evidence export requires threadId.');
    }
    const threadKey = threadId as ThreadId;
    assertThreadToolEnabledWithReceipt(db, {
      threadId: threadKey,
      toolId: 'tool.browser-proof',
      command: 'browser:export-evidence',
    });

    const bundle = await writeBrowserEvidenceBundle({
      dataDir,
      threadId: threadKey,
      actions: orchestrator.browser.getActions(),
    });

    recordEvent(db, threadKey, 'browser.bundle_exported', {
      path: bundle.path,
      actionCount: bundle.actionCount,
      screenshotCount: bundle.screenshotCount,
      createdAt: bundle.createdAt,
    });

    return bundle;
  });
}

// ============================================================================
// Orchestrator reference (needed for handlers)
// ============================================================================

let orchestrator: Orchestrator;

// ============================================================================
// Main Setup
// ============================================================================

export async function setupMainHandlers(config: MainHandlersConfig = {}): Promise<void> {
  const cwd = config.cwd ?? process.cwd();
  const dataDir = config.dataDir ?? path.join(homedir(), '.doorway');

  await vault.init();

  const dbPath = dataDir;
  const threadService = new ThreadService({ inMemory: false, dbPath });
  const { createDatabase } = await import('@doorway/core');
  const db = createDatabase({ dataPath: dbPath });
  const projectService = new ProjectService(db);

  // Auto-seed project and thread on startup if database is empty
  const existingProjects = projectService.listProjects();
  if (existingProjects.length === 0) {
    try {
      const seededProj = projectService.openProject({
        path: cwd,
        name: 'doorway',
      });
      console.log(`[Main] Auto-seeded workspace project at: ${cwd}`);

      const existingThreads = threadService.listThreads(seededProj.id);
      if (existingThreads.length === 0) {
        threadService.createThread({
          projectId: seededProj.id,
          title: 'Welcome to Doorway',
          goal: 'Initial conversation thread',
        });
        console.log('[Main] Auto-seeded initial thread for project');
      }
    } catch (err) {
      console.error('[Main] Failed to auto-seed workspace project:', err);
    }
  }
  const gitEngine = new GitEngine({ cwd });
  const worktreeManager = new WorktreeManager(gitEngine);
  const diffService = new GitDiffService(gitEngine);
  const testCommandDiscovery = new TestCommandDiscoveryService();
  const sessionManager = new SessionManager();
  const scheduler = new SchedulerRuntime(db, { terminalManager: sessionManager, cwd });

  // Fault Recovery Service - auto-detect crashes and retries
  const faultRecovery = createFaultRecoveryService({
    enabled: true,
    onRecoveryAction: (action: RecoveryAction) => {
      console.log(`[FaultRecovery] ${action.type}: ${action.reason}`);
      // Forward to renderer for UI notification
      const main = getMainWindow();
      if (main && !main.isDestroyed()) {
        main.webContents.send('fault-recovery:action', {
          type: action.type,
          reason: action.reason,
          message: action.message,
          delayMs: action.delayMs,
        });
      }
    },
  });

  // Track process info for fault recovery
  const sessionToProcess = new Map<string, RunningProcess>();

  orchestrator = new Orchestrator(db, vault, {
    cwd,
    worktreeManager,
    terminalManager: sessionManager,
    onClarificationBroadcast: (request: ClarificationRequest) => {
      const payload = clarificationRendererPayload(request);
      terminalStreamHub.broadcast({
        type: 'clarification',
        sessionId: payload.sessionId as TerminalSessionId,
        clarificationId: payload.clarificationId,
        question: payload.question,
        context: payload.context,
        ...(payload.suggestedResponses
          ? { suggestedResponses: [...payload.suggestedResponses] }
          : {}),
        timestamp: new Date().toISOString(),
      });
      const main = getMainWindow();
      if (main && !main.isDestroyed()) {
        main.webContents.send('fault-recovery:clarification', payload);
      }
    },
  });

  orchestrator.registerAdapter(new ClaudeCodeAdapter());
  orchestrator.registerAdapter(new CodexCliAdapter());
  orchestrator.registerAdapter(new CursorAdapter());
  orchestrator.registerAdapter(new GeminiAdapter());
  orchestrator.registerAdapter(new AgyAdapter());

  // Track active terminal sessions associated with threads
  const sessionToThread = new Map<string, string>();
  const sessionToPid = new Map<string, number>();
  const sessionToFileWatchers = new Map<string, FileDeltaWatcher>();

  // Forward terminal data to renderer and write output chunks to SQLite
  sessionManager.onData((sessionId, data, decodedChunk) => {
    const threadId = sessionToThread.get(sessionId);
    const chunk = threadId
      ? appendTerminalChunk(db, threadId as ThreadId, {
          sessionId: sessionId as TerminalSessionId,
          text: data,
          cleanText: decodedChunk?.text,
          controlEvents: decodedChunk?.controlEvents,
          screenSnapshot: decodedChunk?.screenSnapshot,
          stateDetection: decodedChunk?.stateDetection,
          isStdout: true,
        })
      : undefined;

    // Broadcast to StreamHub for real-time streaming (fast path)
    // This is the ONLY path - no double delivery via terminal:data
    terminalStreamHub.broadcast({
      type: 'data',
      sessionId: sessionId as TerminalSessionId,
      data,
      timestamp: new Date().toISOString(),
    });
  });

  sessionManager.onStateChange((sessionId, detection) => {
    const threadId = sessionToThread.get(sessionId);
    if (!threadId) return;
    recordTerminalStateDetection(db, threadId as ThreadId, {
      sessionId: sessionId as TerminalSessionId,
      detection,
      source: 'silence_confirmation',
    });
  });

  // Track session exits and record stopped in SQLite
  sessionManager.onExit(async (sessionId, exitCode, signal) => {
    const threadId = sessionToThread.get(sessionId);
    const process = sessionToProcess.get(sessionId);

    // Fault Detection - detect crash/timeout/OOM from exit
    if (process) {
      const fault = faultRecovery.detectFaultFromExit(exitCode ?? -1, signal ?? undefined);

      // Only handle actual faults (not successful exits)
      if (fault.severity !== 'permanent' || exitCode !== 0) {
        const recoveryAction = faultRecovery.determineRecoveryAction(fault, process);
        console.log(
          `[FaultRecovery] Session ${sessionId.slice(0, 8)} exit: ${fault.faultType} (${fault.severity}) → ${recoveryAction.type}`
        );

        // Execute recovery if needed
        if (recoveryAction.type === 'retry') {
          const shouldRetry = await faultRecovery.executeRecovery(recoveryAction, process);
          if (shouldRetry) {
            // Re-launch the agent
            console.log(`[FaultRecovery] Re-launching agent for session ${sessionId.slice(0, 8)}`);
            // The orchestrator will handle the actual re-launch via runId
          }
        } else if (recoveryAction.type === 'ask_user') {
          // Forward to renderer for user prompt
          const main = getMainWindow();
          if (main && !main.isDestroyed()) {
            main.webContents.send('fault-recovery:clarification', {
              sessionId,
              runId: process.runId,
              threadId: process.threadId,
              faultType: fault.faultType,
              reason: fault.reason,
              message: recoveryAction.message,
            });
          }
        }
      }

      // Cleanup
      faultRecovery.unregisterProcess(sessionId as TerminalSessionId);
      sessionToProcess.delete(sessionId);
    }

    if (threadId) {
      const rootPid = sessionToPid.get(sessionId);
      recordTerminalStopped(db, threadId as ThreadId, {
        sessionId: sessionId as TerminalSessionId,
        exitCode,
        signal: signal || undefined,
      });
      if (rootPid) {
        await captureAndRecordProcessSnapshot({
          db,
          threadId: threadId as ThreadId,
          sessionId: sessionId as TerminalSessionId,
          rootPid,
          phase: 'stopped',
        });
      }
      const fileWatcher = sessionToFileWatchers.get(sessionId);
      if (fileWatcher) {
        await flushAndCloseFileDeltaWatcher({
          db,
          threadId: threadId as ThreadId,
          sessionId: sessionId as TerminalSessionId,
          watcher: fileWatcher,
        });
      }
      sessionToThread.delete(sessionId);
      sessionToPid.delete(sessionId);
      sessionToFileWatchers.delete(sessionId);
    }

    // Broadcast exit to StreamHub for real-time streaming AFTER all database writes are fully awaited
    terminalStreamHub.broadcast({
      type: 'exit',
      sessionId: sessionId as TerminalSessionId,
      exitCode,
      signal,
      timestamp: new Date().toISOString(),
    });
  });

  // DB Reactivity via EventBus
  dbEventBus.on('*', (payload) => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send('db:change', payload);
    }
  });

  // Register all handler groups
  registerProjectHandlers(projectService);
  registerThreadHandlers(db, threadService, orchestrator, dataDir);
  registerPermissionHandlers(db, threadService);
  registerToolHandlers(db);
  registerAutomationHandlers(db, scheduler);
  registerClipboardHandlers(db);
  registerHandoffHandlers(db, threadService, orchestrator);
  registerAgentHandlers(db, threadService, projectService, orchestrator, sessionManager, cwd);
  registerClarificationHandlers();
  registerTerminalHandlers(
    db,
    sessionManager,
    cwd,
    sessionToThread,
    sessionToPid,
    sessionToFileWatchers
  );
  registerWorktreeHandlers(
    db,
    threadService,
    worktreeManager,
    diffService,
    orchestrator,
    cwd,
    dataDir
  );
  registerMergeHandlers(db, threadService, worktreeManager, diffService, orchestrator, cwd);
  registerBrowserHandlers(db, orchestrator, dataDir);

  // Register streaming IPC handlers for real-time terminal output
  registerStreamingHandlers();

  ipcMain.handle('project:list-files', async (_event, { path: projectPath }) => {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      
      const scanDir = async (dir: string, depth = 0): Promise<any[]> => {
        if (depth > 2) return [];
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const list = [];
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
              continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              list.push({
                name: entry.name,
                path: fullPath,
                isDir: true,
                children: await scanDir(fullPath, depth + 1),
              });
            } else {
              list.push({
                name: entry.name,
                path: fullPath,
                isDir: false,
              });
            }
          }
          return list;
        } catch {
          return [];
        }
      };

      return await scanDir(projectPath);
    } catch (err) {
      console.error('Failed to list files:', err);
      return [];
    }
  });

  scheduler.start();

  // Forward browser events to renderer
  orchestrator.browser.on('state-change', (state) => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send('browser:state-change', state);
    }
  });

  // Wire browser actions to flight recorder
  orchestrator.browser.on('action', (action) => {
    orchestrator.recordEvent('browser_task', 'browser.action', action);
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send('browser:action', action);
    }
  });

  ipcMain.handle('project:write-demo-game', async (_event, { projectPath }) => {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const htmlFilePath = path.join(projectPath, 'index.html');
      
      const gameCode = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Snake & Balls Game</title>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            background-color: #f7f7f7;
            font-family: 'Inter', sans-serif;
            user-select: none;
        }
        #canvas-container {
            width: 100vw;
            height: 100vh;
        }
        #ui-container {
            position: absolute;
            top: 20px;
            left: 20px;
            color: #111;
            font-size: 20px;
            font-weight: 600;
            pointer-events: none;
            background: rgba(255, 255, 255, 0.85);
            padding: 10px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(0,0,0,0.05);
        }
        #gameover-screen {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(12px);
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 100;
        }
        #gameover-screen h1 {
            font-size: 48px;
            color: #111;
            margin-bottom: 10px;
        }
        #gameover-screen p {
            font-size: 24px;
            color: #666;
            margin-bottom: 30px;
        }
        #restart-btn {
            background: #111;
            color: #fff;
            border: none;
            padding: 12px 30px;
            font-size: 18px;
            font-weight: 500;
            border-radius: 999px;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        #restart-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.2);
            background: #333;
        }
    </style>
    <!-- Include Three.js -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
    <div id="ui-container">Score: <span id="score">0</span></div>
    <div id="gameover-screen">
        <h1>Game Over</h1>
        <p>Final Score: <span id="final-score">0</span></p>
        <button id="restart-btn" onclick="resetGame()">Play Again</button>
    </div>
    <div id="canvas-container"></div>

    <script>
        let scene, camera, renderer;
        let snake = [];
        let snakeDirection = new THREE.Vector3(1, 0, 0);
        let nextDirection = new THREE.Vector3(1, 0, 0);
        let food;
        let score = 0;
        const gridBound = 15;
        let gameActive = true;
        let lastMoveTime = 0;
        const moveInterval = 150; // speed

        init();
        animate();

        function init() {
            // Scene & Camera
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xf3f4f6);

            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 22, 16);
            camera.lookAt(0, 0, -2);

            // Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            document.getElementById('canvas-container').appendChild(renderer.domElement);

            // Lights
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(10, 20, 10);
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 2048;
            dirLight.shadow.mapSize.height = 2048;
            dirLight.shadow.camera.near = 0.5;
            dirLight.shadow.camera.far = 40;
            const d = 20;
            dirLight.shadow.camera.left = -d;
            dirLight.shadow.camera.right = d;
            dirLight.shadow.camera.top = d;
            dirLight.shadow.camera.bottom = -d;
            scene.add(dirLight);

            // Table / Arena
            const arenaGeo = new THREE.BoxGeometry(gridBound * 2, 0.5, gridBound * 2);
            const arenaMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
            const arena = new THREE.Mesh(arenaGeo, arenaMat);
            arena.position.y = -0.25;
            arena.receiveShadow = true;
            scene.add(arena);

            // Arena Borders
            const borderMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb });
            const borderGeoH = new THREE.BoxGeometry(gridBound * 2 + 1, 1, 0.5);
            const borderGeoV = new THREE.BoxGeometry(0.5, 1, gridBound * 2 + 1);

            const borderN = new THREE.Mesh(borderGeoH, borderMat);
            borderN.position.set(0, 0.25, -gridBound - 0.25);
            borderN.castShadow = true;
            scene.add(borderN);

            const borderS = new THREE.Mesh(borderGeoH, borderMat);
            borderS.position.set(0, 0.25, gridBound + 0.25);
            borderS.castShadow = true;
            scene.add(borderS);

            const borderW = new THREE.Mesh(borderGeoV, borderMat);
            borderW.position.set(-gridBound - 0.25, 0.25, 0);
            borderW.castShadow = true;
            scene.add(borderW);

            const borderE = new THREE.Mesh(borderGeoV, borderMat);
            borderE.position.set(gridBound + 0.25, 0.25, 0);
            borderE.castShadow = true;
            scene.add(borderE);

            // Grid helper
            const gridHelper = new THREE.GridHelper(gridBound * 2, gridBound * 2, 0xcccccc, 0xe5e7eb);
            gridHelper.position.y = 0.01;
            scene.add(gridHelper);

            // Spawn Snake
            spawnSnake();

            // Spawn Food
            spawnFood();

            // Event Listeners
            window.addEventListener('resize', onWindowResize);
            document.addEventListener('keydown', onKeyDown);
        }

        function spawnSnake() {
            // Remove old snake meshes
            snake.forEach(part => scene.remove(part.mesh));
            snake = [];

            // Add head
            const headGeo = new THREE.SphereGeometry(0.5, 32, 32);
            const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.1 });
            const headMesh = new THREE.Mesh(headGeo, headMat);
            headMesh.position.set(0, 0.5, 0);
            headMesh.castShadow = true;
            scene.add(headMesh);
            snake.push({ mesh: headMesh, pos: new THREE.Vector3(0, 0.5, 0) });

            // Add body parts
            for (let i = 1; i <= 3; i++) {
                addBodyPart(new THREE.Vector3(-i, 0.5, 0));
            }
            snakeDirection.set(1, 0, 0);
            nextDirection.set(1, 0, 0);
        }

        function addBodyPart(position) {
            const bodyGeo = new THREE.SphereGeometry(0.42, 32, 32);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.2 });
            const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
            bodyMesh.position.copy(position);
            bodyMesh.castShadow = true;
            scene.add(bodyMesh);
            snake.push({ mesh: bodyMesh, pos: position.clone() });
        }

        function spawnFood() {
            if (food) scene.remove(food);

            const foodGeo = new THREE.SphereGeometry(0.45, 32, 32);
            const foodMat = new THREE.MeshStandardMaterial({ 
                color: 0xef4444, 
                emissive: 0xef4444, 
                emissiveIntensity: 0.3,
                roughness: 0.1 
            });
            food = new THREE.Mesh(foodGeo, foodMat);
            food.castShadow = true;
            
            // Random position
            let validPos = false;
            let rx, rz;
            while (!validPos) {
                rx = Math.floor(Math.random() * (gridBound * 2 - 2)) - (gridBound - 1);
                rz = Math.floor(Math.random() * (gridBound * 2 - 2)) - (gridBound - 1);
                validPos = true;
                for (let part of snake) {
                    if (part.pos.x === rx && part.pos.z === rz) {
                        validPos = false;
                        break;
                    }
                }
            }
            food.position.set(rx, 0.5, rz);
            scene.add(food);
        }

        function animate(timestamp) {
            requestAnimationFrame(animate);

            if (gameActive && timestamp - lastMoveTime > moveInterval) {
                moveSnake();
                lastMoveTime = timestamp;
            }

            // Food pulse animation
            if (food) {
                const s = 1 + Math.sin(Date.now() * 0.008) * 0.15;
                food.scale.set(s, s, s);
            }

            renderer.render(scene, camera);
        }

        function moveSnake() {
            snakeDirection.copy(nextDirection);
            
            // Calculate new head position
            const newHeadPos = snake[0].pos.clone().add(snakeDirection);

            // Wall collisions
            if (Math.abs(newHeadPos.x) >= gridBound || Math.abs(newHeadPos.z) >= gridBound) {
                endGame();
                return;
            }

            // Self collisions
            for (let i = 1; i < snake.length; i++) {
                if (snake[i].pos.equals(newHeadPos)) {
                    endGame();
                    return;
                }
            }

            // Check food collision
            const foodCollision = newHeadPos.distanceTo(food.position) < 0.2;

            // Move body
            for (let i = snake.length - 1; i > 0; i--) {
                snake[i].pos.copy(snake[i-1].pos);
                snake[i].mesh.position.copy(snake[i].pos);
            }

            // Move head
            snake[0].pos.copy(newHeadPos);
            snake[0].mesh.position.copy(newHeadPos);

            if (foodCollision) {
                score++;
                document.getElementById('score').innerText = score;
                addBodyPart(snake[snake.length - 1].pos);
                spawnFood();
            }
        }

        function onKeyDown(e) {
            if (!gameActive) return;
            switch(e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    if (snakeDirection.z !== 1) nextDirection.set(0, 0, -1);
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    if (snakeDirection.z !== -1) nextDirection.set(0, 0, 1);
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    if (snakeDirection.x !== 1) nextDirection.set(-1, 0, 0);
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    if (snakeDirection.x !== -1) nextDirection.set(1, 0, 0);
                    break;
            }
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function endGame() {
            gameActive = false;
            document.getElementById('final-score').innerText = score;
            document.getElementById('gameover-screen').style.display = 'flex';
        }

        function resetGame() {
            score = 0;
            document.getElementById('score').innerText = score;
            document.getElementById('gameover-screen').style.display = 'none';
            spawnSnake();
            spawnFood();
            gameActive = true;
            lastMoveTime = performance.now();
        }
    </script>
</body>
</html>`;
      
      await fs.writeFile(htmlFilePath, gameCode, 'utf8');
      return { ok: true, path: htmlFilePath };
    } catch (err) {
      console.error('Failed to write demo game:', err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('project:open-system-browser', async (_event, { url }) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      console.error('Failed to open system browser:', err);
      return { ok: false, error: String(err) };
    }
  });

  console.log('[Main] Modern IPC handlers registered');
}
