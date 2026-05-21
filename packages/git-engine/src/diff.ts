/**
 * Diff Operations
 *
 * Get git diffs for worktrees and branches.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface FileDiff {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  readonly additions: number;
  readonly deletions: number;
  readonly patch?: string;
}

export interface DiffResult {
  readonly files: readonly FileDiff[];
  readonly totalAdditions: number;
  readonly totalDeletions: number;
  readonly summary: string;
}

/**
 * Execute git diff command.
 */
async function gitDiff(
  args: readonly string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = (await execFileAsync('git', ['diff', ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
    })) as { stdout: string; stderr: string };
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
      code: execError.code ?? 1,
    };
  }
}

/**
 * Parse a diff --stat line.
 */
function parseStatLine(line: string): { path: string; additions: number; deletions: number } {
  // Format: "file/path | 10 ++ | 5 --" or similar
  const match = line.match(/^(.+?)\s+\|\s+(\d+)\s+\+\+\s*\|\s+(\d+)\s+--/);
  if (match) {
    return {
      path: match[1]!.trim(),
      additions: parseInt(match[2]!, 10),
      deletions: parseInt(match[3]!, 10),
    };
  }

  // Fallback for other formats
  const simpleMatch = line.match(/^(.+?)\s+\|\s+(\d+)/);
  if (simpleMatch) {
    return {
      path: simpleMatch[1]!.trim(),
      additions: 0,
      deletions: parseInt(simpleMatch[2]!, 10),
    };
  }

  return { path: line, additions: 0, deletions: 0 };
}

/**
 * Get diff statistics for a worktree or between commits.
 */
export async function getDiffStat(
  cwd: string,
  options?: {
    base?: string;
    head?: string;
    paths?: readonly string[];
  }
): Promise<DiffResult> {
  const args = ['--stat=4096'];

  if (options?.base && options?.head) {
    args.push(`${options.base}...${options.head}`);
  } else if (options?.base) {
    args.push(options.base);
  } else if (options?.head) {
    args.push(options.head);
  }

  if (options?.paths) {
    args.push('--', ...options.paths);
  }

  const result = await gitDiff(args, cwd);

  // Even with no changes, git returns 0
  const lines = result.stdout.split('\n').filter(Boolean);
  const files: FileDiff[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const line of lines) {
    if (line.includes('|')) {
      const stat = parseStatLine(line);
      files.push({
        path: stat.path,
        status: 'modified',
        additions: stat.additions,
        deletions: stat.deletions,
      });
      totalAdditions += stat.additions;
      totalDeletions += stat.deletions;
    }
  }

  const summary = `${files.length} file(s) changed, ${totalAdditions} insertions(+), ${totalDeletions} deletions(-)`;

  return {
    files,
    totalAdditions,
    totalDeletions,
    summary,
  };
}

/**
 * Get the full diff patch.
 */
export async function getDiffPatch(
  cwd: string,
  options?: {
    base?: string;
    head?: string;
    paths?: readonly string[];
    context?: number;
  }
): Promise<string> {
  const args = ['--patch'];

  if (options?.context !== undefined) {
    args.push(`-U${options.context}`);
  }

  if (options?.base && options?.head) {
    args.push(`${options.base}...${options.head}`);
  } else if (options?.base) {
    args.push(options.base);
  } else if (options?.head) {
    args.push(options.head);
  } else {
    args.push('HEAD');
  }

  if (options?.paths) {
    args.push('--', ...options.paths);
  }

  const result = await gitDiff(args, cwd);

  return result.stdout;
}

/**
 * Get diff for specific files.
 */
export async function getFileDiffs(
  cwd: string,
  files: readonly string[]
): Promise<readonly FileDiff[]> {
  if (files.length === 0) {
    return [];
  }

  const result = await gitDiff(['--stat', '--numstat', '--', ...files], cwd);

  const diffs: FileDiff[] = [];
  const lines = result.stdout.split('\n').filter(Boolean);

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const [additions, deletions, path] = parts;

      // Determine status based on path presence
      let status: FileDiff['status'] = 'modified';
      if (path.includes('(new file)')) {
        status = 'added';
      } else if (path.includes('(deleted)')) {
        status = 'deleted';
      } else if (path.includes('(renamed)')) {
        status = 'renamed';
      }

      diffs.push({
        path: path.replace(/\s*\(.*\)\s*$/, '').trim(),
        status,
        additions: parseInt(additions ?? '0', 10),
        deletions: parseInt(deletions ?? '0', 10),
      });
    }
  }

  return diffs;
}

/**
 * Check if there are changes compared to a base.
 */
export async function hasChanges(cwd: string, base: string = 'HEAD'): Promise<boolean> {
  const result = await gitDiff(['--quiet', base], cwd);
  return result.code !== 0;
}

/**
 * Get list of changed files.
 */
export async function getChangedFiles(
  cwd: string,
  options?: {
    staged?: boolean;
    base?: string;
    paths?: readonly string[];
  }
): Promise<readonly string[]> {
  const args = ['diff', '--name-only'];

  if (options?.staged) {
    args.unshift('diff', '--cached', '--name-only');
  } else if (options?.base) {
    args.push(options.base);
    if (options.paths) {
      args.push('--', ...options.paths);
    }
  }

  const result = await gitDiff(args, cwd);

  return result.stdout.split('\n').filter(Boolean);
}

/**
 * Get a summary of the diff for a capsule.
 */
export async function getDiffSummary(cwd: string, base?: string): Promise<string> {
  const diff = await getDiffStat(cwd, { base });

  if (diff.files.length === 0) {
    return 'No changes';
  }

  const fileList = diff.files
    .slice(0, 10)
    .map((f) => `  ${f.status}: ${f.path} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  const more = diff.files.length > 10 ? `\n  ... and ${diff.files.length - 10} more files` : '';

  return `${diff.summary}\n${fileList}${more}`;
}
