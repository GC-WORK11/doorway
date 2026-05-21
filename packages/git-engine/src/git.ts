/**
 * Git Operations
 *
 * Core git commands using simple child_process spawning.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

export interface GitStatus {
  readonly branch: string;
  readonly isClean: boolean;
  readonly ahead: number;
  readonly behind: number;
  readonly staged: number;
  readonly modified: number;
  readonly untracked: number;
  readonly conflicted: number;
}

export interface BranchInfo {
  readonly name: string;
  readonly current: boolean;
  readonly tracking?: string;
}

/**
 * Execute a git command in a directory.
 */
async function git(
  args: readonly string[],
  cwd: string,
  options?: { ignoreStderr?: boolean }
): Promise<GitResult> {
  try {
    const result = (await execFileAsync('git', [...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
    })) as { stdout: string; stderr: string };

    return {
      stdout: result.stdout.trim(),
      stderr: (options?.ignoreStderr ? '' : result.stderr).trim(),
      code: 0,
    };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };
    return {
      stdout: '',
      stderr: execError.stderr ?? '',
      code: execError.code ?? 1,
    };
  }
}

/**
 * Check if a directory is a git repository.
 */
export async function isGitRepo(path: string): Promise<boolean> {
  const result = await git(['rev-parse', '--is-inside-work-tree'], path, { ignoreStderr: true });
  return result.code === 0 && result.stdout === 'true';
}

/**
 * Get the root of a git repository.
 */
export async function getRepoRoot(path: string): Promise<string> {
  const result = await git(['rev-parse', '--show-toplevel'], path);
  if (result.code !== 0) {
    throw new Error(`Not in a git repository: ${path}`);
  }
  return result.stdout;
}

/**
 * Get current branch name.
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await git(['branch', '--show-current'], cwd);
  if (result.code !== 0) {
    return 'HEAD';
  }
  return result.stdout || 'HEAD';
}

/**
 * Get git status.
 */
export async function getStatus(cwd: string): Promise<GitStatus> {
  const result = await git(['status', '--porcelain=v1', '-b'], cwd);

  const branch =
    result.stdout
      .split('\n')[0]
      ?.replace(/^##\s*/, '')
      .split('...')[0] ?? 'HEAD';

  let isClean = true;
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  let conflicted = 0;
  let ahead = 0;
  let behind = 0;

  for (const line of result.stdout.split('\n')) {
    if (!line || line.startsWith('##')) continue;

    const index = line[0] ?? ' ';
    const worktree = line[1] ?? ' ';
    const path = line.slice(3);

    if (path === '') continue;

    if (index === '?' && worktree === '?') {
      untracked++;
      isClean = false;
    } else if (index === 'U' || worktree === 'U' || (index === 'A' && worktree === 'A')) {
      conflicted++;
      isClean = false;
    } else if (index !== ' ' && index !== '?') {
      staged++;
      isClean = false;
    } else if (worktree !== ' ' && worktree !== '?') {
      modified++;
      isClean = false;
    }
  }

  // Parse ahead/behind from branch line
  const branchMatch = result.stdout.match(
    /\[ahead (\d+)(?:, behind (\d+))?\]|\[behind (\d+)(?:, ahead (\d+))?\]/
  );
  if (branchMatch) {
    if (branchMatch[1]) ahead = parseInt(branchMatch[1], 10);
    if (branchMatch[2]) behind = parseInt(branchMatch[2], 10);
    if (branchMatch[3]) behind = parseInt(branchMatch[3], 10);
    if (branchMatch[4]) ahead = parseInt(branchMatch[4], 10);
  }

  return {
    branch,
    isClean,
    ahead,
    behind,
    staged,
    modified,
    untracked,
    conflicted,
  };
}

/**
 * List all branches.
 */
export async function listBranches(cwd: string, all = false): Promise<readonly BranchInfo[]> {
  const args = ['branch', '--format=%(refname:short)|%(HEAD)|%(upstream:short)'];
  if (all) args.push('-a');

  const result = await git(args, cwd);
  if (result.code !== 0) {
    return [];
  }

  const branches: BranchInfo[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    const [name, current, tracking] = line.split('|');
    branches.push({
      name,
      current: current === '*',
      tracking: tracking || undefined,
    });
  }

  return branches;
}

/**
 * Check if a branch exists.
 */
export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await git(['rev-parse', '--verify', `--branch=${branch}`], cwd, {
    ignoreStderr: true,
  });
  return result.code === 0;
}

/**
 * Create a new branch.
 */
export async function createBranch(
  cwd: string,
  branch: string,
  startPoint?: string
): Promise<void> {
  const args = ['checkout', '-b', branch];
  if (startPoint) {
    args.push(startPoint);
  }

  const result = await git(args, cwd);
  if (result.code !== 0) {
    throw new Error(`Failed to create branch: ${result.stderr}`);
  }
}

/**
 * Checkout a branch or commit.
 */
export async function checkout(cwd: string, ref: string): Promise<void> {
  const result = await git(['checkout', ref], cwd);
  if (result.code !== 0) {
    throw new Error(`Failed to checkout: ${result.stderr}`);
  }
}

/**
 * Get remote name.
 */
export async function getRemote(cwd: string, remote = 'origin'): Promise<string | null> {
  const result = await git(['remote', 'get-url', remote], cwd, { ignoreStderr: true });
  return result.code === 0 ? result.stdout : null;
}

/**
 * Fetch from remote.
 */
export async function fetch(cwd: string, remote = 'origin', branch?: string): Promise<void> {
  const args = ['fetch', remote];
  if (branch) args.push(branch);

  const result = await git(args, cwd);
  if (result.code !== 0) {
    throw new Error(`Failed to fetch: ${result.stderr}`);
  }
}

export class GitEngine {
  readonly cwd: string;

  constructor(options: { cwd: string }) {
    this.cwd = options.cwd;
  }

  async isGitRepo(path?: string): Promise<boolean> {
    return isGitRepo(path ?? this.cwd);
  }

  async getRepoRoot(path?: string): Promise<string> {
    return getRepoRoot(path ?? this.cwd);
  }

  async getCurrentBranch(path?: string): Promise<string> {
    return getCurrentBranch(path ?? this.cwd);
  }

  async getStatus(path?: string): Promise<GitStatus> {
    return getStatus(path ?? this.cwd);
  }

  async listBranches(all = false, path?: string): Promise<readonly BranchInfo[]> {
    return listBranches(path ?? this.cwd, all);
  }

  async branchExists(branch: string, path?: string): Promise<boolean> {
    return branchExists(path ?? this.cwd, branch);
  }

  async createBranch(branch: string, startPoint?: string, path?: string): Promise<void> {
    return createBranch(path ?? this.cwd, branch, startPoint);
  }

  async checkout(ref: string, path?: string): Promise<void> {
    return checkout(path ?? this.cwd, ref);
  }

  async getRemote(remote = 'origin', path?: string): Promise<string | null> {
    return getRemote(path ?? this.cwd, remote);
  }

  async fetch(remote = 'origin', branch?: string, path?: string): Promise<void> {
    return fetch(path ?? this.cwd, remote, branch);
  }
}
