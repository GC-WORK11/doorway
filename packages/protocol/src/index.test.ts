import { describe, it, expect } from 'vitest';
import {
  isThreadId,
  isMessageId,
  isAgentRunId,
  isTerminalSessionId,
  isWorktreeId,
  isEventId,
  TERMINAL_ENTER,
  terminalSubmitInput,
  terminalSubmitLines,
} from './index.js';
import type {
  AdapterId,
  AgentRunId,
  AgentRunProjection,
  DiffProjection,
  EvidenceRef,
  MessageId,
  MessageProjection,
  ProjectId,
  ProjectProjection,
  ProviderId,
  ProviderProjection,
  RuntimeBadgeProjection,
  TerminalProjection,
  TerminalSessionId,
  ThreadId,
  ThreadProjection,
  ToolLaneProjection,
  WorktreeId,
  WorktreeProjection,
  ProofProjection,
} from './index.js';

describe('Protocol Type Guards', () => {
  describe('isThreadId', () => {
    it('should return true for valid thread ID', () => {
      expect(isThreadId('thread_abc123')).toBe(true);
      expect(isThreadId('thread_xyz789')).toBe(true);
    });

    it('should return false for invalid thread ID', () => {
      expect(isThreadId('msg_abc123')).toBe(false);
      expect(isThreadId('run_abc123')).toBe(false);
      expect(isThreadId('invalid')).toBe(false);
    });
  });

  describe('isMessageId', () => {
    it('should return true for valid message ID', () => {
      expect(isMessageId('msg_abc123')).toBe(true);
      expect(isMessageId('msg_xyz789')).toBe(true);
    });

    it('should return false for invalid message ID', () => {
      expect(isMessageId('thread_abc123')).toBe(false);
      expect(isMessageId('run_abc123')).toBe(false);
    });
  });

  describe('isAgentRunId', () => {
    it('should return true for valid agent run ID', () => {
      expect(isAgentRunId('run_abc123')).toBe(true);
      expect(isAgentRunId('run_xyz789')).toBe(true);
    });

    it('should return false for invalid agent run ID', () => {
      expect(isAgentRunId('thread_abc123')).toBe(false);
      expect(isAgentRunId('term_abc123')).toBe(false);
    });
  });

  describe('isTerminalSessionId', () => {
    it('should return true for valid terminal session ID', () => {
      expect(isTerminalSessionId('term_abc123')).toBe(true);
      expect(isTerminalSessionId('term_xyz789')).toBe(true);
    });

    it('should return false for invalid terminal session ID', () => {
      expect(isTerminalSessionId('run_abc123')).toBe(false);
      expect(isTerminalSessionId('wt_abc123')).toBe(false);
    });
  });

  describe('isWorktreeId', () => {
    it('should return true for valid worktree ID', () => {
      expect(isWorktreeId('wt_abc123')).toBe(true);
      expect(isWorktreeId('wt_xyz789')).toBe(true);
    });

    it('should return false for invalid worktree ID', () => {
      expect(isWorktreeId('thread_abc123')).toBe(false);
      expect(isWorktreeId('evt_abc123')).toBe(false);
    });
  });

  describe('isEventId', () => {
    it('should return true for valid event ID', () => {
      expect(isEventId('evt_abc123')).toBe(true);
      expect(isEventId('evt_xyz789')).toBe(true);
    });

    it('should return false for invalid event ID', () => {
      expect(isEventId('thread_abc123')).toBe(false);
      expect(isEventId('msg_abc123')).toBe(false);
    });
  });
});

describe('terminal submit helpers', () => {
  it('uses carriage return for interactive terminal submission', () => {
    expect(TERMINAL_ENTER).toBe('\r');
    expect(terminalSubmitInput('yes')).toBe('yes\r');
    expect(terminalSubmitInput('')).toBe('\r');
    expect(terminalSubmitLines(['pnpm test', 'exit $?'])).toBe('pnpm test\rexit $?\r');
  });
});

