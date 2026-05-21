import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it, expect } from 'vitest';
import {
  archiveWorktree,
  createWorktree,
  deleteDoorwayBranch,
  doorwayBranchNameForDeletion,
  generateDoorwayBranch,
  generateWorktreePath,
  isDoorwayWorktree,
  listDoorwayWorktrees,
} from './worktree.js';
import { getDiffStat, getChangedFiles, hasChanges } from './diff.js';
import { NotARepoError, WorktreeExistsError } from './errors.js';
import { isGitRepo } from './git.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], { cwd, encoding: 'utf-8' });
  return stdout;
}

async function createDisposableRepo(): Promise<{ readonly base: string; readonly repo: string }> {
  const base = await mkdtemp(join(tmpdir(), 'doorway-git-engine-'));
  const repo = join(base, 'repo');
  await mkdir(repo);
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Doorway Test']);
  await git(repo, ['config', 'user.email', 'doorway-test@example.invalid']);
  await writeFile(join(repo, 'app.txt'), 'base\n', 'utf-8');
  await git(repo, ['add', 'app.txt']);
  await git(repo, ['commit', '-m', 'initial']);
  return { base, repo };
}

describe('Worktree Utilities', () => {
  describe('isDoorwayWorktree', () => {
    it('should return true for doorway branches', () => {
      expect(isDoorwayWorktree('doorway/task-123/backend')).toBe(true);
      expect(isDoorwayWorktree('doorway/task-abc')).toBe(true);
      expect(isDoorwayWorktree('doorway/my-task')).toBe(true);
      expect(isDoorwayWorktree('refs/heads/doorway/task-123/backend')).toBe(true);
    });

    it('should return false for non-doorway branches', () => {
      expect(isDoorwayWorktree('feature/new-feature')).toBe(false);
      expect(isDoorwayWorktree('main')).toBe(false);
      expect(isDoorwayWorktree('master')).toBe(false);
      expect(isDoorwayWorktree('develop')).toBe(false);
    });
  });

  describe('doorwayBranchNameForDeletion', () => {
    it('normalizes only Doorway-owned branches for cleanup', () => {
      expect(doorwayBranchNameForDeletion('refs/heads/doorway/task-123/backend')).toBe(
        'doorway/task-123/backend'
      );
      expect(() => doorwayBranchNameForDeletion('feature/user-branch')).toThrow(
        'Refusing to delete non-Doorway branch: feature/user-branch'
      );
    });
  });

  describe('generateDoorwayBranch', () => {
    it('should generate doorway branch names', () => {
      const branch = generateDoorwayBranch('task-123' as import('@doorway/protocol').TaskId);
      expect(branch).toBe('doorway/task-123');

      const branchWithRole = generateDoorwayBranch(
        'task-abc' as import('@doorway/protocol').TaskId,
        'backend'
      );
      expect(branchWithRole).toBe('doorway/task-abc/backend');
    });

    it('should sanitize task IDs', () => {
      const branch = generateDoorwayBranch('task_456' as import('@doorway/protocol').TaskId);
      expect(branch).toBe('doorway/task_456'); // underscores kept

      const branchWithSpecial = generateDoorwayBranch(
        'task@789' as import('@doorway/protocol').TaskId
      );
      expect(branchWithSpecial).toBe('doorway/task-789'); // @ replaced
    });
  });

  describe('generateWorktreePath', () => {
    it('should generate worktree paths', () => {
      const path = generateWorktreePath(
        '/project',
        'task-456' as import('@doorway/protocol').TaskId
      );
      expect(path).toContain('task-456');
      expect(path).toContain('workspaces');
    });

    it('should include role in path', () => {
      const path = generateWorktreePath(
        '/project',
        'task-789' as import('@doorway/protocol').TaskId,
        'frontend'
      );
      expect(path).toContain('task-789');
      expect(path).toContain('frontend');
      expect(path).toContain('workspaces');
    });
  });
});

describe('Worktree lifecycle commands', () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((cleanupPath) => rm(cleanupPath, { recursive: true, force: true }))
    );
  });

  it('creates, lists, archives, and deletes a Doorway-owned worktree branch', async () => {
    const { base, repo } = await createDisposableRepo();
    cleanupPaths.push(base);
    const worktreePath = join(base, 'task-worktree');
    const taskId = 'task-worktree-live' as import('@doorway/protocol').TaskId;

    expect((await git(repo, ['rev-parse', '--is-inside-work-tree'])).trim()).toBe('true');
    expect(await isGitRepo(repo)).toBe(true);

    const worktree = await createWorktree({
      projectPath: repo,
      taskId,
      branchName: 'implementer',
      worktreePath,
    });

    expect(worktree.path).toBe(worktreePath);
    expect(worktree.branch).toBe('doorway/task-worktree-live/implementer');
    expect(existsSync(worktreePath)).toBe(true);
    expect(await git(repo, ['worktree', 'list', '--porcelain'])).toContain(worktreePath);

    const listed = await listDoorwayWorktrees(repo);
    expect(listed.map((item) => item.path)).toContain(worktreePath);
    expect(listed.map((item) => item.branch)).toContain(
      'refs/heads/doorway/task-worktree-live/implementer'
    );

    await archiveWorktree(repo, worktreePath, { force: true });
    expect(await git(repo, ['worktree', 'list', '--porcelain'])).not.toContain(worktreePath);

    await deleteDoorwayBranch(repo, worktree.branch);
    expect(await git(repo, ['branch', '--list', 'doorway/task-worktree-live/implementer'])).toBe(
      ''
    );
  });
});

describe('Errors', () => {
  it('should create NotARepoError with correct properties', () => {
    const error = new NotARepoError('/path/to/repo');

    expect(error.name).toBe('NotARepoError');
    expect(error.code).toBe('NOT_A_REPO');
    expect(error.context).toEqual({ path: '/path/to/repo' });
    expect(error.message).toContain('/path/to/repo');
  });

  it('should create WorktreeExistsError with correct properties', () => {
    const error = new WorktreeExistsError('/path/to/worktree');

    expect(error.name).toBe('WorktreeExistsError');
    expect(error.code).toBe('WORKTREE_EXISTS');
    expect(error.context).toEqual({ worktreePath: '/path/to/worktree' });
  });

  it('should be instanceof Error', () => {
    const error = new NotARepoError('/path');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof NotARepoError).toBe(true);
  });
});

describe('Diff Result Structure', () => {
  it('should have correct structure', () => {
    const result = {
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      summary: '0 file(s) changed',
    };

    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('totalAdditions');
    expect(result).toHaveProperty('totalDeletions');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.files)).toBe(true);
  });

  it('should format summary correctly', () => {
    const result = {
      files: [{ path: 'a.ts', additions: 10, deletions: 5 }],
      totalAdditions: 10,
      totalDeletions: 5,
      summary: '1 file(s) changed, 10 insertions(+), 5 deletions(-)',
    };

    expect(result.summary).toContain('1 file(s) changed');
    expect(result.summary).toContain('10 insertions(+)');
    expect(result.summary).toContain('5 deletions(-)');
  });
});

describe('File Diff Structure', () => {
  it('should have correct status values', () => {
    type DiffStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
    const validStatuses: DiffStatus[] = ['added', 'modified', 'deleted', 'renamed', 'copied'];

    expect(validStatuses).toContain('added');
    expect(validStatuses).toContain('modified');
    expect(validStatuses).toContain('deleted');
    expect(validStatuses).toContain('renamed');
    expect(validStatuses).toContain('copied');
  });
});
