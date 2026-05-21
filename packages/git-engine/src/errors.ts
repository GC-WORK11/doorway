/**
 * Git Engine Errors
 */

export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export class NotARepoError extends GitError {
  constructor(path: string) {
    super(`Not a git repository: ${path}`, 'NOT_A_REPO', { path });
    this.name = 'NotARepoError';
  }
}

export class WorktreeExistsError extends GitError {
  constructor(worktreePath: string) {
    super(`Worktree already exists: ${worktreePath}`, 'WORKTREE_EXISTS', { worktreePath });
    this.name = 'WorktreeExistsError';
  }
}

export class WorktreeNotFoundError extends GitError {
  constructor(worktreePath: string) {
    super(`Worktree not found: ${worktreePath}`, 'WORKTREE_NOT_FOUND', { worktreePath });
    this.name = 'WorktreeNotFoundError';
  }
}

export class BranchExistsError extends GitError {
  constructor(branch: string) {
    super(`Branch already exists: ${branch}`, 'BRANCH_EXISTS', { branch });
    this.name = 'BranchExistsError';
  }
}

export class DirtyRepoError extends GitError {
  constructor(path: string) {
    super(`Repository has uncommitted changes: ${path}`, 'DIRTY_REPO', { path });
    this.name = 'DirtyRepoError';
  }
}

export class MergeConflictError extends GitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MERGE_CONFLICT', context);
    this.name = 'MergeConflictError';
  }
}

export class DiffError extends GitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DIFF_ERROR', context);
    this.name = 'DiffError';
  }
}

export class ArchiveError extends GitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ARCHIVE_ERROR', context);
    this.name = 'ArchiveError';
  }
}
