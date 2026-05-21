/**
 * Merge Engine
 *
 * Executes merge operations with conflict detection and resolution.
 * Never auto-merges to main - always creates integration branch first.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { MergePlan, MergeResult, MergeItem, ConflictFile } from './types.js';
import {
  MergeConflictError,
  MergeFailedError,
  BranchNotFoundError,
  IntegrationBranchExistsError,
} from './errors.js';

const execFileAsync = promisify(execFile);

export interface MergeEngineOptions {
  cwd: string;
  dryRun?: boolean;
}

interface GitMergeResult {
  success: boolean;
  output: string;
  conflicts: readonly string[];
}

/**
 * Execute git merge and detect conflicts.
 */
async function gitMerge(
  cwd: string,
  sourceBranch: string,
  targetBranch: string
): Promise<GitMergeResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['merge', '--no-ff', sourceBranch], {
      cwd,
      encoding: 'utf-8',
    });

    return {
      success: true,
      output: stdout + stderr,
      conflicts: [],
    };
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; code?: number };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');

    // Check for conflicts
    const conflictPattern = /CONFLICT \(content\): (.+)/g;
    const conflicts: string[] = [];
    let match;
    while ((match = conflictPattern.exec(output)) !== null) {
      conflicts.push(match[1]!);
    }

    return {
      success: false,
      output,
      conflicts,
    };
  }
}

/**
 * Abort an in-progress merge.
 */
async function gitMergeAbort(cwd: string): Promise<void> {
  await execFileAsync('git', ['merge', '--abort'], { cwd, encoding: 'utf-8' });
}

function gitOutput(error: unknown): string {
  const execError = error as Error & { stdout?: string; stderr?: string };
  return (execError.stdout ?? '') + (execError.stderr ?? '');
}

function conflictsFromOutput(output: string): string[] {
  const conflictPattern = /CONFLICT \([^)]+\): .*? in (.+)/g;
  const conflicts: string[] = [];
  let match;
  while ((match = conflictPattern.exec(output)) !== null) {
    conflicts.push(match[1]!);
  }
  return conflicts;
}

async function conflictedFiles(cwd: string): Promise<readonly string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], {
      cwd,
      encoding: 'utf-8',
    });
    return stdout
      .split('\n')
      .map((path) => path.trim())
      .filter((path) => path.length > 0);
  } catch {
    return [];
  }
}

/**
 * Check if a branch exists.
 */
async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', branch], {
      cwd,
      encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new branch.
 */
async function createBranch(cwd: string, branch: string, startPoint?: string): Promise<void> {
  const args = ['checkout', '-b', branch];
  if (startPoint) {
    args.push(startPoint);
  }
  await execFileAsync('git', args, { cwd, encoding: 'utf-8' });
}

/**
 * Merge Engine for executing controlled merges.
 */
export class MergeEngine {
  private readonly cwd: string;
  private readonly dryRun: boolean;

