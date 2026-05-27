/* global window */
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(
  new URL('../../../packages/orchestrator/package.json', import.meta.url)
);
const { chromium } = require('playwright-core');

const baseUrl = process.env.DOORWAY_RENDERER_URL ?? 'http://127.0.0.1:5173';
const screenshotPath =
  process.env.DOORWAY_RENDERER_SCREENSHOT ?? '/tmp/doorway-renderer-worktrees-smoke.png';
const stateMode = process.env.DOORWAY_RENDERER_STATE ?? 'empty';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertDrawerLayout(page, drawer, label) {
  const drawerBox = await drawer.boundingBox();
  const sidebarBox = await page.locator('.main-sidebar').boundingBox();
  assert(drawerBox, `${label} drawer has no layout box`);
  assert(sidebarBox, 'main sidebar has no layout box');
  assert(drawerBox.x >= sidebarBox.x + sidebarBox.width, `${label} drawer overlaps sidebar`);
  assert(drawerBox.x + drawerBox.width <= 1440, `${label} drawer escapes viewport width`);
  assert(
    drawerBox.y >= 0 && drawerBox.y + drawerBox.height <= 1000,
    `${label} drawer escapes viewport height`
  );
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => {
    console.error(`pageerror=${error.message}`);
  });
  if (stateMode === 'populated') {
    await page.addInitScript(() => {
      const project = {
        id: 'project_doorway',
        name: 'Doorway',
        path: '/home/govinda/Doorway',
        mode: 'git',
        packageManager: 'pnpm',
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
      };
      const thread = {
        id: 'thread_review',
        projectId: project.id,
        title: 'Review merge path',
        status: 'active',
        messageCount: 3,
        runCount: 1,
        createdAt: new Date('2026-05-18T01:05:00.000Z'),
        updatedAt: new Date('2026-05-18T02:00:00.000Z'),
      };
      const worktree = {
        id: 'wt_review',
        path: '/repo/.doorway-workspaces/task-review',
        branch: 'refs/heads/doorway/task-review/backend',
        status: 'active',
        commit: 'abc123',
        isActive: true,
        isClean: true,
      };
      const diff = {
        files: [
          {
            path: 'apps/desktop/src/renderer/App.tsx',
            status: 'modified',
            additions: 12,
            deletions: 3,
            patch: `@@ -1,3 +1,4 @@
 import React from 'react';
+export const reviewed = true;
`,
          },
        ],
        totalAdditions: 12,
        totalDeletions: 3,
      };
      let threadEvents = [
        {
          id: 'evt_run_created',
          threadId: thread.id,
          type: 'agent_run.created',
          payload: {
            runId: 'run_seeded',
            taskId: 'task-review',
            role: 'implementer',
            adapterId: 'claude',
            worktreeId: worktree.id,
            launchOptions: {
              mode: '/build',
              permissionProfile: 'worktree-only',
              worktreeStrategy: 'selected-worktree',
              ptyMode: 'doorway-pty',
            },
          },
          timestamp: new Date('2026-05-18T01:10:00.000Z'),
          sequence: 1,
        },
        {
          id: 'evt_terminal_created',
          threadId: thread.id,
          type: 'terminal.created',
          payload: {
            sessionId: 'session_seeded',
            agentRunId: 'run_seeded',
            runtime: 'pty',
            command: 'pnpm test',
          },
          timestamp: new Date('2026-05-18T01:29:00.000Z'),
          sequence: 2,
        },
        {
          id: 'evt_run_completed',
          threadId: thread.id,
          type: 'agent_run.completed',
          payload: {
            runId: 'run_seeded',
            exitCode: 0,
          },
          timestamp: new Date('2026-05-18T01:35:00.000Z'),
          sequence: 3,
        },
        {
          id: 'evt_attention_approval',
          threadId: thread.id,
          type: 'agent.attention',
          payload: {
            sessionId: 'session_approval',
            state: 'needs_approval',
            source: 'terminal_output',
            reason: 'Terminal output requested permission or approval.',
            outputPreview: 'Permission required: allow command? [y/N]',
          },
          timestamp: new Date('2026-05-18T01:42:00.000Z'),
          sequence: 4,
        },
      ];
      const seededTerminalTranscript = [
        {
          sessionId: 'session_seeded',
          sequence: 1,
          timestamp: new Date('2026-05-18T01:30:00.000Z'),
          text: 'pnpm test\n',
          isStdout: true,
          isStderr: false,
        },
        {
          sessionId: 'session_seeded',
          sequence: 2,
          timestamp: new Date('2026-05-18T01:30:01.000Z'),
          text: 'tests passed\n',
          isStdout: true,
          isStderr: false,
        },
      ];
      const reviewTerminalTranscript = [
        {
          sessionId: 'session_review',
          sequence: 1,
          timestamp: new Date('2026-05-18T01:41:00.000Z'),
          text: 'pnpm review\n',
          isStdout: true,
          isStderr: false,
        },
        {
          sessionId: 'session_review',
          sequence: 2,
          timestamp: new Date('2026-05-18T01:41:01.000Z'),
          text: 'review ready\n',
          isStdout: true,
          isStderr: false,
        },
      ];
      const terminalTranscripts = {
        session_seeded: seededTerminalTranscript,
        session_review: reviewTerminalTranscript,
      };
      const terminalInputs = {
        session_seeded: [],
        session_review: [],
        session_approval: [],
      };
      let terminalSessions = [
        {
          id: 'session_seeded',
          runId: 'run_seeded',
          runtime: 'pty',
          status: 'running',
          workingDirectory: '/repo/.doorway-workspaces/task-review/backend',
          command: 'pnpm test',
          lastOutput: 'tests passed\n',
        },
        {
          id: 'session_review',
          runtime: 'pty',
          status: 'stopped',
          workingDirectory: '/repo/.doorway-workspaces/task-review/backend',
          command: 'pnpm review',
          lastOutput: 'review ready\n',
        },
        {
          id: 'session_approval',
          runtime: 'pty',
          status: 'running',
          workingDirectory: '/repo/.doorway-workspaces/task-review/backend',
          command: 'claude code',
          lastOutput: 'awaiting worker signal\n',
        },
      ];
      const smokeState = {
        agentLaunches: [],
        bestOfNLaunches: [],
        terminalWrites: [],
        terminalResizes: [],
        terminalStops: [],
        permissionDecisions: [],
      };
      let permissionReceipts = [];
      let compactCheckpoints = [];
      let automations = [
        {
          id: 'automation_smoke',
          projectId: project.id,
          name: 'Morning smoke review',
          description: 'Projected scheduled review state.',
          cronExpression: '0 9 * * *',
          command: 'pnpm smoke:review',
          enabled: true,
          lastRunAt: null,
          nextRunAt: null,
          createdAt: '2026-05-18T01:00:00.000Z',
          updatedAt: '2026-05-18T01:00:00.000Z',
        },
      ];
      let automationRuns = [];
      Object.defineProperty(window, '__doorwaySmoke', {
        configurable: true,
        value: smokeState,
      });
      const taskGraph = {
        id: 'task_graph_review',
        projectId: project.id,
        goal: 'Verify populated smoke orchestration lane',
        mode: 'parallel',
        status: 'planned',
        createdAt: new Date('2026-05-18T01:12:00.000Z'),
        nodes: [
          {
            id: 'node_implement',
            taskId: 'task_graph_review',
            role: 'implementer',
            status: 'completed',
            agentTarget: 'claude',
            worktreePolicy: 'isolated',
            acceptanceCriteria: 'Implementation evidence is visible in the cockpit.',
          },
          {
            id: 'node_review',
            taskId: 'task_graph_review',
            role: 'reviewer',
            status: 'pending',
            agentTarget: 'codex',
            worktreePolicy: 'isolated',
            acceptanceCriteria: 'Review evidence is visible before merge.',
          },
        ],
        edges: [
          {
            id: 'edge_review',
            taskId: 'task_graph_review',
            fromNodeId: 'node_implement',
            toNodeId: 'node_review',
          },
        ],
        evidence: [],
      };
      const handoffCapsule = {
        id: 'hnd_seeded',
        threadId: thread.id,
        sourceRunId: 'run_seeded',
        targetProvider: 'codex',
        summary: 'Seeded handoff for review smoke',
        latestIntent: 'Continue verification from populated smoke evidence.',
        runSummary: 'Implementation lane completed and produced reviewable evidence.',
        worktreePath: worktree.path,
        branch: worktree.branch,
        changedFiles: ['apps/desktop/src/renderer/App.tsx'],
        diffSummary: '1 file changed, +12 -3',
        testStatus: 'pass',
        openQuestions: ['Confirm merge policy before integration.'],
        nextPrompt: 'Continue from the populated smoke handoff.',
        createdAt: new Date('2026-05-18T01:50:00.000Z'),
        evidence: [],
      };
      const peerMessages = [
        {
          id: 'mesh_review_result',
          threadId: thread.id,
          fromAgentId: 'mesh_agent_reviewer',
          fromDisplayName: 'Codex Reviewer',
          fromAgentKind: 'reviewer',
          toAgentId: 'mesh_agent_implementer',
          toDisplayName: 'Claude Implementer',
          toAgentKind: 'visible_cli',
          kind: 'verification_result',
          content: 'Smoke review message persisted through Agent Mesh.',
          evidenceRefs: ['terminal:session_review:2'],
          status: 'unhandled',
          requiresHumanApproval: false,
          createdAt: new Date('2026-05-18T01:52:00.000Z'),
          evidence: [],
        },
      ];
      const bridge = {
        openProject: async () => project,
        listProjects: async () => [project],
        listProjectMemorySources: async () => [
          { sourceFile: 'AGENTS.md', category: 'instruction', contentLength: 1200 },
          { sourceFile: 'DOORWAY.md', category: 'instruction', contentLength: 900 },
        ],
        listProjectPlugins: async () => [
          {
            id: 'doorway.smoke-review',
            name: 'Smoke review plugin',
            version: '1.0.0',
            manifestPath: '/home/govinda/Doorway/.doorway/plugins/smoke-review/doorway.plugin.json',
            status: 'ready',
            capabilities: ['slash_command', 'context_provider'],
            filesystemRead: ['docs/**'],
            filesystemWrite: [],
            networkHosts: ['api.example.test'],
            entryCommand: 'pnpm smoke:review',
          },
        ],
        listAutomations: async () => automations,
        createAutomation: async (req) => {
          const automation = {
            id: 'automation_created',
            projectId: req.projectId,
            name: req.name,
            description: req.description ?? null,
            cronExpression: req.cronExpression,
            command: req.command,
            enabled: req.enabled !== false,
            lastRunAt: null,
            nextRunAt: null,
            createdAt: '2026-05-18T02:00:00.000Z',
            updatedAt: '2026-05-18T02:00:00.000Z',
          };
          automations = [automation, ...automations];
          return automation;
        },
        updateAutomation: async (req) => {
          automations = automations.map((automation) =>
            automation.id === req.id ? { ...automation, ...req } : automation
          );
          return automations.find((automation) => automation.id === req.id);
        },
        deleteAutomation: async (id) => {
          automations = automations.filter((automation) => automation.id !== id);
          return { deleted: true };
        },
        getAutomationRuns: async () => automationRuns,
        runAutomationNow: async (id) => {
          const run = {
            id: 'automation_run_smoke',
            automationId: id,
            threadId: thread.id,
            terminalSessionId: 'session_seeded',
            status: 'completed',
            startedAt: '2026-05-18T02:02:00.000Z',
            completedAt: '2026-05-18T02:02:01.000Z',
            exitCode: 0,
            output: 'smoke review ready',
            error: null,
          };
          automationRuns = [run];
          return run;
        },
        listProviderModels: async () => [],
        listToolCapabilities: async () => [
          {
            id: 'tool.git.merge',
            name: 'Git merge',
            surface: 'worktree',
            status: 'available',
            enabled: true,
            permissions: ['worktree_write'],
            evidence: ['diff'],
          },
          {
            id: 'tool.replay.verify',
            name: 'Replay verification',
            surface: 'evidence',
            status: 'available',
            enabled: true,
            permissions: ['replay_read'],
            evidence: ['thread_event'],
          },
        ],
        listToolLanes: async () => [
          {
            id: 'run_seeded',
            threadId: thread.id,
            taskId: 'task_seeded',
            runId: 'run_seeded',
            toolId: 'codex',
            role: 'reviewer',
            runRole: 'reviewer',
            status: 'running',
            terminalSessionId: 'session_seeded',
            latestActivity: 'tests passed',
            latestActivityAt: new Date('2026-05-18T01:30:00.000Z'),
          },
        ],
        setToolEnabled: async (req) => ({
          id: req.toolId,
          name: req.toolId,
          surface: 'agent',
          status: 'available',
          enabled: req.enabled,
          permissions: [],
          evidence: [],
        }),
        createThread: async () => thread,
        getThread: async () => thread,
        listThreads: async () => [thread],
        addMessage: async (_threadId, req) => ({
          id: 'msg_seeded',
          threadId: thread.id,
          role: req.role,
          content: req.content,
          createdAt: new Date('2026-05-18T02:01:00.000Z'),
        }),
        getMessages: async () => [
          {
            id: 'msg_user',
            threadId: thread.id,
            role: 'user',
            content: 'Review the selected worktree.',
            createdAt: new Date('2026-05-18T01:06:00.000Z'),
          },
        ],
        getThreadEvents: async () => threadEvents,
        getThreadOperationalMemory: async () => ({
          threadId: thread.id,
          observedCommands: [],
          repeatedCommands: [],
          storedPatternCount: 0,
          generatedAt: new Date('2026-05-18T02:00:00.000Z'),
        }),
        getThreadCompactCheckpoints: async () => compactCheckpoints,
        createCompactCheckpoint: async () => {
          const checkpoint = {
            id: 'compact_smoke',
            threadId: thread.id,
            originalGoal: 'Verify populated smoke orchestration lane',
            currentStatus: 'running',
            filesChanged: ['apps/desktop/src/renderer/App.tsx'],
            commandsRun: ['pnpm test'],
            tests: ['Unit tests · pass'],
            errors: [],
            importantLines: ['tests passed'],
            nextAction: 'Continue from the latest terminal state without opening a new lane.',
            nextPrompt: 'Continue from populated compact checkpoint evidence.',
            createdAt: new Date('2026-05-18T01:44:00.000Z'),
            evidence: [],
          };
          compactCheckpoints = [...compactCheckpoints, checkpoint];
          return checkpoint;
        },
        exportThreadReplay: async () => ({
          path: '/tmp/doorway-replay.jsonl',
          eventCount: 0,
          createdAt: '2026-05-18T02:00:00.000Z',
        }),
        verifyThreadReplay: async () => ({
          path: '/tmp/doorway-replay.jsonl',
          eventCount: 0,
          firstSequence: null,
          lastSequence: null,
          threadIds: [thread.id],
        }),
        getThreadProofs: async () => [
          {
            id: 'proof_tests',
            label: 'Unit tests',
            status: 'pass',
            command: 'pnpm test',
            summary: 'Test command exited with code 0.',
            startedAt: new Date('2026-05-18T01:30:00.000Z'),
            finishedAt: new Date('2026-05-18T01:31:00.000Z'),
            evidence: [],
          },
        ],
        getThreadPermissionReceipts: async () => permissionReceipts,
        decidePermission: async (req) => {
          smokeState.permissionDecisions.push(req);
          const receipt = {
            id: 'receipt_live_permission',
            threadId: thread.id,
            taskId: 'task-review',
            runId: req.runId,
            decision: req.decision,
            command: req.command,
            riskCategory: req.riskCategory,
            userNotes: req.userNotes,
            timestamp: new Date('2026-05-18T01:43:00.000Z'),
            evidence: [],
          };
          permissionReceipts = [receipt];
          threadEvents = [
            ...threadEvents,
            {
              id: 'evt_live_permission_decided',
              threadId: thread.id,
              type: req.decision === 'approved' ? 'approval.granted' : 'approval.denied',
              payload: {
                receiptId: receipt.id,
                taskId: receipt.taskId,
                command: receipt.command,
                riskCategory: receipt.riskCategory,
                ...(req.runId ? { runId: req.runId } : {}),
                ...(req.decision === 'approved'
                  ? { userResponse: req.userNotes }
                  : { reason: req.userNotes }),
              },
              timestamp: receipt.timestamp,
              sequence: 5,
            },
          ];
          return receipt;
        },
        getThreadMergeAssessments: async () => [
          {
            id: 'merge_ready',
            taskId: 'task-review',
            score: 'ready',
            reason: 'Tests and review evidence passed.',
            cleanApply: true,
            testsPassed: true,
            highRiskFiles: [],
            hasApproval: true,
            createdAt: new Date('2026-05-18T01:40:00.000Z'),
            evidence: [],
          },
        ],
        getThreadHandoffCapsules: async () => [handoffCapsule],
        getThreadPeerMessages: async () => peerMessages,
        getThreadTaskGraphs: async () => [taskGraph],
        updateTaskNodeStatus: async () => ({ id: 'graph_review', threadId: thread.id, nodes: [] }),
        createHandoff: async () => undefined,
        copyText: async () => ({ copied: true }),
        openPath: async () => ({ opened: true }),
        launchAgent: async (req) => {
          smokeState.agentLaunches.push(req);
          return {
            runId: 'run_seeded',
            sessionId: 'session_seeded',
            threadId: thread.id,
          };
        },
        launchBestOfN: async (req) => {
          smokeState.bestOfNLaunches.push(req);
          return { runIds: ['run_seeded', 'run_review'], threadId: thread.id };
        },
        interruptAgent: async () => undefined,
        terminateAgent: async () => undefined,
        createTerminal: async () => ({ sessionId: 'session_seeded' }),
        writeTerminal: async (sessionId, data, metadata = {}) => {
          smokeState.terminalWrites.push({ sessionId, data, metadata });
          const inputs = terminalInputs[sessionId] ?? [];
          terminalInputs[sessionId] = [
            ...inputs,
            {
              sessionId,
              sequence: inputs.length,
              timestamp: new Date('2026-05-18T01:44:00.000Z'),
              text: data,
              source: metadata.source ?? 'user',
            },
          ];
        },
        resizeTerminal: async (sessionId, cols, rows) => {
          smokeState.terminalResizes.push({ sessionId, cols, rows });
        },
        stopTerminal: async (sessionId) => {
          smokeState.terminalStops.push({ sessionId });
          terminalSessions = terminalSessions.map((session) =>
            session.id === sessionId ? { ...session, status: 'stopped' } : session
          );
          return { stopped: true };
        },
        getTerminalTranscript: async (sessionId) => terminalTranscripts[sessionId] ?? [],
        getTerminalInputs: async (sessionId) => terminalInputs[sessionId] ?? [],
        listTerminals: async () => terminalSessions,
        listWorktrees: async () => [worktree],
        getWorktreeDiff: async () => diff,
        forkWorktree: async () => worktree,
        archiveWorktree: async () => ({ archived: true, worktreeId: worktree.id }),
        archiveMergedWorktreeBranch: async () => ({ archived: true, worktreeId: worktree.id }),
        exportRollbackPatch: async () => ({
          path: '/tmp/rollback.patch',
          patchBytes: 120,
          worktreePath: worktree.path,
          branch: worktree.branch,
        }),
        evaluateMergeReadiness: async () => ({
          id: 'merge_ready',
          taskId: 'task-review',
          score: 'ready',
          reason: 'Tests and review evidence passed.',
          cleanApply: true,
          testsPassed: true,
          highRiskFiles: [],
          hasApproval: true,
          createdAt: new Date('2026-05-18T01:40:00.000Z'),
          evidence: [],
        }),
        approveWorktreeMerge: async () => ({
          id: 'receipt_merge',
          threadId: thread.id,
          taskId: 'task-review',
          decision: 'approved',
          command: 'merge',
          riskCategory: 'medium',
          createdAt: new Date('2026-05-18T01:45:00.000Z'),
        }),
        createIntegrationMerge: async () => ({
          planId: 'merge_plan',
          status: 'ready',
          summary: 'Integration branch created.',
        }),
        launchBrowser: async () => undefined,
        toggleBrowserControl: async () => undefined,
        exportBrowserEvidence: async () => ({
          path: '/tmp/browser-evidence',
          actionCount: 0,
          screenshotCount: 0,
          createdAt: '2026-05-18T02:00:00.000Z',
        }),
        onAgentEvent: () => () => undefined,
        onTerminalData: () => () => undefined,
        onDbChange: () => () => undefined,
        onBrowserStateChange: () => () => undefined,
        onBrowserAction: () => () => undefined,
      };

      Object.defineProperty(window, 'doorway', {
        configurable: true,
        value: bridge,
      });
    });
  }

  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');

  const initialText = await page.locator('body').innerText({ timeout: 5000 });
  assert(initialText.trim().length > 100, 'renderer body is blank');

  if (stateMode === 'populated') {
    await page
      .locator('.main-sidebar')
      .getByText('2 instructions')
      .waitFor({ state: 'visible', timeout: 5000 });
    const sidebarText = await page.locator('.main-sidebar').innerText();
    assert(sidebarText.includes('Doorway'), 'populated project did not render in sidebar');
    assert(sidebarText.includes('2 instructions'), 'instruction count did not render');
    assert(sidebarText.includes('1 worktree'), 'worktree count did not render');
    await page.getByRole('button', { name: /Review merge path/ }).click();
    await page.getByText('Doorway session activity').waitFor({ state: 'visible', timeout: 5000 });
    await page
      .getByText('Verify populated smoke orchestration lane')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    const canvasText = await page.locator('.thread-canvas').innerText();
    assert(canvasText.includes('Recorded'), 'recorded orchestration status did not render');
    assert(canvasText.includes('claude'), 'orchestration provider did not render');
    assert(canvasText.includes('task-review'), 'orchestration task id did not render');
    assert(canvasText.includes('wt_review'), 'orchestration worktree id did not render');
    assert(canvasText.includes('2 nodes'), 'task graph node count did not render');
    assert(canvasText.includes('Agent Mesh'), 'Agent Mesh capsule did not render');
    assert(
      canvasText.includes('Smoke review message persisted through Agent Mesh.'),
      'Agent Mesh peer message did not render'
    );
    const permissionDialog = page.getByRole('dialog', { name: 'Live permission request' });
    await permissionDialog.waitFor({ state: 'visible', timeout: 5000 });
    await permissionDialog
      .getByText('Permission required: allow command? [y/N]')
      .waitFor({ state: 'visible', timeout: 5000 });
    await permissionDialog.getByRole('button', { name: 'Deny' }).click();
    await page.waitForFunction(() => window.__doorwaySmoke?.permissionDecisions?.length > 0, null, {
      timeout: 5000,
    });
    const permissionIpc = await page.evaluate(() => window.__doorwaySmoke);
    assert(
      permissionIpc.permissionDecisions[0].decision === 'denied',
      'live permission decision did not persist denial'
    );
    assert(
      permissionIpc.terminalWrites.some(
        (entry) => entry.sessionId === 'session_approval' && (entry.data === 'n\n' || entry.data === 'n\r')
      ),
      'live permission denial did not send terminal input'
    );
    await permissionDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await page.getByRole('button', { name: 'Open command menu' }).click();
    await page.getByRole('button', { name: /Compact checkpoint/ }).click();
    await page
      .getByLabel('Latest compact checkpoint')
      .getByText('Continue from the latest terminal state without opening a new lane.')
      .waitFor({ state: 'visible', timeout: 5000 });
    const compactPrompt = await page.getByRole('textbox', { name: 'Prompt' }).inputValue();
    assert(
      compactPrompt === 'Continue from populated compact checkpoint evidence.',
      'compact continuation prompt did not populate the composer'
    );
    await page.getByRole('button', { name: 'Open command menu' }).click();
    await page.getByRole('button', { name: /Plugins surface/ }).click();
    const pluginDrawer = page.getByRole('complementary', { name: 'Plugins' });
    await pluginDrawer.waitFor({ state: 'visible', timeout: 5000 });
    await pluginDrawer
      .getByText('Smoke review plugin')
      .waitFor({ state: 'visible', timeout: 5000 });
    await pluginDrawer.getByText('pnpm smoke:review').waitFor({ state: 'visible', timeout: 5000 });
    await assertDrawerLayout(page, pluginDrawer, 'plugins');
    await pluginDrawer.getByRole('button', { name: 'Close surface' }).click();
    await page.getByRole('button', { name: 'Open command menu' }).click();
    await page.getByRole('button', { name: /Automations surface/ }).click();
    const automationDrawer = page.getByRole('complementary', { name: 'Automations' });
    await automationDrawer.waitFor({ state: 'visible', timeout: 5000 });
    await automationDrawer
      .getByText('Morning smoke review')
      .waitFor({ state: 'visible', timeout: 5000 });
    await automationDrawer.getByRole('button', { name: 'Run Now' }).click();
    await automationDrawer.getByRole('button', { name: 'History' }).click();
    await automationDrawer.getByText('Exit: 0').waitFor({ state: 'visible', timeout: 5000 });
    await assertDrawerLayout(page, automationDrawer, 'automations');
    await automationDrawer.getByRole('button', { name: 'Close surface' }).click();
    await page.getByRole('button', { name: 'Evidence' }).click();
    const evidenceDrawer = page.getByRole('complementary', { name: 'Evidence' });
    await evidenceDrawer.waitFor({ state: 'visible', timeout: 5000 });
    await evidenceDrawer
      .getByText('Seeded handoff for review smoke')
      .waitFor({ state: 'visible', timeout: 5000 });
    await evidenceDrawer.getByText('MergeJudge ready').waitFor({ state: 'visible', timeout: 5000 });
    await evidenceDrawer.getByText('Unit tests').waitFor({ state: 'visible', timeout: 5000 });
    await evidenceDrawer
      .getByText('Thread event JSONL')
      .waitFor({ state: 'visible', timeout: 5000 });
    const evidenceText = await evidenceDrawer.innerText();
    assert(
      evidenceText.includes('Seeded handoff for review smoke'),
      'seeded handoff did not render'
    );
    assert(evidenceText.includes('MergeJudge ready'), 'ready merge assessment did not render');
    assert(evidenceText.includes('Unit tests'), 'test proof did not render');
    assert(evidenceText.includes('Thread event JSONL'), 'replay JSONL card did not render');
    await assertDrawerLayout(page, evidenceDrawer, 'evidence');

    await page
      .getByRole('textbox', { name: 'Prompt' })
      .fill('@Claude implement and @Codex verify the smoke task');
    await page.getByRole('button', { name: 'Send prompt' }).click();
    await page.waitForFunction(() => window.__doorwaySmoke?.bestOfNLaunches?.length > 0, null, {
      timeout: 5000,
    });
    const delegationIpc = await page.evaluate(() => window.__doorwaySmoke);
    assert(
      delegationIpc.bestOfNLaunches[0].providers.join(',') === 'claude,codex',
      'multi-worker mentions did not launch Claude and Codex through Best-of-N'
    );
    await page.getByRole('textbox', { name: 'Prompt' }).fill('Run the smoke verification task');
    await page.getByRole('button', { name: 'Send prompt' }).click();
    await page.waitForFunction(() => window.__doorwaySmoke?.agentLaunches?.length > 0, null, {
      timeout: 5000,
    });
    const terminalPanel = page.getByLabel('Terminal mux');
    await terminalPanel.waitFor({ state: 'visible', timeout: 5000 });
    await terminalPanel
      .getByRole('region', { name: 'xterm terminal transcript' })
      .waitFor({ state: 'visible', timeout: 5000 });
    await terminalPanel.locator('.terminal-surface__viewport .xterm').waitFor({
      state: 'visible',
      timeout: 5000,
    });
    await terminalPanel
      .getByLabel('Terminal sessions')
      .getByText('pnpm test')
      .waitFor({ state: 'visible', timeout: 5000 });
    const approvalSession = terminalPanel
      .getByLabel('Terminal sessions')
      .locator('[data-attention="needs-approval"]');
    await approvalSession.waitFor({ state: 'visible', timeout: 5000 });
    const approvalSessionText = await approvalSession.innerText();
    assert(
      approvalSessionText.includes('needs approval'),
      'approval attention state did not render'
    );
    const terminalMetadata = terminalPanel.getByLabel('Terminal metadata');
    await terminalMetadata.getByText('wt_review').waitFor({ state: 'visible', timeout: 5000 });
    await terminalMetadata
      .getByText('doorway/task-review/backend')
      .waitFor({ state: 'visible', timeout: 5000 });
    await terminalMetadata.getByText('pnpm test').waitFor({ state: 'visible', timeout: 5000 });
    const terminalSurfaceMode = await terminalPanel
      .locator('.terminal-surface')
      .getAttribute('data-interactive');
    assert(terminalSurfaceMode === 'true', 'terminal surface did not enable input mode');
    const terminalText = await terminalPanel.getByLabel('Terminal transcript text').textContent();
    assert(terminalText?.includes('pnpm test'), 'terminal transcript command did not render');
    assert(terminalText?.includes('tests passed'), 'terminal transcript result did not render');
    await terminalPanel
      .getByLabel('Terminal input history')
      .waitFor({ state: 'visible', timeout: 5000 });
    await terminalPanel.locator('.terminal-surface__viewport .xterm').click();
    await page.keyboard.type('pwd');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        window.__doorwaySmoke?.terminalWrites
          ?.map((entry) => entry.data)
          .join('')
          .includes('pwd'),
      null,
      {
        timeout: 5000,
      }
    );
    const terminalIpc = await page.evaluate(() => window.__doorwaySmoke);
    const typedInput = terminalIpc.terminalWrites.map((entry) => entry.data).join('');
    assert(typedInput.includes('pwd'), 'xterm input did not call terminal write IPC');
    await terminalPanel
      .getByLabel('Terminal input history')
      .getByText('pwd')
      .waitFor({ state: 'visible', timeout: 5000 });
    assert(
      terminalIpc.terminalWrites.some((entry) => entry.sessionId === 'session_seeded'),
      'terminal write IPC used the wrong session'
    );
    assert(
      terminalIpc.terminalResizes.some(
        (entry) => entry.sessionId === 'session_seeded' && entry.cols > 0 && entry.rows > 0
      ),
      'xterm fit did not call terminal resize IPC'
    );
    await terminalPanel.getByRole('button', { name: 'Interrupt' }).click();
    await page.waitForFunction(
      () => window.__doorwaySmoke?.terminalWrites?.some((entry) => entry.data === '\u0003'),
      null,
      {
        timeout: 5000,
      }
    );
    const interruptedIpc = await page.evaluate(() => window.__doorwaySmoke);
    assert(
      interruptedIpc.terminalWrites.some(
        (entry) => entry.sessionId === 'session_seeded' && entry.data === '\u0003'
      ),
      'terminal interrupt did not target the active session'
    );
    await terminalPanel.getByRole('button', { name: 'Stop' }).click();
    await page.waitForFunction(() => window.__doorwaySmoke?.terminalStops?.length > 0, null, {
      timeout: 5000,
    });
    const stoppedIpc = await page.evaluate(() => window.__doorwaySmoke);
    assert(
      stoppedIpc.terminalStops.some((entry) => entry.sessionId === 'session_seeded'),
      'terminal stop did not target the active session'
    );
    const reviewSessionButton = terminalPanel.getByRole('button', {
      name: /Select terminal session session_review/,
    });
    await reviewSessionButton.click();
    await terminalMetadata.getByText('pnpm review').waitFor({ state: 'visible', timeout: 5000 });
    const reviewPressed = await reviewSessionButton.getAttribute('aria-pressed');
    assert(reviewPressed === 'true', 'selected terminal session did not become active');
    const reviewText = await terminalPanel.getByLabel('Terminal transcript text').textContent();
    assert(reviewText?.includes('pnpm review'), 'selected terminal command did not render');
    assert(reviewText?.includes('review ready'), 'selected terminal result did not render');
  } else {
    await page.getByRole('button', { name: 'Worktrees' }).click();
    const drawer = page.getByRole('complementary', { name: 'Worktrees' });
    await drawer.waitFor({ state: 'visible', timeout: 5000 });

    const drawerText = await drawer.innerText();
    assert(drawerText.includes('Worktree safety'), 'worktree safety summary did not render');
    assert(drawerText.includes('0 tracked worktrees'), 'empty worktree count did not render');
    assert(drawerText.includes('No worktrees recorded'), 'first worktree action did not render');
  }

  if (stateMode !== 'populated') {
    const drawer = page.getByRole('complementary', { name: 'Worktrees' });
    await assertDrawerLayout(page, drawer, 'worktree');
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot=${screenshotPath} chars=${initialText.length}`);
} finally {
  await browser.close();
}
