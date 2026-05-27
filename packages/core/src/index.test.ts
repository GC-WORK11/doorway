import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase, closeDatabase } from './database.js';
import {
  createThread,
  getThread,
  listThreads,
  appendMessage,
  updateThreadStatus,
  createAgentRun,
  upsertAgentRunLaunch,
  updateAgentRunStatus,
  createWorktree,
  archiveWorktree,
  listWorktrees,
  ThreadService,
} from './thread-service.js';
import { ProjectService, getProject, openProject } from './project-service.js';
import { listProjectPlugins } from './project-plugins.js';
import {
  exportThreadReplayJsonl,
  parseReplayEventJsonLine,
  parseReplayEventsJsonl,
  recordEvent,
  replayEventJsonLine,
  replayEvents,
  replayEventsJsonl,
  getEvents,
} from './event-service.js';
import {
  appendTerminalChunk,
  getTerminalTranscript,
  listTerminalInputs,
  listTerminalProjections,
  recordTerminalInput,
  recordTerminalStarted,
  recordTerminalStopped,
} from './terminal-evidence.js';
import { parseDoorwayActionBlocks, routeTerminalActionBlocks } from './terminal-action-protocol.js';
import { listProofs } from './proof-evidence.js';
import { listPermissionReceipts, recordPermissionReceipt } from './permission-evidence.js';
import { listMergeAssessments, recordMergeAssessment } from './merge-evidence.js';
import { listHandoffCapsules } from './handoff-evidence.js';
import { createCompactCheckpoint, listCompactCheckpoints } from './compact-checkpoint.js';
import {
  listProcessSnapshots,
  recordProcessSnapshot,
  recordProcessSnapshotFailed,
} from './process-evidence.js';
import {
  listTerminalFileDeltaSnapshots,
  recordTerminalFileDeltaFailed,
  recordTerminalFileDeltaSnapshot,
} from './file-delta-evidence.js';
import { listProviderModels } from './provider-models.js';
import {
  assertThreadToolEnabled,
  assertThreadToolEnabledWithReceipt,
  listToolCapabilities,
  setThreadToolEnabled,
  toolIdForAgentProvider,
} from './tool-capabilities.js';
import {
  findReusableToolLane,
  followUpTerminalInput,
  listToolLaneProjections,
} from './tool-lanes.js';
import { getThreadOperationalMemory } from './operational-memory.js';
import {
  listMeshAgents,
  listMeshLoopMetrics,
  listThreadPeerMessages,
  markPeerMessageHandled,
  pullPeerMessages,
  registerMeshAgent,
  sendPeerMessage,
} from './agent-mesh.js';
import {
  claimTaskGraphNodeForRun,
  completeTaskGraphNodeForRun,
  updateTaskNodeStatus,
} from './task-graph-evidence.js';
import { createFaultRecoveryService } from './fault-recovery.js';
import { dbEventBus } from './event-bus.js';
import { generateId, toISOString, parseDate } from './id-gen.js';
import { NotFoundError, ValidationError } from './errors.js';
import type {
  AgentRunId,
  ThreadId,
  ProjectId,
  AgentRole,
  TerminalSessionId,
  TaskId,
} from '@doorway/protocol';

