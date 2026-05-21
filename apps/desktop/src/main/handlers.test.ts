import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MergeAssessmentProjection, TaskId, ThreadId } from '@doorway/protocol';
import {
  createDatabase,
  createThread,
  listPermissionReceipts,
  openProject,
  setThreadToolEnabled,
} from '@doorway/core';
import {
  assertCleanArchiveSource,
  assertCleanForkSource,
  assertReadyForIntegrationMerge,
  assertReviewMergeToolEnabled,
  browserEvidenceBundleJson,
  buildWorktreeMergeApproval,
  clipboardTextFromRequest,
  forkWorktreeBranchName,
  handoffGoalFromThreadRow,
  handoffUsageEventPayload,
  latestAgentRunId,
  livePermissionDecisionOptions,
  latestMergeAssessmentForTask,
  memorySourcesForEvent,
  normalizeHandoffProvider,
  pathTextFromRequest,
  selectPostMergeTestCommand,
  shouldCreateThreadForAgentLaunch,
  terminalChunkRowsToAgentEvents,
  threadReplayVerificationFailedPayload,
  threadReplayVerificationSucceededPayload,
  verifyThreadReplayJsonlFile,
  writeBrowserEvidenceBundle,
  writeThreadReplayJsonl,
  writeWorktreeRollbackPatch,
} from './handlers';

describe('buildWorktreeMergeApproval', () => {
  it('blocks worktree archive when cleanup would drop dirty filesystem state', () => {
    expect(() => assertCleanArchiveSource({ exists: false, isClean: false }, '/repo/wt')).toThrow(
      'Doorway worktree path no longer exists: /repo/wt'
    );
    expect(() => assertCleanArchiveSource({ exists: true, isClean: false }, '/repo/wt')).toThrow(
      'Cannot archive dirty worktree without committing or stashing changes: /repo/wt'
    );
    expect(() =>
      assertCleanArchiveSource({ exists: true, isClean: true }, '/repo/wt')
    ).not.toThrow();
  });

  it('blocks worktree forks that would drop dirty filesystem state', () => {
    expect(() => assertCleanForkSource({ exists: false, isClean: false }, '/repo/wt')).toThrow(
      'Doorway worktree path no longer exists: /repo/wt'
    );
    expect(() => assertCleanForkSource({ exists: true, isClean: false }, '/repo/wt')).toThrow(
      'Cannot fork dirty worktree without committing or stashing changes: /repo/wt'
    );
    expect(() => assertCleanForkSource({ exists: true, isClean: true }, '/repo/wt')).not.toThrow();
  });

  it('builds deterministic fork branch names from Doorway source branches', () => {
    expect(forkWorktreeBranchName('refs/heads/doorway/task-review/backend', 'abc123')).toBe(
      'fork-backend-abc123'
    );
    expect(forkWorktreeBranchName('doorway/task-review/review/pass', 'def456')).toBe(
      'fork-review-pass-def456'
    );
  });

  it('builds the persisted approval payload from a Doorway worktree', () => {
    const approval = buildWorktreeMergeApproval({
      branch: 'refs/heads/doorway/task-review/backend',
      path: '/repo/.doorway-workspaces/task-review/backend',
    });

    expect(approval).toEqual({
      taskId: 'task-review',
      command: 'merge doorway/task-review/backend',
      riskCategory: 'merge_approval',
      decision: 'approved',
      userNotes: 'Approved merge review for /repo/.doorway-workspaces/task-review/backend',
    });
  });

  it('rejects branches outside Doorway ownership', () => {
    expect(() =>
      buildWorktreeMergeApproval({
        branch: 'feature/user-branch',
        path: '/repo',
      })
    ).toThrow('Cannot approve non-Doorway branch: feature/user-branch');
  });
});

