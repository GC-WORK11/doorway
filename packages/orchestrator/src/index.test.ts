/**
 * @doorway/orchestrator Tests
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  generateId,
  listMeshAgents,
  listTerminalProjections,
  listThreadPeerMessages,
  registerMeshAgent,
  sendPeerMessage,
} from '@doorway/core';
import {
  Orchestrator,
  type AgentEvent,
  type AgentTerminalRuntime,
  type IAgentAdapter,
  type LaunchContext,
  serializeShellCommand,
} from './index.js';
import { ContextCompiler, relevantFileContentForPrompt } from './compiler.js';
import {
  handoffLocationLines,
  lastTerminalOutput,
  scrubHandoffSecrets,
  terminalOutputForSummary,
  type HandoffPacket,
} from './handoff-service.js';
import { ProjectMemoryLoader } from './memory.js';
import type Database from 'better-sqlite3';
import { BrainService } from './brain/brain-service.js';
import type { DoorwayProviderDriver, ProviderConfig, VaultProvider } from './brain/types.js';
import type { ThreadId } from '@doorway/protocol';

describe('Orchestrator', () => {
  let dataPath: string;
  let db: Database.Database;
  let orchestrator: Orchestrator;
  let projectId: string;

  beforeEach(async () => {
    dataPath = await mkdtemp(join(tmpdir(), 'doorway-orchestrator-'));
    db = createDatabase({ dataPath });
    projectId = generateId('project');
    db.prepare(
      `INSERT INTO projects (id, path, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(projectId, dataPath, 'Test Project', new Date().toISOString(), new Date().toISOString());
    db.prepare(
      `
      INSERT INTO threads (id, project_id, title, status, goal, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?), (?, ?, ?, 'active', ?, ?, ?)
    `
    ).run(
      'thread_1',
      projectId,
      'Thread 1',
      'Task 1',
      new Date().toISOString(),
      new Date().toISOString(),
      'thread_2',
      projectId,
      'Thread 2',
      'Task 2',
      new Date().toISOString(),
      new Date().toISOString()
    );

    orchestrator = new Orchestrator(db, createVault(), {
      cwd: dataPath,
      defaultProvider: 'claude',
      terminalManager: createTerminalRuntime(),
    });
  });

  afterEach(async () => {
    for (const run of orchestrator.listRuns()) {
      orchestrator.terminateRun(run.id);
    }
    db.close();
    await rm(dataPath, { recursive: true, force: true });
  });

  it('creates orchestrator services with config', () => {
    expect(orchestrator.brain).toBeDefined();
    expect(orchestrator.taskGraph).toBeDefined();
  });

  it('registers adapters', () => {
    const adapter = createTestAdapter('test-provider');
    orchestrator.registerAdapter(adapter);

    const retrieved = orchestrator.getAdapter('test-provider');
    expect(retrieved).toBe(adapter);
  });

  it('returns undefined for unregistered provider', () => {
    const retrieved = orchestrator.getAdapter('unregistered');
    expect(retrieved).toBeUndefined();
  });

  it('executes a task with a registered adapter', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Test prompt', {
      provider: 'test-agent',
    });

    expect(runId).toMatch(/^run_/);
    expect(orchestrator.getRun(runId)?.status).toBe('running');
  });

  it('persists terminal evidence while executing an adapter run', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    await orchestrator.executeTask('thread_1', projectId, 'Test prompt', {
      provider: 'test-agent',
    });

    const session = db.prepare('SELECT status, command FROM terminal_sessions LIMIT 1').get() as {
      status: string;
      command: string;
    };
    const chunks = db.prepare('SELECT text FROM terminal_chunks').all() as { text: string }[];
    const events = db.prepare('SELECT type FROM events ORDER BY sequence').all() as {
      type: string;
    }[];

    expect(session.status).toBe('running');
    expect(session.command).toContain('agent');
    expect(chunks[0]?.text).toContain('agent');
    expect(events.map((event) => event.type)).toContain('terminal.started');
    expect(events.map((event) => event.type)).toContain('terminal.output');
  });

  it('claims a persisted task graph node when launching a terminal run', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Execute graph runtime', {
      provider: 'test-agent',
    });

    const node = db
      .prepare(
        `
        SELECT task_nodes.status, task_nodes.assigned_run_id, tasks.status AS task_status
        FROM task_nodes
        INNER JOIN tasks ON tasks.id = task_nodes.task_id
        WHERE task_nodes.assigned_run_id = ?
        LIMIT 1
      `
      )
      .get(runId) as { status: string; assigned_run_id: string; task_status: string };
    const graphEvent = db
      .prepare(
        "SELECT payload FROM events WHERE type = 'task_graph.updated' ORDER BY sequence DESC LIMIT 1"
      )
      .get() as { payload: string };

    expect(node).toMatchObject({
      status: 'running',
      assigned_run_id: runId,
      task_status: 'running',
    });
    expect(JSON.parse(graphEvent.payload)).toMatchObject({
      newStatus: 'running',
      assignedRunId: runId,
      graphStatus: 'running',
    });
  });

  it('registers launched terminal lanes as Agent Mesh agents', async () => {
    const worktreePath = join(dataPath, 'mesh-worktree');
    orchestrator = new Orchestrator(db, createVault(), {
      cwd: dataPath,
      defaultProvider: 'claude',
      terminalManager: createTerminalRuntime(),
      worktreeManager: {
        async createWorktree() {
          return {
            id: 'wt_mesh',
            path: worktreePath,
            branch: 'doorway/task/mesh',
          };
        },
      },
    });
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Register mesh lane', {
      provider: 'test-agent',
      useWorktree: true,
      projectPath: dataPath,
    });
    const run = orchestrator.getRun(runId);
    const agents = listMeshAgents(db, 'thread_1');

    expect(run?.error).toBeUndefined();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      displayName: 'Test test-agent',
      kind: 'visible_cli',
      toolName: 'test-agent',
      role: 'implementer',
      status: 'running',
      terminalSessionId: run?.sessionId,
      worktreeId: 'wt_mesh',
      runId,
    });
    expect(agents[0]?.mailboxId).toMatch(/^mailbox_/);
    expect(run?.meshAgentId).toBe(agents[0]?.id);
    expect(run?.mailboxId).toBe(agents[0]?.mailboxId);
  });

  it('registers each Best-of-N run with a distinct mesh mailbox', async () => {
    seedBrainBinding(db, 'planner');
    orchestrator.brain.registerDriver(createBrainDriver(() => '{"nodes":[]}'));
    orchestrator.registerAdapter(createTestAdapter('claude'));
    orchestrator.registerAdapter(createTestAdapter('codex'));

    const runIds = await orchestrator.executeBestOfN(
      'thread_1',
      projectId,
      'Compare two lanes',
      ['claude', 'codex'],
      undefined,
      { projectPath: dataPath, useWorktree: false }
    );
    const agents = listMeshAgents(db, 'thread_1');

    expect(runIds).toHaveLength(2);
    expect(agents.map((agent) => agent.toolName).sort()).toEqual(['claude', 'codex']);
    expect(new Set(agents.map((agent) => agent.mailboxId)).size).toBe(2);
    expect(agents.map((agent) => agent.runId).sort()).toEqual([...runIds].sort());
  });

  it('routes terminal doorway-action output through the registered launch mailbox', async () => {
    const actionOutput = [
      '```doorway-action',
      'type: send_message',
      'to: codex',
      'kind: verification_request',
      'message: "Please verify the orchestrator action route."',
      '```',
    ].join('\n');
    orchestrator = new Orchestrator(db, createVault(), {
      cwd: dataPath,
      defaultProvider: 'claude',
      terminalManager: createTerminalRuntime(actionOutput),
    });
    registerMeshAgent(db, {
      threadId: 'thread_1',
      displayName: 'Codex Reviewer',
      kind: 'reviewer',
      toolName: 'codex',
      role: 'reviewer',
      status: 'running',
    });
    orchestrator.registerAdapter(createTestAdapter('claude'));

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Route action block', {
      provider: 'claude',
    });
    const messages = listThreadPeerMessages(db, 'thread_1');
    const actionRows = db.prepare('SELECT validation_status FROM terminal_action_blocks').all() as {
      readonly validation_status: string;
    }[];

    expect(orchestrator.getRun(runId)?.meshAgentId).toBeDefined();
    expect(messages).toMatchObject([
      {
        fromDisplayName: 'Test claude',
        toDisplayName: 'Codex Reviewer',
        kind: 'verification_request',
        content: 'Please verify the orchestrator action route.',
        evidenceRefs: [`terminal:${orchestrator.getRun(runId)?.sessionId}:0`],
      },
    ]);
    expect(actionRows).toEqual([{ validation_status: 'routed' }]);
  });

  it('injects pulled peer messages back into the managed terminal', async () => {
    const reviewer = registerMeshAgent(db, {
      threadId: 'thread_1',
      displayName: 'Codex Reviewer',
      kind: 'reviewer',
      toolName: 'codex',
      role: 'reviewer',
      status: 'running',
    });
    orchestrator = new Orchestrator(db, createVault(), {
      cwd: dataPath,
      defaultProvider: 'claude',
      terminalManager: createTerminalRuntime(({ sessionId, sendCount }) => {
        if (sendCount > 0) {
          return '';
        }
        const sourceAgent = listMeshAgents(db, 'thread_1').find(
          (agent) => agent.terminalSessionId === sessionId
        );
        if (!sourceAgent) {
          return '';
        }
        sendPeerMessage(db, {
          threadId: 'thread_1',
          fromAgentId: reviewer.id,
          toAgentId: sourceAgent.id,
          kind: 'verification_result',
          content: 'The peer response reached the terminal.',
          evidenceRefs: ['terminal:review:12'],
        });
        return ['```doorway-action', 'type: wait_for_response', 'from: codex', '```'].join('\n');
      }),
    });
    orchestrator.registerAdapter(createTestAdapter('claude'));

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Pull peer response', {
      provider: 'claude',
    });
    const inputs = db
      .prepare('SELECT text, source FROM terminal_inputs ORDER BY sequence ASC')
      .all() as { readonly text: string; readonly source: string }[];
    const actionRows = db.prepare('SELECT validation_status FROM terminal_action_blocks').all() as {
      readonly validation_status: string;
    }[];

    expect(inputs).toMatchObject([
      {
        source: 'doorway',
        text: expect.stringContaining('The peer response reached the terminal.'),
      },
    ]);
    expect(inputs[0]?.text).toContain('Doorway peer messages for Test claude');
    expect(orchestrator.getRun(runId)?.meshAgentId).toBeDefined();
    expect(actionRows).toEqual([{ validation_status: 'responded' }]);
  });

  it('loads Brain provider headers from the persisted provider profile schema', async () => {
    seedBrainBinding(db, 'planner');

    let providerConfig: ProviderConfig | undefined;
    const brain = new BrainService(db, createVault());
    brain.registerDriver(
      createBrainDriver((config) => {
        providerConfig = config;
        return '{"nodes":[]}';
      })
    );

    await expect(
      brain.executeRole('planner', {
        messages: [{ role: 'user', content: 'Plan from configured model.' }],
        responseFormat: 'json',
      })
    ).resolves.toBe('{"nodes":[]}');
    expect(providerConfig).toMatchObject({
      id: 'provider_test',
      baseURL: 'https://brain.test',
      headers: { 'X-Doorway-Test': 'planner' },
    });
  });

  it('serializes adapter commands for shell PTY launch without losing prompt boundaries', () => {
    expect(
      serializeShellCommand('claude', ['--model', 'claude-sonnet-4-6', "Fix auth && don't merge"])
    ).toBe("claude --model claude-sonnet-4-6 'Fix auth && don'\\''t merge'");
  });

  it('persists provider and worktree metadata in handoff packets', async () => {
    const taskId = generateId('task');
    const worktreeId = generateId('wt');
    const runId = generateId('run');
    const terminalSessionId = generateId('term');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
       VALUES (?, ?, ?, 'sequential', 'planned', ?)`
    ).run(taskId, projectId, 'Persist handoff metadata', now);
    db.prepare(
      `INSERT INTO worktrees (id, project_id, task_id, path, branch, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`
    ).run(worktreeId, projectId, taskId, dataPath, 'doorway/task/backend', now);
    db.prepare(
      `INSERT INTO terminal_sessions (id, runtime, status, working_directory, created_at)
       VALUES (?, 'pty', 'created', ?, ?)`
    ).run(terminalSessionId, dataPath, now);
    db.prepare(
      `INSERT INTO agent_runs (
        id, thread_id, task_id, role, adapter_id, worktree_id, terminal_session_id, status, created_at
      )
      VALUES (?, 'thread_1', ?, 'backend', 'codex', ?, ?, 'done', ?)`
    ).run(runId, taskId, worktreeId, terminalSessionId, now);

    await orchestrator.handoff.createPacket({
      threadId: 'thread_1',
      runId,
      goal: 'Persist handoff metadata',
      events: [
        { type: 'stdout', data: 'tests started', timestamp: new Date(now) },
        { type: 'stderr', data: 'lint failed', timestamp: new Date(now) },
      ],
      changedFiles: ['apps/desktop/src/main/handlers.ts'],
      providerType: 'codex',
      worktreePath: dataPath,
      branch: 'doorway/task/backend',
    });

    const row = db
      .prepare(
        `SELECT target_provider, worktree_path, branch, changed_files, diff_summary
         FROM handoff_capsules
         WHERE source_run_id = ?`
      )
      .get(runId) as {
      target_provider: string;
      worktree_path: string;
      branch: string;
      changed_files: string;
      diff_summary: string;
    };

    expect(row.target_provider).toBe('codex');
    expect(row.worktree_path).toBe(dataPath);
    expect(row.branch).toBe('doorway/task/backend');
    expect(JSON.parse(row.changed_files)).toEqual(['apps/desktop/src/main/handlers.ts']);
    expect(row.diff_summary).toContain('[stderr] lint failed');
  });

  it('scrubs secrets from persisted and formatted handoff terminal text', async () => {
    const taskId = generateId('task');
    const worktreeId = generateId('wt');
    const terminalSessionId = generateId('term');
    const runId = generateId('run');
    const token = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
    const passwordValue = 'doorway-password-value';
    const secretValue = 'doorway-secret-value';
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
       VALUES (?, ?, ?, 'sequential', 'planned', ?)`
    ).run(taskId, projectId, 'Scrub handoff output', now);
    db.prepare(
      `INSERT INTO worktrees (id, project_id, task_id, path, branch, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`
    ).run(worktreeId, projectId, taskId, dataPath, 'doorway/task/secret-scrub', now);
    db.prepare(
      `INSERT INTO terminal_sessions (id, runtime, status, working_directory, created_at)
       VALUES (?, 'pty', 'created', ?, ?)`
    ).run(terminalSessionId, dataPath, now);
    db.prepare(
      `INSERT INTO agent_runs (
        id, thread_id, task_id, role, adapter_id, worktree_id, terminal_session_id, status, created_at
      )
      VALUES (?, 'thread_1', ?, 'backend', 'codex', ?, ?, 'done', ?)`
    ).run(runId, taskId, worktreeId, terminalSessionId, now);

    const packet = await orchestrator.handoff.createPacket({
      threadId: 'thread_1',
      runId,
      goal: 'Scrub handoff output',
      events: [
        {
          type: 'stdout',
          data: `provider token ${token}`,
          timestamp: new Date('2026-05-18T00:00:00.000Z'),
        },
        {
          type: 'stdout',
          data: `{"password": "${passwordValue}"}`,
          timestamp: new Date('2026-05-18T00:00:00.000Z'),
        },
        {
          type: 'stdout',
          data: `{"secret": "${secretValue}"}`,
          timestamp: new Date('2026-05-18T00:00:00.000Z'),
        },
      ],
      changedFiles: ['packages/orchestrator/src/handoff-service.ts'],
      providerType: 'codex',
    });
    const row = db
      .prepare(`SELECT diff_summary FROM handoff_capsules WHERE source_run_id = ?`)
      .get(runId) as { diff_summary: string };
    const formatted = orchestrator.handoff.formatForProvider(packet, 'codex');

    expect(packet.lastTerminalLines).toContain('[REDACTED]');
    expect(packet.lastTerminalLines).not.toContain(token);
    expect(packet.lastTerminalLines).not.toContain(passwordValue);
    expect(packet.lastTerminalLines).not.toContain(secretValue);
    expect(row.diff_summary).toContain('[REDACTED]');
    expect(row.diff_summary).not.toContain(token);
    expect(row.diff_summary).not.toContain(passwordValue);
    expect(row.diff_summary).not.toContain(secretValue);
    expect(formatted).toContain('[REDACTED]');
    expect(formatted).not.toContain(token);
    expect(formatted).not.toContain(passwordValue);
    expect(formatted).not.toContain(secretValue);
  });

  it('scrubs supported handoff secret patterns directly', () => {
    const input = [
      'sk-abcdefghijklmnopqrstuvwxyz1234567890',
      'AIza01234567890123456789012345678901234',
      'ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ',
      '{"password": "doorway-password-value"}',
      '{"secret": "doorway-secret-value"}',
    ].join('\n');
    const scrubbed = scrubHandoffSecrets(input);

    expect(scrubbed).toBe(
      [
        '[REDACTED]',
        '[REDACTED]',
        '[REDACTED]',
        '{"password": "[REDACTED]"}',
        '{"secret": "[REDACTED]"}',
      ].join('\n')
    );
    expect(JSON.parse(scrubbed.split('\n')[3] ?? '{}')).toEqual({ password: '[REDACTED]' });
    expect(JSON.parse(scrubbed.split('\n')[4] ?? '{}')).toEqual({ secret: '[REDACTED]' });
    expect(scrubbed).not.toContain('doorway-password-value');
    expect(scrubbed).not.toContain('doorway-secret-value');
  });

  it('scrubs browser action secrets before flight recorder persistence', async () => {
    const token = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
    const passwordValue = 'doorway-password-value';
    const secretValue = 'doorway-secret-value';

    const event = await orchestrator.recordEvent('thread_1', 'browser_action', {
      type: 'type',
      selector: 'input[name=password]',
      text: `entered ${token}`,
      password: passwordValue,
      nested: {
        secret: secretValue,
      },
      timestamp: new Date('2026-05-18T00:00:00.000Z'),
    });
    const row = db.prepare('SELECT payload FROM events WHERE id = ?').get(event.id) as {
      payload: string;
    };
    const payload = JSON.parse(row.payload) as {
      text: string;
      password: string;
      nested: { secret: string };
    };

    expect(event.data).toMatchObject({
      text: 'entered [REDACTED]',
      password: '[REDACTED]',
      nested: { secret: '[REDACTED]' },
    });
    expect(payload).toMatchObject({
      text: 'entered [REDACTED]',
      password: '[REDACTED]',
      nested: { secret: '[REDACTED]' },
    });
    expect(row.payload).not.toContain(token);
    expect(row.payload).not.toContain(passwordValue);
    expect(row.payload).not.toContain(secretValue);
  });

  it('includes run location metadata in provider handoff text', () => {
    const packet: HandoffPacket = {
      id: 'hnd_1',
      threadId: 'thread_1',
      runId: 'run_1',
      goal: 'Continue the task',
      summary: 'Run summary',
      changedFiles: ['apps/desktop/src/renderer/App.tsx'],
      lastTerminalLines: 'pnpm gate passed',
      riskFlags: [],
      nextAction: 'Continue implementation or verify changes.',
      providerType: 'codex',
      worktreePath: '/repo/.doorway-workspaces/task',
      branch: 'doorway/task/backend',
    };

    expect(handoffLocationLines(packet)).toBe(
      'WORKTREE: /repo/.doorway-workspaces/task\nBRANCH: doorway/task/backend'
    );
    for (const target of ['codex', 'reviewer', 'claude'] as const) {
      const formatted = orchestrator.handoff.formatForProvider(packet, target);

      expect(formatted).toContain('RUN: run_1');
      expect(formatted).toContain('WORKTREE: /repo/.doorway-workspaces/task');
      expect(formatted).toContain('BRANCH: doorway/task/backend');
    }
  });

  it('omits empty run location metadata from provider handoff text', () => {
    const packet: HandoffPacket = {
      id: 'hnd_1',
      threadId: 'thread_1',
      runId: 'run_1',
      goal: 'Continue the task',
      summary: 'Run summary',
      changedFiles: ['apps/desktop/src/renderer/App.tsx'],
      lastTerminalLines: 'pnpm gate passed',
      riskFlags: [],
      nextAction: 'Continue implementation or verify changes.',
      providerType: 'codex',
    };

    expect(handoffLocationLines(packet)).toBe('');
    for (const target of ['codex', 'reviewer', 'claude'] as const) {
      const formatted = orchestrator.handoff.formatForProvider(packet, target);

      expect(formatted).toContain('RUN: run_1');
      expect(formatted).not.toContain('WORKTREE:');
      expect(formatted).not.toContain('BRANCH:');
    }
  });

  it('builds bounded handoff terminal context from real output events', () => {
    const events = Array.from({ length: 82 }, (_, index): AgentEvent => {
      const line = index + 1;
      return {
        type: line === 82 ? 'stderr' : 'stdout',
        data: `line ${line}`,
        timestamp: new Date(`2026-05-18T00:00:${String(index % 60).padStart(2, '0')}.000Z`),
      };
    });
    const output = lastTerminalOutput([
      { type: 'started', data: 'agent started', timestamp: new Date('2026-05-18T00:00:00.000Z') },
      ...events,
    ]);

    const outputLines = output.split('\n');

    expect(outputLines).not.toContain('agent started');
    expect(outputLines).not.toContain('line 1');
    expect(outputLines[0]).toBe('line 3');
    expect(outputLines.at(-1)).toBe('[stderr] line 82');
  });

  it('bounds handoff summarizer output context by latest characters', () => {
    expect(terminalOutputForSummary(`${'a'.repeat(4000)}tail`)).toBe(`${'a'.repeat(3996)}tail`);
  });

  it('bounds relevant file content in compiled prompts', async () => {
    const fileContent = `${'a'.repeat(5000)}tail`;
    await writeFile(join(dataPath, 'large.ts'), fileContent);

    const prompt = await ContextCompiler.compile({
      projectId,
      goal: 'Read bounded context',
      cwd: dataPath,
      importantFiles: ['large.ts'],
    });

    expect(relevantFileContentForPrompt(fileContent)).toBe('a'.repeat(5000));
    expect(prompt).toContain(`--- large.ts ---\n${'a'.repeat(5000)}\n`);
    expect(prompt).not.toContain('tail');
  });

  it('loads project instruction files into compiled prompts in stable order', async () => {
    await writeFile(join(dataPath, 'README.md'), 'Project overview');
    await writeFile(join(dataPath, 'DOORWAY.md'), 'Doorway project instructions');
    await writeFile(join(dataPath, 'AGENTS.md'), 'Agent execution instructions');
    await writeFile(join(dataPath, '.cursorrules'), 'Cursor rules');

    const memoryLoader = new ProjectMemoryLoader(db);
    await memoryLoader.loadProjectMemory(projectId, dataPath);

    const previewMemory = await memoryLoader.previewProjectMemory(dataPath);
    expect(previewMemory.map((item) => [item.sourceFile, item.category])).toEqual([
      ['AGENTS.md', 'instruction'],
      ['DOORWAY.md', 'instruction'],
      ['.cursorrules', 'rule'],
      ['README.md', 'knowledge'],
    ]);

    const activeMemory = await memoryLoader.getActiveMemory(projectId);
    expect(activeMemory.map((item) => [item.sourceFile, item.category])).toEqual([
      ['AGENTS.md', 'instruction'],
      ['DOORWAY.md', 'instruction'],
      ['.cursorrules', 'rule'],
      ['README.md', 'knowledge'],
    ]);

    const prompt = await ContextCompiler.compile({
      projectId,
      goal: 'Respect project instructions',
      cwd: dataPath,
      memoryLoader,
    });

    expect(prompt.indexOf('[Source: AGENTS.md]')).toBeLessThan(
      prompt.indexOf('[Source: DOORWAY.md]')
    );
    expect(prompt.indexOf('[Source: DOORWAY.md]')).toBeLessThan(
      prompt.indexOf('[Source: .cursorrules]')
    );
    expect(prompt.indexOf('[Source: .cursorrules]')).toBeLessThan(
      prompt.indexOf('[Source: README.md]')
    );
    expect(prompt.indexOf('[Source: README.md]')).toBeLessThan(
      prompt.indexOf('GOAL: Respect project instructions')
    );
  });

  it('throws when no adapter is registered for the selected provider', async () => {
    await expect(
      orchestrator.executeTask('thread_1', projectId, 'Test prompt', { provider: 'missing' })
    ).rejects.toThrow('No adapter: missing');
  });

  it('tracks active runs', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    await orchestrator.executeTask('thread_1', projectId, 'Task 1', { provider: 'test-agent' });
    await orchestrator.executeTask('thread_2', projectId, 'Task 2', { provider: 'test-agent' });

    expect(orchestrator.listRuns()).toHaveLength(2);
  });

  it('gets an individual run', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Test prompt', {
      provider: 'test-agent',
    });
    const run = orchestrator.getRun(runId);

    expect(run?.id).toBe(runId);
    expect(run?.provider).toBe('test-agent');
  });

  it('persists run identity onto the launched terminal session', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Test prompt', {
      provider: 'test-agent',
      useWorktree: false,
    });
    const run = orchestrator.getRun(runId);
    const terminalRow = db
      .prepare('SELECT agent_run_id, command FROM terminal_sessions WHERE id = ?')
      .get(run?.sessionId) as { agent_run_id: string; command: string };
    const runRow = db
      .prepare('SELECT terminal_session_id FROM agent_runs WHERE id = ?')
      .get(runId) as {
      terminal_session_id: string;
    };
    const terminalProjection = listTerminalProjections(db, 'thread_1' as ThreadId)[0];

    expect(run?.sessionId).toBeDefined();
    expect(terminalRow).toMatchObject({
      agent_run_id: runId,
    });
    expect(terminalRow.command).toContain('agent');
    expect(runRow.terminal_session_id).toBe(run?.sessionId);
    expect(terminalProjection).toMatchObject({
      id: run?.sessionId,
      runId,
    });
  });

  it('keeps structured launch controls on the active run', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Test prompt', {
      provider: 'test-agent',
      launchOptions: {
        mode: '/debug',
        permissionProfile: 'worktree-only',
        worktreeStrategy: 'fork-current',
        ptyMode: 'external-pty',
        modelId: 'gpt-5.2',
      },
    });

    expect(orchestrator.getRun(runId)?.launchOptions).toEqual({
      mode: '/debug',
      permissionProfile: 'worktree-only',
      worktreeStrategy: 'fork-current',
      ptyMode: 'external-pty',
      modelId: 'gpt-5.2',
    });
  });

  it('creates worktrees from the provided project path instead of the process cwd', async () => {
    const projectPath = join(dataPath, 'actual-project');
    const worktreePath = join(dataPath, 'actual-worktree');
    await mkdir(projectPath);
    const seenProjectPaths: string[] = [];
    orchestrator = new Orchestrator(db, createVault(), {
      cwd: dataPath,
      defaultProvider: 'claude',
      terminalManager: createTerminalRuntime(),
      worktreeManager: {
        async createWorktree(options: { readonly projectPath?: string }) {
          seenProjectPaths.push(options.projectPath ?? '');
          return {
            id: 'wt_project_path',
            path: worktreePath,
            branch: 'doorway/task/implementer',
          };
        },
      },
    });
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Use project path', {
      provider: 'test-agent',
      useWorktree: true,
      projectPath,
    });

    expect(seenProjectPaths).toEqual([projectPath]);
    expect(orchestrator.getRun(runId)?.cwd).toBe(worktreePath);
  });

  it('runs from the project path when worktrees are disabled', async () => {
    const projectPath = join(dataPath, 'terminal-only-project');
    await mkdir(projectPath);
    orchestrator = new Orchestrator(db, createVault(), {
      cwd: dataPath,
      defaultProvider: 'claude',
      terminalManager: createTerminalRuntime(),
      worktreeManager: {
        async createWorktree() {
          throw new Error('worktree creation should not run');
        },
      },
    });
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Use terminal only', {
      provider: 'test-agent',
      useWorktree: false,
      projectPath,
    });

    expect(orchestrator.getRun(runId)?.cwd).toBe(projectPath);
  });

  it('terminates a run and removes it from active runs', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Test prompt', {
      provider: 'test-agent',
    });

    expect(orchestrator.listRuns()).toHaveLength(1);
    orchestrator.terminateRun(runId);
    expect(orchestrator.listRuns()).toHaveLength(0);
  });

  it('interrupts a run', async () => {
    const adapter = createTestAdapter('test-agent');
    orchestrator.registerAdapter(adapter);

    const runId = await orchestrator.executeTask('thread_1', projectId, 'Test prompt', {
      provider: 'test-agent',
    });
    orchestrator.interruptRun(runId);

    expect(orchestrator.getRun(runId)?.status).toBe('interrupted');
  });
});

describe('AgentEvent', () => {
  it('supports stdout events', () => {
    const event: AgentEvent = {
      type: 'stdout',
      data: 'Hello world',
      timestamp: new Date(),
    };

    expect(event.type).toBe('stdout');
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('supports error events', () => {
    const event: AgentEvent = {
      type: 'error',
      data: 'Something went wrong',
      timestamp: new Date(),
    };

    expect(event.type).toBe('error');
  });

  it('supports tool-use events', () => {
    const event: AgentEvent = {
      type: 'tool_use',
      data: 'bash: ls -la',
      timestamp: new Date(),
    };

    expect(event.type).toBe('tool_use');
  });
});

function createVault(): VaultProvider {
  return {
    get() {
      return '';
    },
  };
}

function createTestAdapter(provider: string): IAgentAdapter {
  return {
    provider,
    name: `Test ${provider}`,
    manifest: {
      id: provider,
      name: `Test ${provider}`,
      provider,
      runtimeMode: 'Visible CLI',
      executionSurface: 'visible_terminal',
      credentialMode: 'local_only',
    },

    async buildLaunch(context: LaunchContext) {
      return {
        command: 'agent',
        args: [context.prompt],
        cwd: context.cwd,
        env: context.env ?? {},
      };
    },

    onEvent(callback: (event: AgentEvent) => void): () => void {
      callback({
        type: 'stdout',
        data: 'Test agent output',
        timestamp: new Date(),
      });

      return () => {};
    },
  };
}

function createBrainDriver(complete: (config: ProviderConfig) => string): DoorwayProviderDriver {
  return {
    id: 'test-brain',
    displayName: 'Test Brain',
    protocol: 'test',
    async validateConfig() {
      return { valid: true };
    },
    async testConnection() {
      return { success: true };
    },
    async *streamText() {
      yield { type: 'done' };
    },
    async completeText(config) {
      return complete(config);
    },
  };
}

function seedBrainBinding(db: Database.Database, role: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO provider_profiles (
      id, kind, provider_id, display_name, base_url, auth_type, key_ref,
      default_headers_json, created_at, updated_at
    )
    VALUES ('provider_test', 'custom', 'test-brain', 'Test Brain', 'https://brain.test',
      'none', NULL, ?, ?, ?)
  `
  ).run(JSON.stringify({ 'X-Doorway-Test': role }), now, now);
  db.prepare(
    `
    INSERT INTO model_profiles (id, provider_profile_id, model_id, display_name)
    VALUES ('model_test', 'provider_test', 'model-test', 'Model Test')
  `
  ).run();
  db.prepare(
    `
    INSERT INTO brain_role_bindings (role, provider_profile_id, model_profile_id, enabled)
    VALUES (?, 'provider_test', 'model_test', 1)
  `
  ).run(role);
}

type TestTerminalOutput =
  | string
  | ((context: {
      readonly sessionId: string;
      readonly input: string;
      readonly sendCount: number;
    }) => string);

function createTerminalRuntime(
  output: TestTerminalOutput = 'agent command sent'
): AgentTerminalRuntime {
  const callbacks = new Set<(sessionId: string, data: string) => void>();
  let currentSessionId = '';
  let sendCount = 0;

  return {
    async launch() {
      currentSessionId = `session_${Date.now()}`;
      return {
        sessionId: currentSessionId,
        pid: 1,
        startedAt: new Date(),
      };
    },
    async launchCommand() {
      const sessionId = `session_${Date.now()}`;
      for (const callback of callbacks) {
        callback(sessionId, 'Terminal agent output');
      }
      return {
        sessionId,
        pid: 1,
        startedAt: new Date(),
      };
    },
    sendInput(sessionId, data) {
      const text =
        typeof output === 'function'
          ? output({ sessionId: String(sessionId), input: String(data), sendCount })
          : output;
      sendCount += 1;
      if (!text) {
        return;
      }
      for (const callback of callbacks) {
        callback(currentSessionId, text);
      }
      return;
    },
    stop() {
      return 0;
    },
    onData(callback) {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
    onExit() {
      return () => {};
    },
  };
}
