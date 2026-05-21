import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GitEngine, WorktreeManager, WorktreeInfo } from './index.js';
import type { TaskId, WorktreeId } from '@doorway/protocol';

const execFileAsync = promisify(execFile);

export interface IntegrationResult {
  readonly worktree: WorktreeInfo;
  readonly conflicts: string[];
}

/**
 * IntegrationBranchService
 *
 * Manages the hidden integration worktree where agent work is reconciled.
 */
export class IntegrationBranchService {
  constructor(
    private gitEngine: GitEngine,
    private worktreeManager: WorktreeManager
  ) {}

  /**
   * Create a hidden integration worktree from a base commit.
   */
  async createIntegrationWorktree(taskId: TaskId, baseCommitSha: string): Promise<WorktreeInfo> {
    const branchName = `doorway/integration/${taskId}`;

    // 1. Create the worktree
    return this.worktreeManager.createWorktree({
      taskId,
      branchName: 'integration',
      baseBranch: baseCommitSha,
      force: true,
    });
  }

  /**
   * Apply changes from multiple source worktrees into the integration worktree.
   * V1 uses simple git cherry-pick or patch apply.
   */
  async reconcile(integrationPath: string, sourceWorktreePaths: string[]): Promise<string[]> {
    const conflicts: string[] = [];

    for (const sourcePath of sourceWorktreePaths) {
      try {
        // Generate a patch from the source worktree changes
        const { stdout: patch } = await execFileAsync('git', ['diff', 'HEAD'], { cwd: sourcePath });

        if (!patch.trim()) continue;

        // Apply the patch through an on-disk diff because git apply expects a path.
        const patchPath = path.join(integrationPath, `.doorway-patch-${Date.now()}.diff`);
        await fs.writeFile(patchPath, patch);

        try {
          await execFileAsync('git', ['apply', '--3way', patchPath], {
            cwd: integrationPath,
          });
        } finally {
          if (existsSync(patchPath)) {
            await fs.unlink(patchPath);
          }
        }
      } catch (error) {
        conflicts.push(`Failed to apply changes from ${sourcePath}: ${String(error)}`);
      }
    }

    return conflicts;
  }

  /**
   * Run package manager install if dependency files changed.
   */
  async runInstall(integrationPath: string): Promise<void> {
    const lockFiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock'];
    const hasLockFile = lockFiles.some((f) => existsSync(path.join(integrationPath, f)));

    if (hasLockFile) {
      console.log('[Integration] Running fresh install...');
      // Logic to detect package manager and run install
      // For V1, we just attempt pnpm install as a default
      try {
        await execFileAsync('pnpm', ['install'], { cwd: integrationPath });
      } catch (error) {
        console.warn('[Integration] Install failed:', error);
      }
    }
  }

  /**
   * Run tests in the integration worktree.
   */
  async runTests(
    integrationPath: string,
    testCommand = 'pnpm test'
  ): Promise<{ passed: boolean; output: string }> {
    try {
      const [cmd, ...args] = testCommand.split(' ');
      const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: integrationPath });
      return { passed: true, output: stdout + stderr };
    } catch (error: any) {
      return { passed: false, output: error.stdout + error.stderr };
    }
  }
}