  constructor(options: MergeEngineOptions) {
    this.cwd = options.cwd;
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Execute a merge plan.
   *
   * Key rules:
   * - Never merge directly to main/master
   * - Always create integration branch first
   * - Merge items sequentially to detect conflicts early
   * - Abort and report if any merge fails
   */
  async executeMerge(plan: MergePlan): Promise<MergeResult> {
    const mergedBranches: string[] = [];
    const allConflicts: ConflictFile[] = [];

    // Verify base branch exists
    if (!(await branchExists(this.cwd, plan.baseBranch))) {
      throw new BranchNotFoundError(plan.baseBranch);
    }

    // Check if integration branch already exists
    if (await branchExists(this.cwd, plan.integrationBranch)) {
      throw new IntegrationBranchExistsError(plan.integrationBranch);
    }

    if (this.dryRun) {
      return {
        planId: plan.id,
        status: 'pending',
        mergedBranches: plan.items.map((i) => i.sourceBranch),
        conflicts: [],
        summary: 'Dry run complete - no changes made',
      };
    }

    try {
      // Create integration branch from base
      await createBranch(this.cwd, plan.integrationBranch, plan.baseBranch);

      // Merge each approved item
      for (const item of plan.items) {
        const mergeResult = await this.mergeItem(item, plan.strategy);

        if (mergeResult.conflicts.length > 0) {
          // Record conflicts and abort
          const conflictDetails = await Promise.all(
            mergeResult.conflicts.map(async (path) => ({
              path,
              conflictMarkers: await this.getConflictMarkers(path),
            }))
          );
          allConflicts.push(...conflictDetails);

          await gitMergeAbort(this.cwd);

          throw new MergeConflictError(
            `Conflicts detected when merging ${item.sourceBranch}`,
            mergeResult.conflicts.map((p) => ({ path: p }))
          );
        }

        mergedBranches.push(item.sourceBranch);
      }

      return {
        planId: plan.id,
        status: 'success',
        mergedBranches,
        conflicts: allConflicts,
        summary: `Successfully merged ${mergedBranches.length} branches into ${plan.integrationBranch}`,
      };
    } catch (error) {
      if (error instanceof MergeConflictError) {
        return {
          planId: plan.id,
          status: 'conflict',
          mergedBranches,
          conflicts: allConflicts,
          summary: error.message,
        };
      }

      throw new MergeFailedError(
        `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
        { planId: plan.id }
      );
    }
  }

  /**
   * Merge a single item.
   */
  private async mergeItem(
    item: MergeItem,
    strategy: MergePlan['strategy']
  ): Promise<{
    success: boolean;
    conflicts: readonly string[];
  }> {
    if (strategy === 'cherry-pick') {
      return this.cherryPick(item);
    }
    return this.merge(item);
  }

  /**
   * Standard merge.
   */
  private async merge(item: MergeItem): Promise<{
    success: boolean;
    conflicts: readonly string[];
  }> {
    const result = await gitMerge(this.cwd, item.sourceBranch, item.targetBranch);
    return {
      success: result.success,
      conflicts: result.conflicts,
    };
  }

  /**
   * Cherry-pick merge.
   */
  private async cherryPick(item: MergeItem): Promise<{
    success: boolean;
    conflicts: readonly string[];
  }> {
    try {
      await execFileAsync('git', ['cherry-pick', item.sourceBranch], {
        cwd: this.cwd,
        encoding: 'utf-8',
      });
      return { success: true, conflicts: [] };
    } catch (error) {
      const execError = error as Error & { stderr?: string };
      const output = execError.stderr ?? '';

      // Check for conflicts
      const conflictPattern = /CONFLICT \(content\): (.+)/g;
      const conflicts: string[] = [];
      let match;
      while ((match = conflictPattern.exec(output)) !== null) {
        conflicts.push(match[1]!);
      }

      if (conflicts.length > 0) {
        await execFileAsync('git', ['cherry-pick', '--abort'], {
          cwd: this.cwd,
          encoding: 'utf-8',
        });
      }

      return { success: false, conflicts };
    }
  }

  /**
   * Get conflict markers for a file.
   */
  private async getConflictMarkers(path: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], {
        cwd: this.cwd,
        encoding: 'utf-8',
      });

      if (!stdout.includes(path)) {
        return undefined;
      }

      const { stdout: diff } = await execFileAsync('git', ['diff', path], {
        cwd: this.cwd,
        encoding: 'utf-8',
      });

      return diff || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Preview merge without executing.
   */
  async previewMerge(plan: MergePlan): Promise<{
    canMerge: boolean;
    potentialConflicts: readonly string[];
    message: string;
  }> {
    if (!(await branchExists(this.cwd, plan.baseBranch))) {
      return {
        canMerge: false,
        potentialConflicts: [],
        message: `Branch not found: ${plan.baseBranch}`,
      };
    }

    for (const item of plan.items) {
      if (!(await branchExists(this.cwd, item.sourceBranch))) {
        return {
          canMerge: false,
          potentialConflicts: [],
          message: `Branch not found: ${item.sourceBranch}`,
        };
      }
    }

    const scratchRoot = await mkdtemp(join(tmpdir(), 'doorway-merge-preview-'));
    const scratchWorktree = join(scratchRoot, 'worktree');

    try {
      await execFileAsync(
        'git',
        ['worktree', 'add', '--detach', scratchWorktree, plan.baseBranch],
        {
          cwd: this.cwd,
          encoding: 'utf-8',
        }
      );
      await execFileAsync('git', ['config', 'user.name', 'Doorway Merge Preview'], {
        cwd: scratchWorktree,
        encoding: 'utf-8',
      });
      await execFileAsync('git', ['config', 'user.email', 'doorway@example.invalid'], {
        cwd: scratchWorktree,
        encoding: 'utf-8',
      });

      for (const item of plan.items) {
        const args =
          plan.strategy === 'cherry-pick'
            ? ['cherry-pick', item.sourceBranch]
            : ['merge', '--no-ff', '--no-edit', item.sourceBranch];

        try {
          await execFileAsync('git', args, {
            cwd: scratchWorktree,
            encoding: 'utf-8',
          });
        } catch (error) {
          const output = gitOutput(error);
          const conflictedPaths = await conflictedFiles(scratchWorktree);
          const outputPaths = conflictsFromOutput(output);
          const potentialConflicts = [...new Set([...conflictedPaths, ...outputPaths])];

          return {
            canMerge: false,
            potentialConflicts,
            message: `Conflicts detected when merging ${item.sourceBranch}`,
          };
        }
      }

      return {
        canMerge: true,
        potentialConflicts: [],
        message: 'All branches can be merged without conflicts',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        canMerge: false,
        potentialConflicts: [],
        message,
      };
    } finally {
      await execFileAsync('git', ['worktree', 'remove', '--force', scratchWorktree], {
        cwd: this.cwd,
        encoding: 'utf-8',
      }).catch(() => undefined);
      await rm(scratchRoot, { recursive: true, force: true });
    }
  }
}

/**
 * Create a merge engine instance.
 */
export function createMergeEngine(options: MergeEngineOptions): MergeEngine {
  return new MergeEngine(options);
}
