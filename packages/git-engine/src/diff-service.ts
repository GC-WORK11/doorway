import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitEngine } from './git.js';

const execFileAsync = promisify(execFile);

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  isHighRisk: boolean;
}

export interface WorktreeDiff {
  worktreeId: string;
  changes: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
}

/**
 * GitDiffService
 *
 * Computes real git diffs and detects high-risk changes.
 */
export class GitDiffService {
  constructor(private gitEngine: GitEngine) {}

  /**
   * Get all changes in a worktree compared to the main project branch.
   */
  async getWorktreeDiff(worktreePath: string, baseRef = 'main'): Promise<WorktreeDiff> {
    // 1. Get stats for all changed files
    const { stdout } = await execFileAsync('git', ['diff', '--numstat', baseRef], {
      cwd: worktreePath,
    });

    const lines = stdout.trim().split('\n').filter(Boolean);
    const changes: FileChange[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const line of lines) {
      const [add, del, filePath] = line.split('\t');
      const additions = parseInt(add, 10) || 0;
      const deletions = parseInt(del, 10) || 0;

      const status = await this.getFileStatus(worktreePath, filePath);
      const isHighRisk = this.checkRisk(filePath);

      changes.push({
        path: filePath,
        status,
        additions,
        deletions,
        isHighRisk,
      });

      totalAdditions += additions;
      totalDeletions += deletions;
    }

    return {
      worktreeId: worktreePath.split('/').pop() || 'unknown',
      changes,
      totalAdditions,
      totalDeletions,
    };
  }

  /**
   * Get unified diff for a specific file.
   */
  async getFileDiff(worktreePath: string, filePath: string, baseRef = 'main'): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['diff', baseRef, '--', filePath], {
        cwd: worktreePath,
      });
      return stdout;
    } catch {
      return '';
    }
  }

  async getRollbackPatch(worktreePath: string, baseRef = 'main'): Promise<string> {
    const { stdout } = await execFileAsync('git', ['diff', '--binary', '-R', baseRef], {
      cwd: worktreePath,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout;
  }

  private async getFileStatus(cwd: string, filePath: string): Promise<FileChange['status']> {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain', filePath], { cwd });
    const code = stdout.trim().slice(0, 2);

    if (code.includes('A')) return 'added';
    if (code.includes('D')) return 'deleted';
    if (code.includes('R')) return 'renamed';
    return 'modified';
  }

  private checkRisk(filePath: string): boolean {
    const highRiskPatterns = [
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      '.env',
      'migrations/',
      'infra/',
      'deployment/',
      '.doorway/',
    ];
    return highRiskPatterns.some((p) => filePath.includes(p));
  }
}
