import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentRunId, TaskId } from '@doorway/protocol';
import { createMergeEngine } from './merge-engine.js';
import type { MergePlan } from './types.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], { cwd, encoding: 'utf-8' });
  return stdout;
}

async function createRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'doorway-review-merge-'));
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Doorway Test']);
  await git(repo, ['config', 'user.email', 'doorway-test@example.invalid']);
  await writeFile(join(repo, 'app.txt'), 'base\n', 'utf-8');
  await git(repo, ['add', 'app.txt']);
  await git(repo, ['commit', '-m', 'initial']);
  return repo;
}

function plan(sourceBranch: string): MergePlan {
  return {
    id: `plan-${sourceBranch}`,
    taskId: 'task_review_merge' as TaskId,
    integrationBranch: `doorway/preview/${sourceBranch}`,
    baseBranch: 'main',
    items: [
      {
        runId: `run_${sourceBranch}` as AgentRunId,
        sourceBranch,
        targetBranch: 'main',
        status: 'pending',
        changes: [],
      },
    ],
    strategy: 'sequential',
    status: 'pending',
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
  };
}

describe('MergeEngine.previewMerge', () => {
  const repos: string[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((repo) => rm(repo, { recursive: true, force: true })));
  });

  it('reports a clean branch as mergeable without changing the caller worktree', async () => {
    const repo = await createRepo();
    repos.push(repo);
    await git(repo, ['checkout', '-b', 'feature-clean']);
    await writeFile(join(repo, 'feature.txt'), 'feature\n', 'utf-8');
    await git(repo, ['add', 'feature.txt']);
    await git(repo, ['commit', '-m', 'add feature file']);
    await git(repo, ['checkout', 'main']);

    const result = await createMergeEngine({ cwd: repo }).previewMerge(plan('feature-clean'));

    expect(result.canMerge).toBe(true);
    expect(result.potentialConflicts).toEqual([]);
    expect((await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()).toBe('main');
    expect(await git(repo, ['branch', '--list', 'doorway/preview/feature-clean'])).toBe('');
  });

  it('reports conflicting files from an isolated merge attempt', async () => {
    const repo = await createRepo();
    repos.push(repo);
    await git(repo, ['checkout', '-b', 'feature-conflict']);
    await writeFile(join(repo, 'app.txt'), 'feature\n', 'utf-8');
    await git(repo, ['add', 'app.txt']);
    await git(repo, ['commit', '-m', 'change app on feature']);
    await git(repo, ['checkout', 'main']);
    await writeFile(join(repo, 'app.txt'), 'main\n', 'utf-8');
    await git(repo, ['add', 'app.txt']);
    await git(repo, ['commit', '-m', 'change app on main']);

    const result = await createMergeEngine({ cwd: repo }).previewMerge(plan('feature-conflict'));

    expect(result.canMerge).toBe(false);
    expect(result.potentialConflicts).toContain('app.txt');
    expect(result.message).toContain('Conflicts detected');
    expect((await git(repo, ['status', '--short'])).trim()).toBe('');
  });
});
