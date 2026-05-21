import { describe, it, expect } from 'vitest';
import {
  compileCapsule,
  compileCapsuleFormats,
  toJson,
  toMarkdown,
  toMinimal,
  parseJsonCapsule,
} from './compiler.js';
import type { CapsuleCompileOptions, HandoffCapsule } from './types.js';
import { CapsuleWriteError, CapsuleNotFoundError } from './errors.js';

describe('Capsule Compiler', () => {
  const baseOptions: Omit<CapsuleCompileOptions, 'threadId'> = {
    summary: {
      threadId: 'thread_123' as import('@doorway/protocol').ThreadId,
      title: 'Build Auth Feature',
      messageCount: 15,
      agentRunCount: 3,
    },
    latestIntent: 'Implement JWT authentication with refresh tokens',
    runSummaries: [
      {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        role: 'backend',
        adapterId: 'claude-code' as import('@doorway/protocol').AdapterId,
        status: 'done',
        filesChanged: 5,
        testsPassed: true,
      },
    ],
    worktreePath: '/home/user/project/.doorway-workspaces/task-123',
    branch: 'doorway/task-123/backend',
    changedFiles: [
      {
        path: 'src/auth/jwt.ts',
        status: 'added',
        additions: 150,
        deletions: 0,
        summary: 'Added JWT token generation',
      },
      {
        path: 'src/auth/middleware.ts',
        status: 'modified',
        additions: 20,
        deletions: 5,
        summary: 'Updated auth middleware',
      },
    ],
    diffSummary: '2 files changed, 170 insertions, 5 deletions',
    testStatus: 'pass',
    openQuestions: ['Should we add token rotation?'],
    nextPrompt: 'Continue implementing the refresh token endpoint',
  };

  describe('compileCapsule', () => {
    it('should create a capsule with generated ID', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_123',
      });

      expect(capsule.id).toMatch(/^capsule_/);
      expect(capsule.threadId).toBe('thread_123');
      expect(capsule.createdAt).toBeInstanceOf(Date);
    });

    it('should include all provided data', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_456',
      });

      expect(capsule.summary.title).toBe('Build Auth Feature');
      expect(capsule.latestIntent).toContain('JWT');
      expect(capsule.runSummaries).toHaveLength(1);
      expect(capsule.worktreePath).toContain('task-123');
      expect(capsule.branch).toBe('doorway/task-123/backend');
      expect(capsule.changedFiles).toHaveLength(2);
      expect(capsule.testStatus).toBe('pass');
      expect(capsule.openQuestions).toHaveLength(1);
      expect(capsule.nextPrompt).toContain('Continue');
    });

    it('should set metadata correctly', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_789',
        createdBy: 'user',
        targetProvider: 'codex',
      });

      expect(capsule.metadata.createdBy).toBe('user');
      expect(capsule.metadata.targetProvider).toBe('codex');
      expect(capsule.metadata.version).toBe('1.0.0');
    });
  });

  describe('compileCapsuleFormats', () => {
    it('should return all three formats', () => {
      const formats = compileCapsuleFormats({
        ...baseOptions,
        threadId: 'thread_test',
      });

      expect(formats).toHaveProperty('json');
      expect(formats).toHaveProperty('markdown');
      expect(formats).toHaveProperty('minimal');
    });

    it('should return valid JSON', () => {
      const formats = compileCapsuleFormats({
        ...baseOptions,
        threadId: 'thread_json',
      });

      expect(() => JSON.parse(formats.json)).not.toThrow();
    });

    it('should include markdown headers', () => {
      const formats = compileCapsuleFormats({
        ...baseOptions,
        threadId: 'thread_md',
      });

      expect(formats.markdown).toContain('# Handoff Capsule');
      expect(formats.markdown).toContain('## Thread Summary');
      expect(formats.markdown).toContain('## Changed Files');
    });

    it('should create compact minimal format', () => {
      const formats = compileCapsuleFormats({
        ...baseOptions,
        threadId: 'thread_minimal',
      });

      expect(formats.minimal.split('\n').length).toBeLessThan(formats.markdown.split('\n').length);
      expect(formats.minimal).toContain('# Build Auth Feature');
      expect(formats.minimal).toContain('**Next:**');
    });
  });

  describe('toJson', () => {
    it('should serialize capsule to valid JSON', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_json_ser',
      });

      const json = toJson(capsule);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe(capsule.id);
      expect(parsed.threadId).toBe(capsule.threadId);
      expect(parsed.summary.title).toBe(capsule.summary.title);
    });

    it('should format with indentation', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_indent',
      });

      const json = toJson(capsule);

      expect(json).toContain('\n  ');
    });
  });

  describe('toMarkdown', () => {
    it('should include thread summary', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_md_summary',
      });

      const md = toMarkdown(capsule);

      expect(md).toContain('**Title:** Build Auth Feature');
      expect(md).toContain('**Messages:** 15');
      expect(md).toContain('**Agent Runs:** 3');
    });

    it('should include intent', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_md_intent',
      });

      const md = toMarkdown(capsule);

      expect(md).toContain('## Latest Intent');
      expect(md).toContain('JWT authentication');
    });

    it('should show test status with icons', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_md_test',
        testStatus: 'pass',
      });

      const md = toMarkdown(capsule);

      expect(md).toContain('## Test Status');
      expect(md).toContain('✅');
      expect(md).toContain('pass');
    });

    it('should format file changes as table', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_md_files',
      });

      const md = toMarkdown(capsule);

      expect(md).toContain('| File | Status | Changes |');
      expect(md).toContain('src/auth/jwt.ts');
      expect(md).toContain('➕ added');
    });

    it('should include open questions as checkboxes', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_md_questions',
        openQuestions: ['Should we add token rotation?', 'Add rate limiting?'],
      });

      const md = toMarkdown(capsule);

      expect(md).toContain('## Open Questions');
      expect(md).toContain('- [ ] Should we add token rotation?');
    });
  });

  describe('toMinimal', () => {
    it('should be compact', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_mini',
      });

      const minimal = toMinimal(capsule);

      expect(minimal.split('\n').length).toBeLessThan(20);
    });

    it('should include essential info', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_mini_ess',
      });

      const minimal = toMinimal(capsule);

      expect(minimal).toContain('# Build Auth Feature');
      expect(minimal).toContain('**Goal:**');
      expect(minimal).toContain('**Worktree:**');
      expect(minimal).toContain('**Files:**');
      expect(minimal).toContain('**Next:**');
    });
  });

  describe('parseJsonCapsule', () => {
    it('should parse valid capsule', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_parse',
      });

      const json = toJson(capsule);
      const parsed = parseJsonCapsule(json);

      expect(parsed.id).toBe(capsule.id);
      expect(parsed.threadId).toBe(capsule.threadId);
      expect(parsed.createdAt).toBeInstanceOf(Date);
    });

    it('should handle empty arrays', () => {
      const capsule = compileCapsule({
        ...baseOptions,
        threadId: 'thread_empty',
        runSummaries: [],
        changedFiles: [],
        openQuestions: [],
      });

      const json = toJson(capsule);
      const parsed = parseJsonCapsule(json);

      expect(parsed.runSummaries).toHaveLength(0);
      expect(parsed.changedFiles).toHaveLength(0);
      expect(parsed.openQuestions).toHaveLength(0);
    });
  });
});

describe('Errors', () => {
  it('should create CapsuleWriteError with context', () => {
    const error = new CapsuleWriteError('Test write error', {
      capsuleId: 'capsule_123',
      path: '/path/to/capsule',
    });

    expect(error.name).toBe('CapsuleWriteError');
    expect(error.code).toBe('CAPSULE_WRITE_ERROR');
    expect(error.context.capsuleId).toBe('capsule_123');
  });

  it('should create CapsuleNotFoundError', () => {
    const error = new CapsuleNotFoundError('capsule_missing');

    expect(error.name).toBe('CapsuleNotFoundError');
    expect(error.code).toBe('CAPSULE_NOT_FOUND');
    expect(error.context.capsuleId).toBe('capsule_missing');
  });
});