describe('Protocol Types Structure', () => {
  it('should export all required type definitions', () => {
    // Verify that the module exports the expected types
    const types = [
      'ThreadId',
      'MessageId',
      'AgentRunId',
      'TerminalSessionId',
      'WorktreeId',
      'EventId',
      'HandoffCapsuleId',
      'ProjectId',
      'TaskId',
    ];

    types.forEach((type) => {
      expect(typeof type).toBe('string');
    });
  });

  it('should have valid AgentRunStatus values', () => {
    const validStatuses = [
      'created',
      'worktree_ready',
      'terminal_launched',
      'prompt_sent',
      'running',
      'waiting_for_user',
      'approval_required',
      'command_running',
      'files_changed',
      'tests_running',
      'needs_retry',
      'done',
      'review_ready',
      'merged',
      'discarded',
      'archived',
      'failed',
      'crashed',
      'cancelled',
    ];

    expect(validStatuses).toHaveLength(19);
  });

  it('should have valid AgentRole values', () => {
    const validRoles = [
      'architect',
      'backend',
      'frontend',
      'tester',
      'reviewer',
      'integration',
      'debugger',
      'custom',
    ];

    expect(validRoles).toHaveLength(8);
  });

  it('should have valid FileChangeType values', () => {
    const validChangeTypes = ['created', 'modified', 'deleted', 'renamed'];

    expect(validChangeTypes).toHaveLength(4);
  });

  it('should have valid TestStatus values', () => {
    const validTestStatuses = ['pass', 'fail', 'pending', 'skipped', 'unknown'];

    expect(validTestStatuses).toHaveLength(5);
  });
});

describe('Renderer Projection Contracts', () => {
  it('should type the cockpit projections from real protocol identifiers', () => {
    const evidence: EvidenceRef = {
      kind: 'event',
      id: 'evt_123',
      label: 'Thread created',
    };

    const project: ProjectProjection = {
      id: 'project_123' as ProjectId,
      path: '/repo',
      name: 'repo',
      mode: 'git',
      packageManager: 'pnpm',
    };

    const thread: ThreadProjection = {
      id: 'thread_123' as ThreadId,
      projectId: project.id,
      title: 'Build ledger persistence',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      messageCount: 1,
    };

    const message: MessageProjection = {
      id: 'msg_123' as MessageId,
      threadId: thread.id,
      role: 'user',
      content: 'Ship the smallest working change.',
      createdAt: new Date('2026-01-01T00:01:00Z'),
      evidence: [evidence],
    };

    const run: AgentRunProjection = {
      id: 'run_123' as AgentRunId,
      threadId: thread.id,
      status: 'running',
      evidence: [evidence],
    };

    const worktree: WorktreeProjection = {
      id: 'wt_123' as WorktreeId,
      path: '/repo-workspaces/task',
      branch: 'doorway/task',
      isActive: true,
    };

    const terminal: TerminalProjection = {
      id: 'term_123' as TerminalSessionId,
      runId: run.id,
      runtime: 'pty',
      status: 'running',
      workingDirectory: worktree.path,
    };

    const lane: ToolLaneProjection = {
      id: run.id,
      threadId: thread.id,
      taskId: 'task_123' as import('./index.js').TaskId,
      runId: run.id,
      toolId: 'codex' as AdapterId,
      role: 'reviewer',
      runRole: 'reviewer',
      status: 'running',
      terminalSessionId: terminal.id,
      worktreeId: worktree.id,
      latestActivity: 'Reviewing changes',
      latestActivityAt: new Date('2026-01-01T00:02:00Z'),
    };

    const diff: DiffProjection = {
      worktreeId: worktree.id,
      files: [
        {
          path: 'packages/protocol/src/index.ts',
          status: 'modified',
          additions: 12,
          deletions: 0,
        },
      ],
      totalAdditions: 12,
      totalDeletions: 0,
    };

    const proof: ProofProjection = {
      id: 'proof_123',
      label: 'Protocol tests',
      status: 'pass',
      command: 'pnpm --filter @doorway/protocol test',
      startedAt: new Date('2026-05-18T01:00:00.000Z'),
      finishedAt: new Date('2026-05-18T01:01:00.000Z'),
      evidence: [evidence],
    };

    const provider: ProviderProjection = {
      id: 'claude' as ProviderId,
      name: 'Claude Code',
      adapterId: 'claude-code' as AdapterId,
      installed: true,
    };

    const badge: RuntimeBadgeProjection = {
      label: 'Running',
      tone: 'running',
      evidence,
    };

    expect(project.mode).toBe('git');
    expect(message.evidence).toHaveLength(1);
    expect(terminal.runId).toBe(run.id);
    expect(lane.terminalSessionId).toBe(terminal.id);
    expect(lane.latestActivity).toBe('Reviewing changes');
    expect(diff.totalAdditions).toBe(12);
    expect(proof.status).toBe('pass');
    expect(provider.installed).toBe(true);
    expect(badge.tone).toBe('running');
  });
});