describe('Database', () => {
  let db: Database.Database;
  const testDbPath = '/tmp/doorway-test-' + Date.now();

  beforeEach(() => {
    // Delete any existing database files to ensure clean state
    try {
      const { existsSync, rmSync } = require('fs');
      const path = testDbPath + '/db.sqlite';
      if (existsSync(path)) {
        rmSync(path);
      }
      if (existsSync(testDbPath)) {
        rmSync(testDbPath, { recursive: true });
      }
    } catch {
      // Ignore errors if files don't exist
    }
    db = createDatabase({ dataPath: testDbPath });
  });

  afterEach(() => {
    closeDatabase(db);
    // Clean up database files
    try {
      const { rmSync } = require('fs');
      rmSync(testDbPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Thread Operations', () => {
    let projectId: ProjectId;

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      // Insert a project first
      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'npm',
        new Date().toISOString(),
        new Date().toISOString()
      );
    });

    it('should create a thread', () => {
      const thread = createThread(db, projectId, 'Test Thread', 'Build the feature');

      expect(thread.id).toBeDefined();
      expect(thread.projectId).toBe(projectId);
      expect(thread.title).toBe('Test Thread');
      expect(thread.status).toBe('active');
      expect(thread.metadata.goal).toBe('Build the feature');
    });

    it('should reject thread creation without a real project row', () => {
      expect(() => {
        createThread(db, 'proj_missing' as ProjectId, 'Bad Thread', 'Goal');
      }).toThrow(NotFoundError);
    });

    it('should get a thread by id', () => {
      const created = createThread(db, projectId, 'Test Thread', 'Build the feature');
      const retrieved = getThread(db, created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.title).toBe('Test Thread');
    });

    it('should throw NotFoundError for non-existent thread', () => {
      expect(() => {
        getThread(db, 'thread_nonexistent' as ThreadId);
      }).toThrow(NotFoundError);
    });

    it('should list threads for a project', () => {
      createThread(db, projectId, 'Thread 1', 'Goal 1');
      createThread(db, projectId, 'Thread 2', 'Goal 2');

      const threads = listThreads(db, projectId);

      expect(threads).toHaveLength(2);
    });

    it('should filter threads by status', () => {
      const thread1 = createThread(db, projectId, 'Active Thread', 'Goal');
      createThread(db, projectId, 'Archived Thread', 'Goal');

      // Archive one thread
      db.prepare('UPDATE threads SET status = ? WHERE id = ?').run('archived', thread1.id);

      const activeThreads = listThreads(db, projectId, { status: 'active' });

      expect(activeThreads).toHaveLength(1);
      expect(activeThreads[0]?.title).toBe('Archived Thread');
    });

    it('should append messages to a thread', () => {
      const thread = createThread(db, projectId, 'Test Thread', 'Goal');

      const message = appendMessage(db, thread.id, 'user', 'Hello, agent!');
      const events = getEvents(db, thread.id, { type: 'message.appended' });

      expect(message.id).toBeDefined();
      expect(message.threadId).toBe(thread.id);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, agent!');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        messageId: message.id,
        threadId: thread.id,
        role: 'user',
        content: 'Hello, agent!',
      });
    });

    it('should append messages with provider info', () => {
      const thread = createThread(db, projectId, 'Test Thread', 'Goal');

      const message = appendMessage(db, thread.id, 'assistant', 'I am ready.', {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
      });

      expect(message.provider).toBe('claude');
      expect(message.model).toBe('claude-3-5-sonnet');
      expect(getEvents(db, thread.id, { type: 'message.appended' })[0]?.payload).toMatchObject({
        provider: 'claude',
      });
    });
  });

  describe('Project Operations', () => {
    it('should open a git project row', () => {
      const { mkdirSync, writeFileSync } = require('fs');
      const projectPath = `${testDbPath}/repo`;
      mkdirSync(`${projectPath}/.git`, { recursive: true });
      writeFileSync(`${projectPath}/pnpm-lock.yaml`, '');

      const project = openProject(db, { path: projectPath });

      expect(project.id).toBeDefined();
      expect(project.path).toBe(projectPath);
      expect(project.name).toBe('repo');
      expect(project.packageManager).toBe('pnpm');
      expect(project.mode).toBe('git');
    });

    it('should open a non-git project row explicitly', () => {
      const { mkdirSync, writeFileSync } = require('fs');
      const projectPath = `${testDbPath}/terminal-only`;
      mkdirSync(projectPath, { recursive: true });
      writeFileSync(`${projectPath}/requirements.txt`, '');

      const project = openProject(db, { path: projectPath });

      expect(project.mode).toBe('non_git');
      expect(project.packageManager).toBe('pip');
    });

    it('should update an existing project row for the same path', () => {
      const { mkdirSync } = require('fs');
      const projectPath = `${testDbPath}/same-project`;
      mkdirSync(projectPath, { recursive: true });

      const first = openProject(db, { path: projectPath, name: 'First' });
      const second = openProject(db, { path: projectPath, name: 'Second', mode: 'non_git' });

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Second');
      expect(getProject(db, first.id).mode).toBe('non_git');
    });

    it('should reject a missing project path', () => {
      expect(() => {
        openProject(db, { path: `${testDbPath}/missing` });
      }).toThrow(ValidationError);
    });

    it('should create threads through ThreadService only with project ids', () => {
      const { mkdirSync } = require('fs');
      const projectPath = `${testDbPath}/service-project`;
      mkdirSync(projectPath, { recursive: true });
      const service = new ProjectService(db);
      const project = service.openProject({ path: projectPath });

      const threadService = new ThreadService({
        inMemory: false,
        dbPath: testDbPath,
      });
      const thread = threadService.createThread({
        projectId: project.id,
        title: 'Service Thread',
        goal: 'Use a real project',
      });

      expect(thread.projectId).toBe(project.id);
      expect(threadService.listThreads(project.id)).toHaveLength(1);
      expect(getEvents(db, thread.id, { type: 'thread.created' })[0]?.payload).toMatchObject({
        threadId: thread.id,
        projectId: project.id,
        title: 'Service Thread',
        goal: 'Use a real project',
      });
      expect(() => {
        threadService.createThread({ projectId: '', title: 'No Project' });
      }).toThrow(ValidationError);
    });

    it('projects permissioned project plugin manifests and invalid manifest failures', () => {
      const { mkdirSync, writeFileSync } = require('fs');
      const projectPath = `${testDbPath}/plugin-project`;
      mkdirSync(`${projectPath}/.doorway/plugins/review-helper`, { recursive: true });
      mkdirSync(`${projectPath}/.doorway/plugins/broken-helper`, { recursive: true });
      writeFileSync(
        `${projectPath}/.doorway/plugins/review-helper/doorway.plugin.json`,
        JSON.stringify({
          id: 'com.doorway.review-helper',
          name: 'Review Helper',
          version: '0.1.0',
          capabilities: ['context.provide', 'terminal.observe'],
          permissions: {
            filesystem: { read: ['docs/**'], write: [] },
            network: { allowed_hosts: ['api.github.com'] },
          },
          entry: { command: 'node plugin.js' },
        })
      );
      writeFileSync(
        `${projectPath}/.doorway/plugins/broken-helper/doorway.plugin.json`,
        JSON.stringify({ id: 'broken-helper', capabilities: [] })
      );

      expect(listProjectPlugins(projectPath)).toMatchObject([
        {
          id: 'broken-helper',
          name: 'broken-helper',
          status: 'invalid',
          problem: 'Manifest name is required.',
        },
        {
          id: 'com.doorway.review-helper',
          name: 'Review Helper',
          status: 'ready',
          capabilities: ['context.provide', 'terminal.observe'],
          filesystemRead: ['docs/**'],
          filesystemWrite: [],
          networkHosts: ['api.github.com'],
          entryCommand: 'node plugin.js',
        },
      ]);
    });
  });

  describe('Agent Run Operations', () => {
    let threadId: ThreadId;
    let worktreeId: ReturnType<typeof generateId>;
    let terminalSessionId: ReturnType<typeof generateId>;
    let projectId: ProjectId;
    const taskId = generateId('task');

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'npm',
        new Date().toISOString(),
        new Date().toISOString()
      );

      const thread = createThread(db, projectId, 'Test Thread', 'Goal');
      threadId = thread.id;

      // Create a task first (worktrees FK to tasks)
      db.prepare(
        `
        INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(taskId, projectId, 'Test Task', 'parallel', 'planned', new Date().toISOString());

      // Create worktree and terminal session for the run
      worktreeId = generateId('wt');
      db.prepare(
        `
        INSERT INTO worktrees (id, project_id, task_id, path, branch, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        worktreeId,
        projectId,
        taskId,
        '/test/wt',
        'doorway/test',
        'active',
        new Date().toISOString()
      );

      terminalSessionId = generateId('term');
      db.prepare(
        `
        INSERT INTO terminal_sessions (id, agent_run_id, runtime, status, working_directory, created_at)
        VALUES (?, NULL, 'pty', 'created', '/test', ?)
      `
      ).run(terminalSessionId, new Date().toISOString());
    });

    it('should create an agent run', () => {
      const run = createAgentRun(
        db,
        threadId,
        taskId as import('@doorway/protocol').TaskId,
        'backend' as AgentRole,
        'claude-code',
        worktreeId as import('@doorway/protocol').WorktreeId,
        terminalSessionId as import('@doorway/protocol').TerminalSessionId
      );

      expect(run.id).toBeDefined();
      expect(run.threadId).toBe(threadId);
      expect(run.role).toBe('backend');
      expect(run.status).toBe('created');
    });

    it('should update agent run status', () => {
      const run = createAgentRun(
        db,
        threadId,
        taskId as import('@doorway/protocol').TaskId,
        'backend' as AgentRole,
        'claude-code',
        worktreeId as import('@doorway/protocol').WorktreeId,
        terminalSessionId as import('@doorway/protocol').TerminalSessionId
      );

      updateAgentRunStatus(db, run.id, 'running', { startedAt: new Date() });

      const updated = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(run.id) as {
        status: string;
      };
      expect(updated.status).toBe('running');
    });

    it('should complete an agent run with exit code', () => {
      const run = createAgentRun(
        db,
        threadId,
        taskId as import('@doorway/protocol').TaskId,
        'backend' as AgentRole,
        'claude-code',
        worktreeId as import('@doorway/protocol').WorktreeId,
        terminalSessionId as import('@doorway/protocol').TerminalSessionId
      );

      updateAgentRunStatus(db, run.id, 'done', {
        exitCode: 0,
        summary: 'All tests passed',
        completedAt: new Date(),
      });

      const updated = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(run.id) as {
        status: string;
        exit_code: number;
        summary: string;
      };
      expect(updated.status).toBe('done');
      expect(updated.exit_code).toBe(0);
      expect(updated.summary).toBe('All tests passed');
    });

    it('binds a launched agent run to terminal projections', () => {
      const runId = generateId('run') as import('@doorway/protocol').AgentRunId;
      upsertAgentRunLaunch(db, {
        runId,
        threadId,
        taskId: taskId as import('@doorway/protocol').TaskId,
        role: 'custom' as AgentRole,
        adapterId: 'codex',
        terminalSessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        status: 'terminal_launched',
        startedAt: new Date(),
      });

      recordTerminalStarted(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        agentRunId: runId,
        runtime: 'pty',
        workingDirectory: '/test',
        command: 'codex',
        pid: 123,
      });
      appendTerminalChunk(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        text: 'ready\n',
      });

      const terminal = listTerminalProjections(db, threadId)[0];
      const runRow = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as {
        terminal_session_id: string;
        status: string;
      };

      expect(runRow).toMatchObject({
        terminal_session_id: terminalSessionId,
        status: 'terminal_launched',
      });
      expect(terminal).toMatchObject({
        id: terminalSessionId,
        runId,
        command: 'codex',
        pid: 123,
        lastOutput: 'ready\n',
      });
    });

    it('projects launched agent runs as real tool lanes with terminal identity', () => {
      const runId = generateId('run') as import('@doorway/protocol').AgentRunId;
      upsertAgentRunLaunch(db, {
        runId,
        threadId,
        taskId: taskId as import('@doorway/protocol').TaskId,
        role: 'reviewer' as AgentRole,
        adapterId: 'codex',
        terminalSessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        status: 'running',
        startedAt: new Date('2026-05-20T10:00:00Z'),
      });
      recordTerminalStarted(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        agentRunId: runId,
        runtime: 'pty',
        workingDirectory: '/test',
        command: 'codex --ask-for-approval',
        pid: 456,
      });
      appendTerminalChunk(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        text: 'Reviewing packages/core/src/tool-lanes.ts\n',
      });

      const lane = listToolLaneProjections(db, threadId)[0];

      expect(lane).toMatchObject({
        id: runId,
        runId,
        threadId,
        taskId,
        toolId: 'codex',
        role: 'reviewer',
        runRole: 'reviewer',
        status: 'running',
        terminalSessionId,
        latestActivity: 'Reviewing packages/core/src/tool-lanes.ts',
      });
    });

    it('selects the active matching provider lane for follow-up input', () => {
      const runId = generateId('run') as import('@doorway/protocol').AgentRunId;
      upsertAgentRunLaunch(db, {
        runId,
        threadId,
        taskId: taskId as import('@doorway/protocol').TaskId,
        role: 'custom' as AgentRole,
        adapterId: 'claude',
        terminalSessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        status: 'running',
        startedAt: new Date('2026-05-20T10:00:00Z'),
      });
      recordTerminalStarted(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        agentRunId: runId,
        runtime: 'pty',
        workingDirectory: '/test',
        command: 'claude',
        pid: 789,
      });

      const lane = findReusableToolLane(db, { threadId, provider: 'claude' });

      expect(lane).toMatchObject({
        runId,
        terminalSessionId,
        toolId: 'claude',
        status: 'running',
      });
      expect(findReusableToolLane(db, { threadId, provider: 'codex' })).toBeUndefined();
      expect(followUpTerminalInput('  continue from the last result  ')).toBe(
        'continue from the last result\r'
      );
    });

    it('projects terminal attention as lane waiting and approval status', () => {
      const runId = generateId('run') as import('@doorway/protocol').AgentRunId;
      upsertAgentRunLaunch(db, {
        runId,
        threadId,
        taskId: taskId as import('@doorway/protocol').TaskId,
        role: 'custom' as AgentRole,
        adapterId: 'claude',
        terminalSessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        status: 'running',
        startedAt: new Date('2026-05-20T10:00:00Z'),
      });
      recordTerminalStarted(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        agentRunId: runId,
        runtime: 'pty',
        workingDirectory: '/test',
        command: 'claude',
        pid: 890,
      });
      appendTerminalChunk(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        text: 'Permission required: allow command? [y/N]\n',
      });

      expect(listToolLaneProjections(db, threadId)[0]).toMatchObject({
        runId,
        status: 'needs_approval',
        latestActivity: 'Permission required: allow command? [y/N]',
      });

      recordTerminalStopped(db, threadId, {
        sessionId: terminalSessionId as import('@doorway/protocol').TerminalSessionId,
        exitCode: 0,
      });

      expect(listToolLaneProjections(db, threadId)[0]).toMatchObject({
        runId,
        status: 'stopped',
      });
    });
  });

  describe('Worktree Operations', () => {
    let projectId: ProjectId;
    let taskId: string;

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      taskId = generateId('task');
      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'npm',
        new Date().toISOString(),
        new Date().toISOString()
      );
      // Create task first (worktrees FK to tasks)
      db.prepare(
        `
        INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(taskId, projectId, 'Test Task', 'parallel', 'planned', new Date().toISOString());
    });

    it('should create a worktree', () => {
      const worktree = createWorktree(
        db,
        projectId,
        taskId as import('@doorway/protocol').TaskId,
        '/test/worktrees/task-1',
        'doorway/task-1/backend'
      );

      expect(worktree.id).toBeDefined();
      expect(worktree.path).toBe('/test/worktrees/task-1');
      expect(worktree.branch).toBe('doorway/task-1/backend');
      expect(worktree.status).toBe('active');
    });

    it('should archive a worktree', () => {
      const worktree = createWorktree(
        db,
        projectId,
        taskId as import('@doorway/protocol').TaskId,
        '/test/worktrees/task-1',
        'doorway/task-1/backend'
      );

      archiveWorktree(db, worktree.id);

      const archived = db.prepare('SELECT * FROM worktrees WHERE id = ?').get(worktree.id) as {
        status: string;
        archived_at: string;
      };
      expect(archived.status).toBe('archived');
      expect(archived.archived_at).toBeTruthy();
    });

    it('should list worktrees for a project', () => {
      createWorktree(db, projectId, taskId as import('@doorway/protocol').TaskId, '/wt1', 'b1');
      createWorktree(db, projectId, taskId as import('@doorway/protocol').TaskId, '/wt2', 'b2');

      const worktrees = listWorktrees(db, projectId);
      expect(worktrees).toHaveLength(2);
    });
  });

  describe('Event Sourcing', () => {
    let projectId: ProjectId;
    let threadId: ThreadId;

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'npm',
        new Date().toISOString(),
        new Date().toISOString()
      );

      const thread = createThread(db, projectId, 'Test Thread', 'Goal');
      threadId = thread.id;
    });

    it('should record an event', () => {
      const event = recordEvent(db, threadId, 'thread.status_changed', {
        threadId,
        previousStatus: 'active',
        newStatus: 'paused',
      } as import('@doorway/protocol').ThreadStatusChangedPayload);

      expect(event.id).toBeDefined();
      expect(event.threadId).toBe(threadId);
      expect(event.type).toBe('thread.status_changed');
      expect(event.sequence).toBeGreaterThan(0);
    });

    it('emits recorded events through the database event bus', () => {
      const typedEvents: unknown[] = [];
      const allEvents: unknown[] = [];
      const unsubscribeTyped = dbEventBus.on('thread.status_changed', (event) => {
        typedEvents.push(event);
      });
      const unsubscribeAll = dbEventBus.on('*', (event) => {
        allEvents.push(event);
      });

      try {
        const event = recordEvent(db, threadId, 'thread.status_changed', {
          threadId,
          previousStatus: 'active',
          newStatus: 'paused',
        } as import('@doorway/protocol').ThreadStatusChangedPayload);

        expect(typedEvents).toEqual([event]);
        expect(allEvents).toEqual([{ event: 'thread.status_changed', payload: event }]);
      } finally {
        unsubscribeTyped();
        unsubscribeAll();
      }
    });

    it('should record thread status changes as replayable lifecycle events', () => {
      updateThreadStatus(db, threadId, 'paused');

      const events = getEvents(db, threadId, { type: 'thread.status_changed' });

      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        threadId,
        previousStatus: 'active',
        newStatus: 'paused',
      });
    });

    it('should replay events for a thread', () => {
      recordEvent(db, threadId, 'thread.status_changed', {
        threadId,
        previousStatus: 'active',
        newStatus: 'paused',
      } as import('@doorway/protocol').ThreadStatusChangedPayload);

      recordEvent(db, threadId, 'message.appended', {
        type: 'message.appended',
        messageId: generateId('msg') as import('@doorway/protocol').MessageId,
        threadId,
        role: 'user',
        content: 'Hello',
      } as import('@doorway/protocol').MessageAppendedPayload);

      const events = replayEvents(db, threadId);

      expect(events).toHaveLength(2);
      const firstEvent = events[0];
      const secondEvent = events[1];
      if (firstEvent && secondEvent) {
        expect(firstEvent.sequence).toBeLessThan(secondEvent.sequence);
      }
    });

    it('should serialize replay events as deterministic JSONL', () => {
      const first = recordEvent(db, threadId, 'message.appended', {
        messageId: 'msg_1' as import('@doorway/protocol').MessageId,
        threadId,
        role: 'user',
        content: 'Hello',
      } as import('@doorway/protocol').MessageAppendedPayload);
      const second = recordEvent(db, threadId, 'thread.status_changed', {
        threadId,
        previousStatus: 'active',
        newStatus: 'paused',
      } as import('@doorway/protocol').ThreadStatusChangedPayload);

      expect(JSON.parse(replayEventJsonLine(first))).toEqual({
        id: first.id,
        threadId,
        type: 'message.appended',
        sequence: first.sequence,
        timestamp: first.timestamp.toISOString(),
        payload: {
          messageId: 'msg_1',
          threadId,
          role: 'user',
          content: 'Hello',
        },
      });
      expect(replayEventsJsonl([second, first])).toBe(
        `${replayEventJsonLine(first)}\n${replayEventJsonLine(second)}\n`
      );
      expect(exportThreadReplayJsonl(db, threadId)).toBe(
        `${replayEventJsonLine(first)}\n${replayEventJsonLine(second)}\n`
      );
      expect(parseReplayEventJsonLine(replayEventJsonLine(first))).toEqual(first);
      expect(
        parseReplayEventsJsonl(`${replayEventJsonLine(first)}\n${replayEventJsonLine(second)}\n`)
      ).toEqual([first, second]);
    });

    it('should reject malformed replay JSONL imports', () => {
      const first = recordEvent(db, threadId, 'message.appended', {
        messageId: 'msg_1' as import('@doorway/protocol').MessageId,
        threadId,
        role: 'user',
        content: 'Hello',
      } as import('@doorway/protocol').MessageAppendedPayload);
      const second = recordEvent(db, threadId, 'thread.status_changed', {
        threadId,
        previousStatus: 'active',
        newStatus: 'paused',
      } as import('@doorway/protocol').ThreadStatusChangedPayload);

      expect(() => parseReplayEventsJsonl('{"id":')).toThrow(ValidationError);
      expect(() =>
        parseReplayEventsJsonl(
          JSON.stringify({
            ...JSON.parse(replayEventJsonLine(first)),
            type: 'unknown.event',
          })
        )
      ).toThrow(ValidationError);
      expect(() =>
        parseReplayEventsJsonl(`${replayEventJsonLine(second)}\n${replayEventJsonLine(first)}\n`)
      ).toThrow(ValidationError);
    });

    it('should filter events by type', () => {
      recordEvent(db, threadId, 'thread.status_changed', {
        threadId,
        previousStatus: 'active',
        newStatus: 'paused',
      } as import('@doorway/protocol').ThreadStatusChangedPayload);

      recordEvent(db, threadId, 'message.appended', {
        type: 'message.appended',
        messageId: generateId('msg') as import('@doorway/protocol').MessageId,
        threadId,
        role: 'user',
        content: 'Hello',
      } as import('@doorway/protocol').MessageAppendedPayload);

      const messageEvents = getEvents(db, threadId, { type: 'message.appended' });

      expect(messageEvents).toHaveLength(1);
      expect(messageEvents[0]?.type).toBe('message.appended');
    });

    it('updates a task graph node and records a replayable event', () => {
      const taskId = generateId('task');
      const nodeId = generateId('node');
      const worktreeId = generateId('wt');
      const terminalSessionId = generateId('term');
      const runId = generateId('run');
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(taskId, projectId, 'Ship graph mutation', 'sequential', 'planned', now);
      db.prepare(
        `
        INSERT INTO task_nodes (id, task_id, role, status, worktree_policy, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(nodeId, taskId, 'implementer', 'pending', 'isolated', now, now);
      db.prepare(
        `
        INSERT INTO worktrees (id, project_id, task_id, path, branch, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(worktreeId, projectId, taskId, '/test/graph-wt', 'doorway/graph', 'active', now);
      db.prepare(
        `
        INSERT INTO terminal_sessions (id, agent_run_id, runtime, status, working_directory, created_at)
        VALUES (?, NULL, 'pty', 'created', '/test', ?)
      `
      ).run(terminalSessionId, now);
      db.prepare(
        `
        INSERT INTO agent_runs (
          id, thread_id, task_id, role, adapter_id, worktree_id, terminal_session_id, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        runId,
        threadId,
        taskId,
        'backend',
        'claude-code',
        worktreeId,
        terminalSessionId,
        'created',
        now
      );

      const graph = updateTaskNodeStatus(db, threadId, nodeId, 'completed');
      const events = getEvents(db, threadId, { type: 'task_graph.updated' });

      expect(graph.nodes[0]?.status).toBe('completed');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        taskId,
        nodeId,
        previousStatus: 'pending',
        newStatus: 'completed',
      });
    });

    it('claims and completes task graph nodes from real run lifecycle', () => {
      const taskId = generateId('task') as TaskId;
      const nodeId = generateId('node');
      const terminalSessionId = generateId('term') as TerminalSessionId;
      const runId = generateId('run') as AgentRunId;
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(taskId, projectId, 'Execute graph node', 'sequential', 'planned', now);
      db.prepare(
        `
        INSERT INTO task_nodes (id, task_id, role, status, worktree_policy, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(nodeId, taskId, 'implementer', 'pending', 'isolated', now, now);
      db.prepare(
        `
        INSERT INTO terminal_sessions (id, agent_run_id, runtime, status, working_directory, created_at)
        VALUES (?, NULL, 'pty', 'created', '/test', ?)
      `
      ).run(terminalSessionId, now);
      db.prepare(
        `
        INSERT INTO agent_runs (
          id, thread_id, task_id, role, adapter_id, terminal_session_id, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(runId, threadId, taskId, 'backend', 'claude-code', terminalSessionId, 'running', now);

      const claimed = claimTaskGraphNodeForRun(db, threadId, {
        taskId,
        runId,
        role: 'implementer',
      });
      const completed = completeTaskGraphNodeForRun(db, threadId, { runId, exitCode: 0 });
      const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as {
        status: string;
      };
      const events = getEvents(db, threadId, { type: 'task_graph.updated' });

      expect(claimed).toMatchObject({
        id: taskId,
        status: 'running',
        nodes: [
          {
            id: nodeId,
            status: 'running',
            assignedRunId: runId,
          },
        ],
      });
      expect(completed).toMatchObject({
        id: taskId,
        status: 'completed',
        nodes: [
          {
            id: nodeId,
            status: 'completed',
            assignedRunId: runId,
          },
        ],
      });
      expect(task.status).toBe('completed');
      expect(events.map((event) => event.payload)).toMatchObject([
        {
          taskId,
          nodeId,
          previousStatus: 'pending',
          newStatus: 'running',
          assignedRunId: runId,
          graphStatus: 'running',
        },
        {
          taskId,
          nodeId,
          previousStatus: 'running',
          newStatus: 'completed',
          assignedRunId: runId,
          graphStatus: 'completed',
        },
      ]);
    });
  });

  describe('Terminal Evidence', () => {
    let projectId: ProjectId;
    let threadId: ThreadId;
    let sessionId: TerminalSessionId;

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'npm',
        new Date().toISOString(),
        new Date().toISOString()
      );

      const thread = createThread(db, projectId, 'Terminal Thread', 'Capture terminal evidence');
      threadId = thread.id;
      sessionId = generateId('term') as TerminalSessionId;
    });

    it('persists terminal start, chunks, stop, and matching events', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'pnpm test',
        pid: 42,
      });

      const input = recordTerminalInput(db, threadId, {
        sessionId,
        text: 'pnpm test\n',
      });
      appendTerminalChunk(db, threadId, {
        sessionId,
        text: 'running tests\n',
      });
      appendTerminalChunk(db, threadId, {
        sessionId,
        text: 'all green\n',
      });
      recordTerminalStopped(db, threadId, { sessionId, exitCode: 0 });

      const transcript = getTerminalTranscript(db, sessionId);
      const inputs = listTerminalInputs(db, sessionId);
      const terminals = listTerminalProjections(db, threadId);
      const events = replayEvents(db, threadId);
      const proofs = listProofs(db, threadId);
      const session = db
        .prepare('SELECT status, command, pid FROM terminal_sessions WHERE id = ?')
        .get(sessionId) as { status: string; command: string; pid: number };

      expect(transcript).toHaveLength(2);
      expect(transcript[0]?.sequence).toBe(0);
      expect(transcript[1]?.sequence).toBe(1);
      expect(input).toMatchObject({
        sessionId,
        sequence: 0,
        text: 'pnpm test\n',
        source: 'user',
      });
      expect(input.timestamp).toBeInstanceOf(Date);
      expect(inputs).toMatchObject([
        {
          sessionId,
          sequence: 0,
          text: 'pnpm test\n',
          source: 'user',
        },
      ]);
      expect(inputs[0]?.timestamp).toBeInstanceOf(Date);
      expect(terminals).toMatchObject([
        {
          id: sessionId,
          runtime: 'pty',
          status: 'stopped',
          workingDirectory: '/repo',
          command: 'pnpm test',
          pid: 42,
          exitCode: 0,
          exitClassification: {
            kind: 'success',
            label: 'exit 0',
            summary: 'Command exited successfully.',
            recommendation: 'No exit-code action needed.',
            exitCode: 0,
          },
          lastOutput: 'all green\n',
        },
      ]);
      expect(session.status).toBe('stopped');
      expect(session.command).toBe('pnpm test');
      expect(session.pid).toBe(42);
      expect(proofs).toHaveLength(1);
      expect(proofs[0]?.status).toBe('pass');
      expect(proofs[0]?.command).toBe('pnpm test');
      expect(proofs[0]?.startedAt).toBeInstanceOf(Date);
      expect(proofs[0]?.finishedAt).toBeInstanceOf(Date);
      expect(proofs[0]?.evidence.map((ref) => ref.kind)).toEqual(['terminal', 'test']);
      expect(events.map((event) => event.type)).toEqual([
        'terminal.started',
        'test.started',
        'terminal.input',
        'terminal.output',
        'terminal.output',
        'terminal.stopped',
        'agent.attention',
        'completion.confidence_updated',
        'test.finished',
      ]);
      expect(events.find((event) => event.type === 'terminal.input')?.payload).toEqual({
        sessionId,
        sequence: 0,
        text: 'pnpm test\n',
        source: 'user',
      });
      expect(events.find((event) => event.type === 'terminal.stopped')?.payload).toMatchObject({
        sessionId,
        exitCode: 0,
        exitClassification: {
          kind: 'success',
          label: 'exit 0',
        },
      });
    });

    it('classifies terminal exits and persists the taxonomy into projections', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'missing-command',
        pid: 43,
      });

      recordTerminalStopped(db, threadId, { sessionId, exitCode: 127 });

      const terminal = listTerminalProjections(db, threadId)[0];
      const stoppedEvent = getEvents(db, threadId, { type: 'terminal.stopped' })[0];

      expect(terminal).toMatchObject({
        exitCode: 127,
        exitClassification: {
          kind: 'command_not_found',
          label: 'exit 127',
          summary: 'Command was not found by the shell.',
        },
      });
      expect(stoppedEvent?.payload).toMatchObject({
        exitClassification: {
          kind: 'command_not_found',
          recommendation: 'Check PATH, package installation, and the command name.',
        },
      });
    });

    it('builds operational memory from real terminal input events', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'bash',
        pid: 44,
      });

      for (const text of ['pnpm', ' test', '\n', 'pnpm test\n', 'y\n', 'pnpm test\n']) {
        recordTerminalInput(db, threadId, {
          sessionId,
          text,
          source: text === 'y\n' ? 'permission_decision' : 'user',
        });
      }
      recordTerminalStopped(db, threadId, { sessionId, exitCode: 0 });

      const memory = getThreadOperationalMemory(db, threadId);

      expect(memory.threadId).toBe(threadId);
      expect(memory.observedCommands).toMatchObject([
        {
          command: 'pnpm test',
          runCount: 3,
          sources: ['user'],
          lastSessionId: sessionId,
          lastSessionStatus: 'stopped',
          lastSessionExitLabel: 'exit 0',
          isRepeatedWorkflow: true,
          isStoredPattern: true,
        },
      ]);
      expect(memory.repeatedCommands).toHaveLength(1);
      expect(memory.storedPatternCount).toBe(1);
      expect(memory.observedCommands[0]?.memoryId).toMatch(/^pmem_/);
      expect(memory.observedCommands[0]?.firstSeenAt).toBeInstanceOf(Date);
      expect(memory.observedCommands[0]?.lastSeenAt).toBeInstanceOf(Date);
      expect(memory.generatedAt).toBeInstanceOf(Date);

      const storedPattern = db
        .prepare(
          `
          SELECT project_id, kind, pattern_key, summary, occurrences, confidence, evidence_json
          FROM pattern_memory_items
          WHERE id = ?
        `
        )
        .get(memory.observedCommands[0]?.memoryId) as {
        readonly project_id: string;
        readonly kind: string;
        readonly pattern_key: string;
        readonly summary: string;
        readonly occurrences: number;
        readonly confidence: number;
        readonly evidence_json: string;
      };

      expect(storedPattern).toMatchObject({
        project_id: projectId,
        kind: 'command',
        pattern_key: 'pnpm test',
        summary: 'Repeated command observed 3 times: pnpm test',
        occurrences: 3,
      });
      expect(storedPattern.confidence).toBeCloseTo(0.85);
      expect(JSON.parse(storedPattern.evidence_json)).toMatchObject([
        {
          threadId,
          sessionId,
          command: 'pnpm test',
          runCount: 3,
        },
      ]);
    });

    it('classifies signal exits from shell 128 plus signal codes', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'native-test',
        pid: 44,
      });

      recordTerminalStopped(db, threadId, { sessionId, exitCode: 139 });

      expect(listTerminalProjections(db, threadId)[0]).toMatchObject({
        exitCode: 139,
        exitClassification: {
          kind: 'segmentation_fault',
          label: 'SIGSEGV',
          signalNumber: 11,
        },
      });
    });

    it('persists attention and completion confidence from terminal output patterns', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'claude code',
        pid: 42,
      });

      appendTerminalChunk(db, threadId, {
        sessionId,
        text: 'Permission required: allow command? [y/N]\n',
      });

      const events = replayEvents(db, threadId);
      expect(events.find((event) => event.type === 'agent.attention')?.payload).toMatchObject({
        sessionId,
        state: 'needs_approval',
        source: 'terminal_output',
        reason: 'Terminal output requested permission or approval.',
        outputPreview: 'Permission required: allow command? [y/N]',
      });
      expect(
        events.find((event) => event.type === 'completion.confidence_updated')?.payload
      ).toMatchObject({
        sessionId,
        score: 0.5,
        recommendedState: 'waiting_for_user',
        signals: ['permission_prompt'],
      });
    });

    it('redacts credentials before terminal transcript persistence', () => {
      const token = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
      const passwordValue = 'doorway-password-value';
      const secretValue = 'doorway-secret-value';

      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'pnpm test',
        pid: 42,
      });

      const chunk = appendTerminalChunk(db, threadId, {
        sessionId,
        text: [
          `provider token ${token}`,
          `{"password": "${passwordValue}"}`,
          `{"secret": "${secretValue}"}`,
        ].join('\n'),
      });
      recordTerminalInput(db, threadId, {
        sessionId,
        text: `send token ${token}`,
        source: 'permission_decision',
      });
      const row = db
        .prepare('SELECT text FROM terminal_chunks WHERE session_id = ?')
        .get(sessionId) as {
        text: string;
      };
      const outputEvent = replayEvents(db, threadId).find(
        (event) => event.type === 'terminal.output'
      );
      const inputEvent = replayEvents(db, threadId).find(
        (event) => event.type === 'terminal.input'
      );
      const inputRow = db
        .prepare('SELECT text, source FROM terminal_inputs WHERE session_id = ?')
        .get(sessionId) as {
        text: string;
        source: string;
      };

      expect(chunk.text).toContain('[REDACTED]');
      expect(row.text).toContain('[REDACTED]');
      expect(inputRow.text).toContain('[REDACTED]');
      expect(inputRow.source).toBe('permission_decision');
      expect(JSON.stringify(outputEvent?.payload)).toContain('[REDACTED]');
      expect(JSON.stringify(inputEvent?.payload)).toContain('[REDACTED]');
      expect(chunk.text).not.toContain(token);
      expect(chunk.text).not.toContain(passwordValue);
      expect(chunk.text).not.toContain(secretValue);
      expect(row.text).not.toContain(token);
      expect(row.text).not.toContain(passwordValue);
      expect(row.text).not.toContain(secretValue);
      expect(inputRow.text).not.toContain(token);
      expect(JSON.stringify(outputEvent?.payload)).not.toContain(token);
      expect(JSON.stringify(outputEvent?.payload)).not.toContain(passwordValue);
      expect(JSON.stringify(outputEvent?.payload)).not.toContain(secretValue);
      expect(JSON.stringify(inputEvent?.payload)).not.toContain(token);
    });

    it('persists clean terminal text and control events alongside raw output', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'pnpm test',
        pid: 42,
      });

      const chunk = appendTerminalChunk(db, threadId, {
        sessionId,
        text: '\x1b[31mneeds input\x1b[0m',
        cleanText: 'needs input',
        controlEvents: [
          { type: 'csi', sequence: '\x1b[31m', final: 'm' },
          { type: 'csi', sequence: '\x1b[0m', final: 'm' },
        ],
        screenSnapshot: {
          buffer: 'main',
          cursorRow: 0,
          cursorCol: 11,
          visibleText: 'needs input',
        },
        stateDetection: {
          state: 'awaiting_input',
          provider: 'claude',
          confidence: 0.79,
          reason: 'Terminal is showing an input prompt.',
          signals: ['prompt_pattern', 'cursor_visible'],
        },
      });
      const row = db
        .prepare(
          'SELECT text, raw_text, clean_text, control_events_json, screen_snapshot_json, state_detection_json FROM terminal_chunks WHERE session_id = ?'
        )
        .get(sessionId) as {
        text: string;
        raw_text: string;
        clean_text: string;
        control_events_json: string;
        screen_snapshot_json: string;
        state_detection_json: string;
      };
      const [transcriptChunk] = getTerminalTranscript(db, sessionId);
      const outputEvent = replayEvents(db, threadId).find(
        (event) => event.type === 'terminal.output'
      );
      const stateEvent = replayEvents(db, threadId).find(
        (event) => event.type === 'terminal.state'
      );
      const attentionEvent = replayEvents(db, threadId).find(
        (event) => event.type === 'agent.attention'
      );
      const projection = listTerminalProjections(db, threadId)[0];

      expect(chunk.text).toBe('\x1b[31mneeds input\x1b[0m');
      expect(chunk.cleanText).toBe('needs input');
      expect(chunk.controlEvents).toHaveLength(2);
      expect(chunk.screenSnapshot?.visibleText).toBe('needs input');
      expect(chunk.stateDetection?.state).toBe('awaiting_input');
      expect(row.text).toBe('\x1b[31mneeds input\x1b[0m');
      expect(row.raw_text).toBe('\x1b[31mneeds input\x1b[0m');
      expect(row.clean_text).toBe('needs input');
      expect(JSON.parse(row.control_events_json)).toHaveLength(2);
      expect(JSON.parse(row.screen_snapshot_json).visibleText).toBe('needs input');
      expect(JSON.parse(row.state_detection_json).state).toBe('awaiting_input');
      expect(transcriptChunk.cleanText).toBe('needs input');
      expect(transcriptChunk.controlEvents).toHaveLength(2);
      expect(transcriptChunk.screenSnapshot?.visibleText).toBe('needs input');
      expect(transcriptChunk.stateDetection?.state).toBe('awaiting_input');
      expect(JSON.stringify(outputEvent?.payload)).toContain('needs input');
      expect(JSON.stringify(outputEvent?.payload)).toContain('awaiting_input');
      expect(JSON.stringify(stateEvent?.payload)).toContain('awaiting_input');
      expect(attentionEvent?.payload).toMatchObject({ state: 'needs_input' });
      expect(projection?.status).toBe('waiting');
    });

    it('does not create proof records for non-test terminal commands', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'pnpm build',
        pid: 42,
      });

      recordTerminalStopped(db, threadId, { sessionId, exitCode: 0 });

      expect(listProofs(db, threadId)).toHaveLength(0);
      expect(replayEvents(db, threadId).map((event) => event.type)).toEqual([
        'terminal.started',
        'terminal.stopped',
        'agent.attention',
        'completion.confidence_updated',
      ]);
    });

    it('rejects chunks and inputs for unknown terminal sessions', () => {
      expect(() => {
        appendTerminalChunk(db, threadId, {
          sessionId: 'term_missing' as TerminalSessionId,
          text: 'lost output',
        });
      }).toThrow(NotFoundError);
      expect(() => {
        recordTerminalInput(db, threadId, {
          sessionId: 'term_missing' as TerminalSessionId,
          text: 'lost input',
        });
      }).toThrow(NotFoundError);
    });

    it('creates compact checkpoints from persisted terminal evidence', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'pnpm test',
        pid: 88,
      });
      recordTerminalInput(db, threadId, {
        sessionId,
        text: 'pnpm test\n',
      });
      appendTerminalChunk(db, threadId, {
        sessionId,
        text: 'running tests\n',
      });
      appendTerminalChunk(db, threadId, {
        sessionId,
        text: 'Error: expected true to be false\n',
        isStderr: true,
      });
      recordTerminalStopped(db, threadId, { sessionId, exitCode: 1 });

      const checkpoint = createCompactCheckpoint(db, threadId);

      expect(checkpoint).toMatchObject({
        threadId,
        originalGoal: 'Capture terminal evidence',
        commandsRun: ['pnpm test'],
        currentStatus: 'active',
        tests: ['pnpm test · fail · Test command exited with code 1.'],
        errors: ['Error: expected true to be false'],
        nextAction: 'Resolve the latest error evidence, then rerun the relevant verification.',
      });
      expect(checkpoint.importantLines).toEqual([
        'running tests',
        'Error: expected true to be false',
      ]);
      expect(checkpoint.nextPrompt).toContain(
        'Continue this Doorway run from the compact checkpoint.'
      );
      expect(listCompactCheckpoints(db, threadId)[0]).toMatchObject({
        id: checkpoint.id,
        nextPrompt: checkpoint.nextPrompt,
      });
      expect(getEvents(db, threadId).at(-1)).toMatchObject({
        type: 'thread.compacted',
        payload: {
          checkpointId: checkpoint.id,
          terminalSessionIds: [sessionId],
        },
      });
    });

    it('persists process snapshots and projects latest process evidence on the terminal', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'bash',
        pid: 100,
      });

      const snapshot = recordProcessSnapshot(db, threadId, {
        sessionId,
        phase: 'running',
        rootPid: 100,
        nodes: [
          {
            pid: 100,
            ppid: 1,
            command: 'bash',
            args: 'bash',
            cpuPercent: 0,
            memoryPercent: 0.1,
          },
          {
            pid: 101,
            ppid: 100,
            command: 'pnpm',
            args: 'pnpm test',
            cpuPercent: 1.5,
            memoryPercent: 2,
          },
        ],
        capturedAt: new Date('2026-05-20T01:00:00.000Z'),
      });

      expect(listProcessSnapshots(db, sessionId)).toHaveLength(1);
      expect(listTerminalProjections(db, threadId)[0]).toMatchObject({
        latestProcessSnapshot: {
          id: snapshot.id,
          phase: 'running',
          rootPid: 100,
          nodes: [{ pid: 100 }, { pid: 101 }],
        },
      });
      expect(getEvents(db, threadId).at(-1)).toMatchObject({
        type: 'process.snapshot_captured',
        payload: {
          snapshotId: snapshot.id,
          sessionId,
          processCount: 2,
        },
      });
    });

    it('records process snapshot failures as visible thread events', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'bash',
        pid: 200,
      });

      recordProcessSnapshotFailed(db, threadId, {
        sessionId,
        phase: 'running',
        rootPid: 200,
        reason: 'ps unavailable',
      });

      expect(getEvents(db, threadId).at(-1)).toMatchObject({
        type: 'process.snapshot_failed',
        payload: {
          sessionId,
          phase: 'running',
          rootPid: 200,
          reason: 'ps unavailable',
        },
      });
    });

    it('persists terminal file deltas and projects the latest snapshot', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'bash',
        pid: 300,
      });

      const snapshot = recordTerminalFileDeltaSnapshot(db, threadId, {
        sessionId,
        phase: 'running',
        rootPath: '/repo',
        changes: [
          {
            path: 'src/app.ts',
            changeType: 'modified',
            previousSize: 10,
            currentSize: 20,
          },
        ],
        capturedAt: new Date('2026-05-20T01:01:00.000Z'),
      });

      expect(listTerminalFileDeltaSnapshots(db, sessionId)).toHaveLength(1);
      expect(listTerminalProjections(db, threadId)[0]).toMatchObject({
        latestFileDeltaSnapshot: {
          id: snapshot.id,
          phase: 'running',
          rootPath: '/repo',
          changes: [{ path: 'src/app.ts', changeType: 'modified' }],
        },
      });
      expect(getEvents(db, threadId).at(-1)).toMatchObject({
        type: 'terminal.file_delta_captured',
        payload: {
          snapshotId: snapshot.id,
          sessionId,
          changeCount: 1,
        },
      });
    });

    it('records terminal file delta failures as visible thread events', () => {
      recordTerminalStarted(db, threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: '/repo',
        command: 'bash',
        pid: 301,
      });

      recordTerminalFileDeltaFailed(db, threadId, {
        sessionId,
        phase: 'running',
        rootPath: '/repo',
        reason: 'snapshot failed',
      });

      expect(getEvents(db, threadId).at(-1)).toMatchObject({
        type: 'terminal.file_delta_failed',
        payload: {
          sessionId,
          phase: 'running',
          rootPath: '/repo',
          reason: 'snapshot failed',
        },
      });
    });
  });

  describe('Permission Evidence', () => {
    let projectId: ProjectId;
    let threadId: ThreadId;
    let taskId: import('@doorway/protocol').TaskId;

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      taskId = generateId('task') as import('@doorway/protocol').TaskId;

      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'npm',
        new Date().toISOString(),
        new Date().toISOString()
      );

      threadId = createThread(db, projectId, 'Permission Thread', 'Review approval').id;

      db.prepare(
        `
        INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(taskId, projectId, 'Permission Task', 'parallel', 'planned', new Date().toISOString());
    });

    it('persists permission receipts and approval events for a thread', () => {
      const receipt = recordPermissionReceipt(db, threadId, {
        taskId,
        command: 'final_merge',
        riskCategory: 'merge',
        decision: 'approved',
        userNotes: 'Reviewed diff and tests.',
      });

      const receipts = listPermissionReceipts(db, threadId);
      const events = replayEvents(db, threadId);

      expect(receipt.id).toMatch(/^rcpt_/);
      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.decision).toBe('approved');
      expect(receipts[0]?.command).toBe('final_merge');
      expect(receipts[0]?.evidence.map((ref) => ref.kind)).toEqual(['permission']);
      expect(events.map((event) => event.type)).toEqual(['approval.granted']);
    });

    it('records denied receipts as approval denial events', () => {
      recordPermissionReceipt(db, threadId, {
        taskId,
        command: 'rm -rf dist',
        riskCategory: 'destructive_command',
        decision: 'denied',
        userNotes: 'Not required for the task.',
      });

      const receipts = listPermissionReceipts(db, threadId);
      const events = replayEvents(db, threadId);

      expect(receipts[0]?.decision).toBe('denied');
      expect(events.map((event) => event.type)).toEqual(['approval.denied']);
    });
  });

  describe('Merge Evidence', () => {
    let projectId: ProjectId;
    let threadId: ThreadId;
    let taskId: import('@doorway/protocol').TaskId;

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      taskId = generateId('task') as import('@doorway/protocol').TaskId;

      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'pnpm',
        new Date().toISOString(),
        new Date().toISOString()
      );

      threadId = createThread(db, projectId, 'Merge Thread', 'Assess merge safety').id;

      db.prepare(
        `
        INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(taskId, projectId, 'Merge Task', 'parallel', 'planned', new Date().toISOString());
    });

    it('persists MergeJudge assessments and matching events', () => {
      const assessment = recordMergeAssessment(db, threadId, {
        taskId,
        score: 'reviewable',
        reason: 'Awaiting human approval receipt.',
        cleanApply: true,
        testsPassed: true,
        highRiskFiles: ['package.json'],
        hasApproval: false,
      });

      const assessments = listMergeAssessments(db, threadId);
      const events = replayEvents(db, threadId);

      expect(assessment.id).toMatch(/^merge_assessment_/);
      expect(assessments).toHaveLength(1);
      expect(assessments[0]?.score).toBe('reviewable');
      expect(assessments[0]?.highRiskFiles).toEqual(['package.json']);
      expect(assessments[0]?.evidence.map((ref) => ref.kind)).toEqual(['merge']);
      expect(events.map((event) => event.type)).toEqual(['merge.evaluated']);
    });
  });

  describe('Handoff Evidence', () => {
    let projectId: ProjectId;
    let threadId: ThreadId;
    let taskId: import('@doorway/protocol').TaskId;
    let runId: import('@doorway/protocol').AgentRunId;

    beforeEach(() => {
      projectId = generateId('proj') as ProjectId;
      taskId = generateId('task') as import('@doorway/protocol').TaskId;

      db.prepare(
        `
        INSERT OR IGNORE INTO projects (id, path, name, package_manager, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        projectId,
        `/test/project-${projectId}`,
        'Test Project',
        'pnpm',
        new Date().toISOString(),
        new Date().toISOString()
      );

      threadId = createThread(db, projectId, 'Handoff Thread', 'Continue work').id;

      db.prepare(
        `
        INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(taskId, projectId, 'Handoff Task', 'parallel', 'planned', new Date().toISOString());

      const worktreeId = generateId('wt');
      db.prepare(
        `
        INSERT INTO worktrees (id, project_id, task_id, path, branch, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        worktreeId,
        projectId,
        taskId,
        '/test/handoff-wt',
        'doorway/handoff',
        'active',
        new Date().toISOString()
      );

      const terminalSessionId = generateId('term');
      db.prepare(
        `
        INSERT INTO terminal_sessions (id, agent_run_id, runtime, status, working_directory, created_at)
        VALUES (?, NULL, 'pty', 'created', '/test', ?)
      `
      ).run(terminalSessionId, new Date().toISOString());

      runId = createAgentRun(
        db,
        threadId,
        taskId,
        'backend' as AgentRole,
        'claude-code',
        worktreeId as import('@doorway/protocol').WorktreeId,
        terminalSessionId as import('@doorway/protocol').TerminalSessionId
      ).id;
    });

    it('projects persisted handoff capsules for a thread', () => {
      const capsuleId = generateId('hnd');
      db.prepare(
        `
        INSERT INTO handoff_capsules (
          id, thread_id, source_run_id, target_provider, summary, latest_intent, run_summary,
          worktree_path, branch, changed_files, diff_summary, next_prompt, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        capsuleId,
        threadId,
        runId,
        'codex',
        'Agent finished the core slice.',
        'Continue implementation',
        'Run completed with evidence.',
        '/test/handoff-wt',
        'doorway/handoff',
        JSON.stringify(['packages/core/src/handoff-evidence.ts']),
        'One file changed.',
        'Render the capsule in Evidence.',
        new Date().toISOString()
      );

      const capsules = listHandoffCapsules(db, threadId);

      expect(capsules).toHaveLength(1);
      expect(capsules[0]?.summary).toBe('Agent finished the core slice.');
      expect(capsules[0]?.targetProvider).toBe('codex');
      expect(capsules[0]?.worktreePath).toBe('/test/handoff-wt');
      expect(capsules[0]?.branch).toBe('doorway/handoff');
      expect(capsules[0]?.changedFiles).toEqual(['packages/core/src/handoff-evidence.ts']);
      expect(capsules[0]?.evidence.map((ref) => ref.kind)).toEqual(['handoff']);
    });
  });

  describe('Provider Models', () => {
    it('projects enabled provider model registry rows', () => {
      db.prepare(
        `
        INSERT INTO provider_profiles (
          id, kind, provider_id, display_name, auth_type, enabled, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        'provider_openai',
        'built_in',
        'openai',
        'OpenAI',
        'api_key',
        1,
        new Date('2026-05-18T01:00:00.000Z').toISOString(),
        new Date('2026-05-18T01:00:00.000Z').toISOString()
      );
      db.prepare(
        `
        INSERT INTO model_profiles (
          id, provider_profile_id, model_id, display_name, context_window, max_output_tokens,
          supports_streaming, supports_json_schema, supports_tool_calling, supports_vision, enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run('model_gpt', 'provider_openai', 'gpt-5.2', 'GPT-5.2', 200000, 8192, 1, 1, 1, 0, 1);

      const models = listProviderModels(db);

      expect(models).toHaveLength(1);
      expect(models[0]).toMatchObject({
        id: 'model_gpt',
        providerProfileId: 'provider_openai',
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5.2',
        displayName: 'GPT-5.2',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsJsonSchema: true,
        supportsToolCalling: true,
        supportsVision: false,
      });
    });
  });

  describe('Tool Capabilities', () => {
    let projectId: ProjectId;
    let threadId: ThreadId;

    beforeEach(() => {
      projectId = openProject(db, {
        path: '/tmp',
        name: 'Tool Policy Project',
      }).id;
      threadId = createThread(db, projectId, 'Tool Policy Thread', 'Govern tool access').id;
    });

    it('projects built-in tool permissions and persists per-thread enablement', () => {
      const withoutContext = listToolCapabilities(db);
      const withProject = listToolCapabilities(db, { projectId });

      expect(withoutContext.find((tool) => tool.id === 'tool.claude-code')?.status).toBe(
        'requires_project'
      );
      expect(withoutContext.find((tool) => tool.id === 'tool.browser-proof')?.status).toBe(
        'requires_thread'
      );
      expect(withProject.find((tool) => tool.id === 'tool.codex-cli')?.status).toBe('available');
      expect(withProject.find((tool) => tool.id === 'tool.browser-proof')?.status).toBe(
        'requires_thread'
      );

      const disabled = setThreadToolEnabled(db, {
        threadId,
        toolId: 'tool.browser-proof',
        enabled: false,
      });
      expect(disabled.enabled).toBe(false);
      expect(() => assertThreadToolEnabled(db, threadId, 'tool.browser-proof')).toThrow(
        'Tool is disabled for this thread: tool.browser-proof'
      );

      const withThread = listToolCapabilities(db, { projectId, threadId });
      expect(withThread.map((tool) => tool.id)).toEqual([
        'tool.claude-code',
        'tool.codex-cli',
        'tool.generic-cli',
        'tool.browser-proof',
        'tool.review-merge',
      ]);
      expect(withThread.find((tool) => tool.id === 'tool.browser-proof')).toMatchObject({
        enabled: false,
        status: 'available',
      });
      expect(withThread.find((tool) => tool.id === 'tool.review-merge')?.permissions).toContain(
        'merge_approval'
      );
      expect(toolIdForAgentProvider('codex')).toBe('tool.codex-cli');
      expect(toolIdForAgentProvider(undefined)).toBe('tool.claude-code');
    });

    it('records a denied permission receipt when disabled tool use is blocked', () => {
      setThreadToolEnabled(db, {
        threadId,
        toolId: 'tool.codex-cli',
        enabled: false,
      });

      expect(() =>
        assertThreadToolEnabledWithReceipt(db, {
          threadId,
          toolId: 'tool.codex-cli',
          command: 'agent:launch codex',
        })
      ).toThrow('Tool is disabled for this thread: tool.codex-cli');

      const receipts = listPermissionReceipts(db, threadId);
      const events = replayEvents(db, threadId);

      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({
        command: 'agent:launch codex',
        riskCategory: 'tool_disabled',
        decision: 'denied',
        userNotes: 'Blocked by thread tool policy: tool.codex-cli',
      });
      expect(events.map((event) => event.type)).toEqual(['approval.denied']);
    });
  });

  describe('Agent Mesh', () => {
    let projectId: ProjectId;
    let threadId: ThreadId;

    beforeEach(() => {
      projectId = openProject(db, {
        path: '/tmp',
        name: 'Agent Mesh Project',
      }).id;
      threadId = createThread(db, projectId, 'Agent Mesh Thread', 'Coordinate peer agents').id;
    });

    it('registers governed peer agents with durable mailboxes', () => {
      const terminalSessionId = 'term_review' as TerminalSessionId;
      recordTerminalStarted(db, threadId, {
        sessionId: terminalSessionId,
        runtime: 'pty',
        workingDirectory: '/tmp',
        command: 'codex review',
        pid: 1001,
      });

      const agent = registerMeshAgent(db, {
        threadId,
        displayName: 'Codex Reviewer',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
        status: 'running',
        terminalSessionId,
        worktreeId: 'wt_review',
        runId: 'run_review',
      });

      expect(agent.mailboxId).toMatch(/^mailbox_/);
      expect(listMeshAgents(db, threadId)).toMatchObject([
        {
          id: agent.id,
          displayName: 'Codex Reviewer',
          status: 'running',
          terminalSessionId: 'term_review',
          worktreeId: 'wt_review',
          runId: 'run_review',
        },
      ]);
    });

    it('routes redacted peer messages through the target mailbox and records handling', () => {
      const implementer = registerMeshAgent(db, {
        threadId,
        displayName: 'Claude Implementer',
        kind: 'visible_cli',
        toolName: 'claude_code',
        role: 'implementer',
      });
      const reviewer = registerMeshAgent(db, {
        threadId,
        displayName: 'Codex Reviewer',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
      });
      const token = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';

      const message = sendPeerMessage(db, {
        threadId,
        fromAgentId: implementer.id,
        toAgentId: reviewer.id,
        kind: 'verification_request',
        content: `Please verify this patch with token ${token}`,
        evidenceRefs: ['terminal:term_review:7', 'diff:wt_review'],
      });

      expect(message.content).toContain('[REDACTED]');
      expect(message.content).not.toContain(token);
      expect(message.evidenceRefs).toEqual(['terminal:term_review:7', 'diff:wt_review']);
      expect(listThreadPeerMessages(db, threadId)).toMatchObject([
        {
          id: message.id,
          fromDisplayName: 'Claude Implementer',
          fromAgentKind: 'visible_cli',
          toDisplayName: 'Codex Reviewer',
          toAgentKind: 'reviewer',
          kind: 'verification_request',
          status: 'unhandled',
          requiresHumanApproval: false,
          evidenceRefs: ['terminal:term_review:7', 'diff:wt_review'],
        },
      ]);
      expect(pullPeerMessages(db, reviewer.id)).toEqual([message]);
      expect(pullPeerMessages(db, implementer.id)).toEqual([]);

      const handled = markPeerMessageHandled(db, message.id);
      expect(handled.status).toBe('handled');
      expect(handled.handledAt).toBeInstanceOf(Date);
      expect(pullPeerMessages(db, reviewer.id)).toEqual([]);
      expect(pullPeerMessages(db, reviewer.id, { includeHandled: true })[0]).toMatchObject({
        id: message.id,
        status: 'handled',
      });
    });

    it('tracks peer loop metrics and flags risky exchanges for human approval', () => {
      const implementer = registerMeshAgent(db, {
        threadId,
        displayName: 'Claude Implementer',
        kind: 'visible_cli',
        toolName: 'claude_code',
        role: 'implementer',
      });
      const reviewer = registerMeshAgent(db, {
        threadId,
        displayName: 'Codex Reviewer',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
      });

      const messages = Array.from({ length: 12 }, (_, index) =>
        sendPeerMessage(db, {
          threadId,
          fromAgentId: index % 2 === 0 ? implementer.id : reviewer.id,
          toAgentId: index % 2 === 0 ? reviewer.id : implementer.id,
          kind: 'question',
          content: `Loop check ${index + 1}`,
        })
      );
      const [metric] = listMeshLoopMetrics(db, threadId);

      expect(metric).toMatchObject({
        messageCount: 12,
        repeatedHashCount: 0,
        status: 'hard_stopped',
      });
      expect(messages[3]?.requiresHumanApproval).toBe(false);
      expect(messages[7]?.requiresHumanApproval).toBe(true);
      expect(messages[11]?.requiresHumanApproval).toBe(true);
    });

    it('warns on repeated peer message content before the exchange depth limit', () => {
      const implementer = registerMeshAgent(db, {
        threadId,
        displayName: 'Claude Implementer',
        kind: 'visible_cli',
        toolName: 'claude_code',
        role: 'implementer',
      });
      const reviewer = registerMeshAgent(db, {
        threadId,
        displayName: 'Codex Reviewer',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
      });

      for (let index = 0; index < 3; index += 1) {
        sendPeerMessage(db, {
          threadId,
          fromAgentId: implementer.id,
          toAgentId: reviewer.id,
          kind: 'question',
          content: 'Please verify this same claim again.',
          evidenceRefs: ['terminal:term_review:7'],
        });
      }

      expect(listMeshLoopMetrics(db, threadId)[0]).toMatchObject({
        messageCount: 3,
        repeatedHashCount: 2,
        status: 'warning',
      });
    });

    it('rejects peer messages that cross thread boundaries', () => {
      const otherThread = createThread(db, projectId, 'Other Mesh Thread', 'Separate lane');
      const first = registerMeshAgent(db, {
        threadId,
        displayName: 'Claude Implementer',
        kind: 'visible_cli',
        toolName: 'claude_code',
        role: 'implementer',
      });
      const second = registerMeshAgent(db, {
        threadId: otherThread.id,
        displayName: 'Codex Reviewer',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
      });

      expect(() =>
        sendPeerMessage(db, {
          threadId,
          fromAgentId: first.id,
          toAgentId: second.id,
          kind: 'question',
          content: 'Can you inspect this?',
        })
      ).toThrow('Peer messages must stay inside one Doorway thread.');
    });

    it('routes terminal-visible doorway-action send_message blocks through Agent Mesh', () => {
      const senderSessionId = 'term_sender' as TerminalSessionId;
      recordTerminalStarted(db, threadId, {
        sessionId: senderSessionId,
        runtime: 'pty',
        workingDirectory: '/tmp',
        command: 'claude code',
        pid: 1002,
      });
      const sender = registerMeshAgent(db, {
        threadId,
        displayName: 'Claude Implementer',
        kind: 'visible_cli',
        toolName: 'claude',
        role: 'implementer',
        status: 'running',
        terminalSessionId: senderSessionId,
      });
      const reviewer = registerMeshAgent(db, {
        threadId,
        displayName: 'Codex Reviewer',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
      });
      const output = [
        'Need a peer check.',
        '```doorway-action',
        'type: send_message',
        'to: codex',
        'kind: verification_request',
        'message: "Can you verify the terminal action parser?"',
        '```',
      ].join('\n');
      const chunk = appendTerminalChunk(db, threadId, {
        sessionId: senderSessionId,
        text: output,
      });

      const routed = routeTerminalActionBlocks(db, {
        threadId,
        terminalSessionId: senderSessionId,
        chunkSequence: chunk.sequence,
        text: output,
      });
      const messages = pullPeerMessages(db, reviewer.id);
      const actionRow = db.prepare('SELECT * FROM terminal_action_blocks').get() as {
        readonly agent_id: string;
        readonly validation_status: string;
        readonly routed_message_id: string;
        readonly parsed_json: string;
      };

      expect(parseDoorwayActionBlocks(output)).toHaveLength(1);
      expect(routed).toMatchObject([{ status: 'routed' }]);
      expect(messages).toMatchObject([
        {
          fromAgentId: sender.id,
          toAgentId: reviewer.id,
          kind: 'verification_request',
          content: 'Can you verify the terminal action parser?',
          evidenceRefs: [`terminal:${senderSessionId}:${chunk.sequence}`],
        },
      ]);
      expect(actionRow).toMatchObject({
        agent_id: sender.id,
        validation_status: 'routed',
        routed_message_id: messages[0]?.id,
      });
      expect(JSON.parse(actionRow.parsed_json)).toMatchObject({
        type: 'send_message',
        to: 'codex',
      });
    });

    it('pulls unread peer messages into terminal-visible Doorway response text', () => {
      const receiverSessionId = 'term_receiver' as TerminalSessionId;
      recordTerminalStarted(db, threadId, {
        sessionId: receiverSessionId,
        runtime: 'pty',
        workingDirectory: '/tmp',
        command: 'claude code',
        pid: 1004,
      });
      const reviewer = registerMeshAgent(db, {
        threadId,
        displayName: 'Codex Reviewer',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
      });
      const implementer = registerMeshAgent(db, {
        threadId,
        displayName: 'Claude Implementer',
        kind: 'visible_cli',
        toolName: 'claude',
        role: 'implementer',
        status: 'running',
        terminalSessionId: receiverSessionId,
      });
      const message = sendPeerMessage(db, {
        threadId,
        fromAgentId: reviewer.id,
        toAgentId: implementer.id,
        kind: 'verification_result',
        content: 'Parser route is correct.',
        evidenceRefs: ['terminal:term_review:4'],
      });
      const output = ['```doorway-action', 'type: pull_messages', 'from: codex', '```'].join('\n');

      const routed = routeTerminalActionBlocks(db, {
        threadId,
        terminalSessionId: receiverSessionId,
        chunkSequence: 8,
        text: output,
      });
      const actionRow = db.prepare('SELECT * FROM terminal_action_blocks').get() as {
        readonly validation_status: string;
        readonly routed_message_id: string | null;
      };

      expect(routed).toMatchObject([
        {
          status: 'responded',
          handledMessageIds: [message.id],
          terminalResponseText:
            'Doorway peer messages for Claude Implementer:\n\n1. From Codex Reviewer [verification_result]\nParser route is correct.\nEvidence: terminal:term_review:4',
        },
      ]);
      expect(actionRow).toMatchObject({
        validation_status: 'responded',
        routed_message_id: null,
      });
      expect(pullPeerMessages(db, implementer.id)).toEqual([]);
      expect(pullPeerMessages(db, implementer.id, { includeHandled: true })[0]).toMatchObject({
        id: message.id,
        status: 'handled',
      });
    });

    it('records rejected terminal action blocks without routing unsafe messages', () => {
      const senderSessionId = 'term_rejected' as TerminalSessionId;
      recordTerminalStarted(db, threadId, {
        sessionId: senderSessionId,
        runtime: 'pty',
        workingDirectory: '/tmp',
        command: 'claude code',
        pid: 1003,
      });
      registerMeshAgent(db, {
        threadId,
        displayName: 'Claude Implementer',
        kind: 'visible_cli',
        toolName: 'claude',
        role: 'implementer',
        terminalSessionId: senderSessionId,
      });
      const output = [
        '```doorway-action',
        'type: compact_context',
        'to: codex',
        'kind: question',
        'message: "unsupported action"',
        '```',
      ].join('\n');

      const routed = routeTerminalActionBlocks(db, {
        threadId,
        terminalSessionId: senderSessionId,
        chunkSequence: 7,
        text: output,
      });
      const actionRow = db.prepare('SELECT * FROM terminal_action_blocks').get() as {
        readonly validation_status: string;
        readonly validation_error: string;
        readonly routed_message_id: string | null;
      };

      expect(routed).toMatchObject([
        {
          status: 'rejected',
          error: 'Unsupported doorway-action type.',
        },
      ]);
      expect(actionRow).toMatchObject({
        validation_status: 'rejected',
        validation_error: 'Unsupported doorway-action type.',
        routed_message_id: null,
      });
      expect(listThreadPeerMessages(db, threadId)).toEqual([]);
    });
  });
});

describe('FaultRecoveryService', () => {
  it('does not retry a normal exit 0', () => {
    const recovery = createFaultRecoveryService();
    const fault = recovery.detectFaultFromExit(0);
    const action = recovery.determineRecoveryAction(fault, {
      sessionId: generateId('term') as TerminalSessionId,
      runId: generateId('run') as AgentRunId,
      threadId: generateId('thread') as ThreadId,
      provider: 'test-agent',
      startedAt: new Date(),
      lastHeartbeat: new Date(),
      status: 'completed',
      exitCode: 0,
    });

    expect(fault).toMatchObject({
      faultType: 'normal_exit',
      severity: 'permanent',
      exitCode: 0,
    });
    expect(action).toMatchObject({
      type: 'halt',
      reason: 'Process exited successfully; no recovery needed',
    });
  });
});

describe('ID Generation', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId('thread');
    const id2 = generateId('thread');

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^thread_/);
  });

  it('should generate IDs with correct prefix', () => {
    expect(generateId('msg')).toMatch(/^msg_/);
    expect(generateId('run')).toMatch(/^run_/);
    expect(generateId('wt')).toMatch(/^wt_/);
    expect(generateId('evt')).toMatch(/^evt_/);
  });

  it('should format dates to ISO string', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const iso = toISOString(date);

    expect(iso).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should parse ISO date strings', () => {
    const date = parseDate('2024-01-15T10:30:00.000Z');

    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(15);
  });
});