describe('assertReviewMergeToolEnabled', () => {
  it('records a denied receipt when review merge is disabled for the thread', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'doorway-review-merge-policy-'));
    const db = createDatabase({ dataPath });
    try {
      const project = openProject(db, {
        path: dataPath,
        name: 'Policy Project',
      });
      const thread = createThread(db, project.id, 'Review policy', 'Verify review policy');
      setThreadToolEnabled(db, {
        threadId: thread.id,
        toolId: 'tool.review-merge',
        enabled: false,
      });

      expect(() => assertReviewMergeToolEnabled(db, thread.id, 'merge:create-integration')).toThrow(
        'Tool is disabled for this thread: tool.review-merge'
      );

      expect(listPermissionReceipts(db, thread.id)).toMatchObject([
        {
          command: 'merge:create-integration',
          riskCategory: 'tool_disabled',
          decision: 'denied',
          userNotes: 'Blocked by thread tool policy: tool.review-merge',
        },
      ]);
    } finally {
      db.close();
      await rm(dataPath, { recursive: true, force: true });
    }
  });
});

describe('livePermissionDecisionOptions', () => {
  const rows = [
    {
      id: 'run_latest',
      task_id: 'task-latest',
      terminal_session_id: 'term_latest',
    },
    {
      id: 'run_review',
      task_id: 'task-review',
      terminal_session_id: 'term_review',
    },
  ];

  it('selects the agent run by run id when recording a live permission decision', () => {
    expect(
      livePermissionDecisionOptions(rows, {
        runId: 'run_review',
        command: 'Permission required: allow command? [y/N]',
        decision: 'approved',
        riskCategory: 'live_terminal_permission',
        userNotes: 'Approved evt_terminal_attention',
      })
    ).toEqual({
      taskId: 'task-review',
      runId: 'run_review',
      command: 'Permission required: allow command? [y/N]',
      riskCategory: 'live_terminal_permission',
      decision: 'approved',
      userNotes: 'Approved evt_terminal_attention',
    });
  });

  it('selects the agent run by terminal session and falls back to the latest row', () => {
    expect(
      livePermissionDecisionOptions(rows, {
        sessionId: 'term_review',
        command: 'Approve package install?',
        decision: 'denied',
      })
    ).toEqual({
      taskId: 'task-review',
      runId: 'run_review',
      command: 'Approve package install?',
      riskCategory: 'live_permission',
      decision: 'denied',
      userNotes: 'Denied from live permission modal.',
    });

    expect(
      livePermissionDecisionOptions(rows, {
        command: 'Approve shell access?',
        decision: 'approved',
      }).runId
    ).toBe('run_latest');
  });

  it('requires an agent run row before persisting a live permission decision', () => {
    expect(() =>
      livePermissionDecisionOptions([], {
        command: 'Approve command?',
        decision: 'denied',
      })
    ).toThrow('No agent run exists for this live permission request.');
  });
});

describe('assertReadyForIntegrationMerge', () => {
  const taskId = 'task-review' as TaskId;

  it('accepts the latest ready MergeJudge assessment', () => {
    const assessments = [
      assessment('merge_old', taskId, 'reviewable', '2026-05-18T01:00:00.000Z'),
      assessment('merge_new', taskId, 'ready', '2026-05-18T02:00:00.000Z'),
    ];

    expect(latestMergeAssessmentForTask(assessments, taskId)?.id).toBe('merge_new');
    expect(() => assertReadyForIntegrationMerge(assessments, taskId)).not.toThrow();
  });

  it('rejects merge execution when the latest score is not ready', () => {
    const assessments = [
      assessment('merge_old', taskId, 'ready', '2026-05-18T01:00:00.000Z'),
      assessment('merge_new', taskId, 'blocked', '2026-05-18T02:00:00.000Z'),
    ];

    expect(() => assertReadyForIntegrationMerge(assessments, taskId)).toThrow(
      'Latest MergeJudge score for task task-review is blocked'
    );
  });
});

describe('selectPostMergeTestCommand', () => {
  it('selects the discovered test command for post-merge proof', () => {
    expect(
      selectPostMergeTestCommand({
        test: 'pnpm test',
        typecheck: 'pnpm run typecheck',
        lint: 'pnpm run lint',
      })
    ).toBe('pnpm test');
  });

  it('does not invent a verification command when no test script is discovered', () => {
    expect(selectPostMergeTestCommand({ typecheck: 'pnpm run typecheck' })).toBeUndefined();
  });
});

