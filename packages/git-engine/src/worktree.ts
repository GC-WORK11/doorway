/**
 * Worktree Manager
 *
 * Manages git worktrees for Doorway: create, list, archive.
 * Doorway worktrees are identified by the 'doorway/' prefix in branch names.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import type { WorktreeId, TaskId } from '@doorway/protocol';
import { NotARepoError, WorktreeExistsError, WorktreeNotFoundError } from './errors.js';
import { isGitRepo, getRepoRoot, getCurrentBranch, getStatus, branchExists } from './git.js';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  readonly id: WorktreeId;
  readonly path: string;
  readonly branch: string;
  readonly isMain: boolean;
  readonly isActive: boolean;
  readonly isClean?: boolean;
  readonly commit?: string;
}

export interface CreateWorktreeOptions {
  readonly projectPath: string;
  readonly taskId: TaskId;
  readonly branchName: string;
  readonly worktreePath?: string;
  readonly baseBranch?: string;
  readonly force?: boolean;
}

const DOORWAY_PREFIX = 'doorway/';

/**
 * Check if a path is a Doorway-owned worktree.
 */
export function isDoorwayWorktree(branch: string): boolean {
  return branch.replace(/^refs\/heads\//, '').startsWith(DOORWAY_PREFIX);
}

/**
 * Generate a Doorway branch name.
 */
export function generateDoorwayBranch(taskId: TaskId, role?: string): string {
  const cleanTaskId = String(taskId).replace(/[^a-zA-Z0-9-_]/g, '-');
  if (role) {
    return `${DOORWAY_PREFIX}${cleanTaskId}/${role}`;
  }
  return `${DOORWAY_PREFIX}${cleanTaskId}`;
}

/**
 * Generate worktree path relative to project.
 */
export function generateWorktreePath(projectPath: string, taskId: TaskId, role?: string): string {
  const cleanTaskId = String(taskId).replace(/[^a-zA-Z0-9-_]/g, '-');
  const worktreeDir = '.doorway-workspaces';

  // Get project name from path
  const projectName = projectPath.split('/').pop() ?? 'project';

  if (role) {
    return join(projectPath, '..', `${projectName}-workspaces`, `${cleanTaskId}-${role}`);
  }
  return join(projectPath, '..', `${projectName}-workspaces`, cleanTaskId);
}

export function doorwayBranchNameForDeletion(branch: string): string {
  const normalized = branch.replace(/^refs\/heads\//, '');
  if (!isDoorwayWorktree(normalized)) {
    throw new Error(`Refusing to delete non-Doorway branch: ${branch}`);
  }
  return normalized;
}

/**
 * Execute git worktree command.
 */
async function gitWorktree(
  args: readonly string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = (await execFileAsync('git', ['worktree', ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
    })) as { stdout: string; stderr: string };
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), code: 0 };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };
    return {
      stdout: '',
      stderr: execError.stderr ?? String(error),
      code: execError.code ?? 1,
    };
  }
}

async function gitCommand(
  args: readonly string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = (await execFileAsync('git', [...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
    })) as { stdout: string; stderr: string };
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), code: 0 };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };
    return {
      stdout: '',
      stderr: execError.stderr ?? String(error),
      code: execError.code ?? 1,
    };
  }
}

/**
 * Validate project is a git repo.
 */
async function validateGitRepo(projectPath: string): Promise<string> {
  const isRepo = await isGitRepo(projectPath);
  if (!isRepo) {
    throw new NotARepoError(projectPath);
  }
  return getRepoRoot(projectPath);
}

/**
 * Create a new worktree for a Doorway task.
 */
export async function createWorktree(options: CreateWorktreeOptions): Promise<WorktreeInfo> {
  const { projectPath, taskId, branchName, worktreePath, baseBranch, force = false } = options;

  const repoRoot = await validateGitRepo(projectPath);
  const worktreeBranch = generateDoorwayBranch(taskId) + (branchName ? `/${branchName}` : '');
  const actualWorktreePath = worktreePath ?? generateWorktreePath(projectPath, taskId, branchName);

  // Check if branch already exists
  if (await branchExists(repoRoot, worktreeBranch)) {
    throw new WorktreeExistsError(`Branch ${worktreeBranch} already exists`);
  }

  // Ensure parent directory exists
  const parentDir = actualWorktreePath.split('/').slice(0, -1).join('/');
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  // Check if worktree path already exists
  if (existsSync(actualWorktreePath)) {
    throw new WorktreeExistsError(actualWorktreePath);
  }

  const args = ['add'];

  if (force) {
    args.push('--force');
  }

  args.push('-b', worktreeBranch);
  args.push(actualWorktreePath);

  if (baseBranch) {
    args.push(baseBranch);
  }

  const result = await gitWorktree(args, repoRoot);

  if (result.code !== 0) {
    throw new Error(`Failed to create worktree: ${result.stderr}`);
  }

  const worktreeId =
    `wt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` as WorktreeId;

  return {
    id: worktreeId,
    path: actualWorktreePath,
    branch: worktreeBranch,
    isMain: false,
    isActive: true,
  };
}

/**
 * List all Doorway worktrees in a project.
 */