describe('handoff helpers', () => {
  it('selects the latest persisted agent run id', () => {
    expect(
      latestAgentRunId([
        { id: 'run_old', created_at: '2026-05-18T01:00:00.000Z' },
        { id: 'run_new', created_at: '2026-05-18T02:00:00.000Z' },
      ])
    ).toBe('run_new');
  });

  it('uses thread goal for handoff intent and falls back to title', () => {
    expect(handoffGoalFromThreadRow({ title: 'Thread title', goal: 'Ship review flow' })).toBe(
      'Ship review flow'
    );
    expect(handoffGoalFromThreadRow({ title: 'Thread title', goal: '' })).toBe('Thread title');
  });

  it('normalizes unsupported handoff targets to codex', () => {
    expect(normalizeHandoffProvider('claude')).toBe('claude');
    expect(normalizeHandoffProvider('generic')).toBe('codex');
    expect(normalizeHandoffProvider(undefined)).toBe('codex');
  });

  it('summarizes project memory sources for persisted launch evidence', () => {
    expect(
      memorySourcesForEvent([
        {
          sourceFile: 'AGENTS.md',
          category: 'instruction',
          content: 'Agent rules',
        },
        {
          sourceFile: 'README.md',
          category: 'knowledge',
          content: 'Project overview',
        },
      ])
    ).toEqual([
      { sourceFile: 'AGENTS.md', category: 'instruction', contentLength: 11 },
      { sourceFile: 'README.md', category: 'knowledge', contentLength: 16 },
    ]);
  });

  it('maps persisted terminal chunks into handoff agent events', () => {
    expect(
      terminalChunkRowsToAgentEvents([
        {
          text: 'build started',
          is_stdout: 1,
          is_stderr: 0,
          created_at: '2026-05-18T01:00:00.000Z',
        },
        {
          text: 'type error',
          is_stdout: 0,
          is_stderr: 1,
          created_at: '2026-05-18T01:00:01.000Z',
        },
      ])
    ).toEqual([
      {
        type: 'stdout',
        data: 'build started',
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
      },
      {
        type: 'stderr',
        data: 'type error',
        timestamp: new Date('2026-05-18T01:00:01.000Z'),
      },
    ]);
  });
});

describe('agent launch helpers', () => {
  it('requires projectId before creating a thread for first-prompt launch', () => {
    expect(shouldCreateThreadForAgentLaunch({ projectId: 'project_1' })).toBe(true);
    expect(shouldCreateThreadForAgentLaunch({ threadId: 'thread_1', projectId: 'project_1' })).toBe(
      false
    );
    expect(shouldCreateThreadForAgentLaunch({})).toBe(false);
  });
});

describe('clipboard helpers', () => {
  it('accepts non-empty text and trims edge whitespace', () => {
    expect(clipboardTextFromRequest('  Continue the run\n')).toBe('Continue the run');
  });

  it('rejects empty clipboard text', () => {
    expect(() => clipboardTextFromRequest('   ')).toThrow('Clipboard text is empty');
  });

  it('builds a handoff used event payload when copy includes capsule context', () => {
    expect(
      handoffUsageEventPayload({
        threadId: 'thread_1' as ThreadId,
        capsuleId: 'hnd_1',
        action: 'copy_next_prompt',
      })
    ).toEqual({
      threadId: 'thread_1',
      payload: {
        capsuleId: 'hnd_1',
        threadId: 'thread_1' as ThreadId,
        action: 'copy_next_prompt',
      },
    });
  });

  it('rejects partial handoff copy context', () => {
    expect(() =>
      handoffUsageEventPayload({ threadId: 'thread_1', action: 'copy_next_prompt' })
    ).toThrow('Handoff usage requires threadId and capsuleId');
  });

  it('builds a handoff used event payload when opening a worktree', () => {
    expect(
      handoffUsageEventPayload({
        threadId: 'thread_1' as ThreadId,
        capsuleId: 'hnd_1',
        action: 'open_worktree',
        worktreePath: ' /repo/.doorway-workspaces/task ',
      })
    ).toEqual({
      threadId: 'thread_1',
      payload: {
        capsuleId: 'hnd_1',
        threadId: 'thread_1' as ThreadId,
        action: 'open_worktree',
        worktreePath: '/repo/.doorway-workspaces/task',
      },
    });
  });

  it('builds a handoff used event payload when opening a changed file', () => {
    expect(
      handoffUsageEventPayload({
        threadId: 'thread_1' as ThreadId,
        capsuleId: 'hnd_1',
        action: 'open_changed_file',
        worktreePath: ' /repo/.doorway-workspaces/task ',
        filePath: ' apps/desktop/src/renderer/App.tsx ',
      })
    ).toEqual({
      threadId: 'thread_1',
      payload: {
        capsuleId: 'hnd_1',
        threadId: 'thread_1',
        action: 'open_changed_file',
        worktreePath: '/repo/.doorway-workspaces/task',
        filePath: 'apps/desktop/src/renderer/App.tsx',
      },
    });
  });
});