export async function listDoorwayWorktrees(projectPath: string): Promise<readonly WorktreeInfo[]> {
  const repoRoot = await validateGitRepo(projectPath);

  const result = await gitWorktree(['list', '--porcelain'], repoRoot);

  if (result.code !== 0) {
    return [];
  }

  const worktrees: WorktreeInfo[] = [];
  const lines = result.stdout.split('\n');
  let currentPath = '';

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      currentPath = line.replace('worktree ', '');
    } else if (line.startsWith('branch ')) {
      const branch = line.replace('branch ', '');

      if (isDoorwayWorktree(branch)) {
        const id =
          `wt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` as WorktreeId;

        worktrees.push({
          id,
          path: currentPath,
          branch,
          isMain: branch.includes('main') || branch.includes('master'),
          isActive: true,
          isClean: (await getStatus(currentPath)).isClean,
        });
      }
    }
  }

  return worktrees;
}

/**
 * Get the status of a worktree.
 */
export async function getWorktreeStatus(worktreePath: string): Promise<{
  readonly exists: boolean;
  readonly isClean: boolean;
  readonly branch: string;
  readonly ahead: number;
  readonly behind: number;
}> {
  const exists = existsSync(worktreePath);

  if (!exists) {
    return {
      exists: false,
      isClean: false,
      branch: '',
      ahead: 0,
      behind: 0,
    };
  }

  const status = await getStatus(worktreePath);

  return {
    exists: true,
    isClean: status.isClean,
    branch: status.branch,
    ahead: status.ahead,
    behind: status.behind,
  };
}

/**
 * Archive (remove) a Doorway worktree safely.
 * Only removes worktrees that are Doorway-owned.
 */
export async function archiveWorktree(
  projectPath: string,
  worktreePath: string,
  options?: { force?: boolean; keepFiles?: boolean }
): Promise<void> {
  const repoRoot = await validateGitRepo(projectPath);

  // List worktrees to verify this is a Doorway worktree
  const worktrees = await listDoorwayWorktrees(projectPath);
  const worktree = worktrees.find((wt) => wt.path === worktreePath);

  if (!worktree) {
    // Try to check if it's a worktree at all
    const result = await gitWorktree(['list', '--porcelain'], repoRoot);
    const isWorktree = result.stdout.includes(worktreePath);

    if (!isWorktree) {
      throw new WorktreeNotFoundError(worktreePath);
    }

    // It's a worktree but not Doorway-owned - refuse to delete
    throw new Error(`Refusing to delete non-Doorway worktree: ${worktreePath}`);
  }

  const removeArgs = ['remove'];

  if (options?.force) {
    removeArgs.push('--force');
  }

  removeArgs.push(worktreePath);

  const result = await gitWorktree(removeArgs, repoRoot);

  if (result.code !== 0) {
    // If removal failed, try to remove the directory manually
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  }
}

export async function deleteDoorwayBranch(projectPath: string, branch: string): Promise<void> {
  const repoRoot = await validateGitRepo(projectPath);
  const normalized = doorwayBranchNameForDeletion(branch);
  const result = await gitCommand(['branch', '-d', normalized], repoRoot);
  if (result.code !== 0) {
    throw new Error(`Failed to delete Doorway branch ${normalized}: ${result.stderr}`);
  }
}

/**
 * Prune stale worktree references.
 */
export async function pruneWorktrees(projectPath: string): Promise<void> {
  const repoRoot = await validateGitRepo(projectPath);

  const result = await gitWorktree(['prune'], repoRoot);

  if (result.code !== 0) {
    throw new Error(`Failed to prune worktrees: ${result.stderr}`);
  }
}

/**
 * Check if there are uncommitted changes that need attention.
 */
export async function checkDirtyState(projectPath: string): Promise<{
  readonly isDirty: boolean;
  readonly message: string;
}> {
  const repoRoot = await validateGitRepo(projectPath);
  const status = await getStatus(repoRoot);

  if (!status.isClean) {
    return {
      isDirty: true,
      message: `Uncommitted changes: ${status.modified} modified, ${status.staged} staged, ${status.untracked} untracked`,
    };
  }

  return {
    isDirty: false,
    message: 'Working tree is clean',
  };
}

import type { GitEngine } from './git.js';

export class WorktreeManager {
  readonly gitEngine: GitEngine;

  constructor(gitEngine: GitEngine) {
    this.gitEngine = gitEngine;
  }

  async createWorktree(
    options: Omit<CreateWorktreeOptions, 'projectPath'> & { projectPath?: string }
  ): Promise<WorktreeInfo> {
    return createWorktree({
      ...options,
      projectPath: options.projectPath ?? this.gitEngine.cwd,
    });
  }

  async listWorktrees(projectPath?: string): Promise<readonly WorktreeInfo[]> {
    return listDoorwayWorktrees(projectPath ?? this.gitEngine.cwd);
  }

  async getWorktreeStatus(worktreePath: string): Promise<any> {
    return getWorktreeStatus(worktreePath);
  }

  async deleteWorktree(worktreePath: string, projectPath?: string): Promise<void> {
    return archiveWorktree(projectPath ?? this.gitEngine.cwd, worktreePath, { force: true });
  }

  async deleteDoorwayBranch(branch: string, projectPath?: string): Promise<void> {
    return deleteDoorwayBranch(projectPath ?? this.gitEngine.cwd, branch);
  }

  async pruneWorktrees(projectPath?: string): Promise<void> {
    return pruneWorktrees(projectPath ?? this.gitEngine.cwd);
  }

  async checkDirtyState(projectPath?: string): Promise<any> {
    return checkDirtyState(projectPath ?? this.gitEngine.cwd);
  }
}