describe('file open helpers', () => {
  it('accepts non-empty path text and trims edge whitespace', () => {
    expect(pathTextFromRequest('  /repo/.doorway-workspaces/task\n')).toBe(
      '/repo/.doorway-workspaces/task'
    );
  });

  it('rejects empty path text', () => {
    expect(() => pathTextFromRequest('   ')).toThrow('Path is empty');
  });
});

describe('browser evidence bundle helpers', () => {
  it('writes a durable browser evidence bundle with screenshots counted', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'doorway-browser-evidence-'));
    try {
      const result = await writeBrowserEvidenceBundle({
        dataDir,
        threadId: 'thread_1' as ThreadId,
        actions: [
          {
            timestamp: new Date('2026-05-18T01:00:00.000Z'),
            type: 'goto',
            url: 'https://localhost:5173',
            screenshot: 'screen-one',
          },
          {
            timestamp: '2026-05-18T01:01:00.000Z',
            type: 'click',
            selector: '[data-testid="send"]',
          },
        ],
      });
      const saved = JSON.parse(await readFile(result.path, 'utf-8'));

      expect(result.actionCount).toBe(2);
      expect(result.screenshotCount).toBe(1);
      expect(saved.kind).toBe('browser-evidence');
      expect(saved.threadId).toBe('thread_1');
      expect(saved.actions[0]).toEqual({
        sequence: 1,
        timestamp: '2026-05-18T01:00:00.000Z',
        type: 'goto',
        url: 'https://localhost:5173',
        screenshot: 'screen-one',
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects exporting an empty browser evidence bundle', async () => {
    await expect(
      writeBrowserEvidenceBundle({
        dataDir: tmpdir(),
        threadId: 'thread_1' as ThreadId,
        actions: [],
      })
    ).rejects.toThrow('No browser actions recorded for this thread.');
  });

  it('formats browser evidence bundle JSON deterministically', () => {
    expect(
      JSON.parse(
        browserEvidenceBundleJson(
          'thread_1' as ThreadId,
          [{ timestamp: '2026-05-18T01:00:00.000Z', type: 'load' }],
          '2026-05-18T01:02:00.000Z'
        )
      )
    ).toEqual({
      kind: 'browser-evidence',
      threadId: 'thread_1',
      createdAt: '2026-05-18T01:02:00.000Z',
      actions: [
        {
          sequence: 1,
          timestamp: '2026-05-18T01:00:00.000Z',
          type: 'load',
        },
      ],
    });
  });

  it('writes thread replay JSONL to durable evidence storage', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'doorway-thread-replay-'));
    try {
      const result = await writeThreadReplayJsonl({
        dataDir,
        threadId: 'thread_1' as ThreadId,
        jsonl: '{"sequence":1}\n{"sequence":2}\n',
      });
      const saved = await readFile(result.path, 'utf-8');

      expect(result.eventCount).toBe(2);
      expect(result.path).toContain('/evidence/thread_1/replay/thread-');
      expect(saved).toBe('{"sequence":1}\n{"sequence":2}\n');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('writes rollback patch evidence and reports byte size', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'doorway-rollback-patch-'));
    try {
      const patch = 'diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n';
      const result = await writeWorktreeRollbackPatch({
        dataDir,
        threadId: 'thread_1' as ThreadId,
        patch,
      });
      const saved = await readFile(result.path, 'utf-8');

      expect(result.patchBytes).toBe(Buffer.byteLength(patch, 'utf-8'));
      expect(result.path).toContain('/evidence/thread_1/rollback/rollback-');
      expect(saved).toBe(patch);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects rollback patch export when there are no changes', async () => {
    await expect(
      writeWorktreeRollbackPatch({
        dataDir: tmpdir(),
        threadId: 'thread_1' as ThreadId,
        patch: '   ',
      })
    ).rejects.toThrow('No worktree changes available for rollback patch export.');
  });

  it('verifies a durable thread replay JSONL file', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'doorway-thread-replay-verify-'));
    try {
      const replayPath = join(dataDir, 'thread.jsonl');
      await writeFile(
        replayPath,
        [
          JSON.stringify({
            id: 'evt_1',
            threadId: 'thread_1',
            type: 'message.appended',
            sequence: 1,
            timestamp: '2026-05-18T01:00:00.000Z',
            payload: {
              messageId: 'msg_1',
              threadId: 'thread_1',
              role: 'user',
              content: 'Hello',
            },
          }),
          JSON.stringify({
            id: 'evt_2',
            threadId: 'thread_1',
            type: 'thread.status_changed',
            sequence: 2,
            timestamp: '2026-05-18T01:01:00.000Z',
            payload: {
              threadId: 'thread_1',
              previousStatus: 'active',
              newStatus: 'paused',
            },
          }),
        ].join('\n'),
        'utf-8'
      );

      await expect(verifyThreadReplayJsonlFile(replayPath)).resolves.toEqual({
        path: replayPath,
        eventCount: 2,
        firstSequence: 1,
        lastSequence: 2,
        threadIds: ['thread_1'],
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects invalid durable thread replay JSONL files', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'doorway-thread-replay-invalid-'));
    try {
      const replayPath = join(dataDir, 'thread.jsonl');
      await writeFile(
        replayPath,
        '{"id":"evt_1","threadId":"thread_1","type":"unknown.event","sequence":1,"timestamp":"2026-05-18T01:00:00.000Z","payload":{}}\n',
        'utf-8'
      );

      await expect(verifyThreadReplayJsonlFile(replayPath)).rejects.toThrow(
        'Replay JSONL line has an unknown event type.'
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('builds durable replay verification failure payloads', () => {
    expect(
      threadReplayVerificationFailedPayload(
        ' /tmp/thread.jsonl ',
        new Error('Replay JSONL line has an unknown event type.'),
        '2026-05-18T01:02:00.000Z'
      )
    ).toEqual({
      path: '/tmp/thread.jsonl',
      error: 'Replay JSONL line has an unknown event type.',
      createdAt: '2026-05-18T01:02:00.000Z',
    });
  });

  it('builds durable replay verification success payloads', () => {
    expect(
      threadReplayVerificationSucceededPayload(
        {
          path: '/tmp/thread.jsonl',
          eventCount: 2,
          firstSequence: 1,
          lastSequence: 2,
          threadIds: ['thread_1' as ThreadId],
        },
        '2026-05-18T01:03:00.000Z'
      )
    ).toEqual({
      path: '/tmp/thread.jsonl',
      eventCount: 2,
      firstSequence: 1,
      lastSequence: 2,
      threadIds: ['thread_1'],
      createdAt: '2026-05-18T01:03:00.000Z',
    });
  });
});

function assessment(
  id: string,
  taskId: TaskId,
  score: MergeAssessmentProjection['score'],
  createdAt: string
): MergeAssessmentProjection {
  return {
    id,
    taskId,
    score,
    reason: score,
    cleanApply: score !== 'blocked',
    testsPassed: score === 'ready',
    highRiskFiles: [],
    hasApproval: score === 'ready',
    createdAt: new Date(createdAt),
    evidence: [],
  };
}
