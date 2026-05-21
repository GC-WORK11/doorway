import { mkdir, rm, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { diffFileSnapshots, snapshotFiles, startFileDeltaWatcher } from './file-delta.js';

describe('file delta snapshots', () => {
  it('detects created, modified, and deleted files from real filesystem snapshots', async () => {
    const root = join(tmpdir(), `doorway-file-delta-${Date.now().toString(36)}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'modified.txt'), 'before');
    await writeFile(join(root, 'deleted.txt'), 'remove me');

    const before = await snapshotFiles(root);
    await writeFile(join(root, 'modified.txt'), 'after content');
    await writeFile(join(root, 'created.txt'), 'new');
    await unlink(join(root, 'deleted.txt'));
    const after = await snapshotFiles(root);

    expect(diffFileSnapshots(before, after)).toEqual([
      { path: 'created.txt', changeType: 'created', currentSize: 3 },
      { path: 'deleted.txt', changeType: 'deleted', previousSize: 9 },
      { path: 'modified.txt', changeType: 'modified', previousSize: 6, currentSize: 13 },
    ]);

    await rm(root, { recursive: true, force: true });
  });

  it('emits verified deltas from real filesystem watcher events', async () => {
    const root = join(tmpdir(), `doorway-file-watcher-${Date.now().toString(36)}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'existing.txt'), 'before');
    const deltas: Array<{ readonly phase: string; readonly paths: readonly string[] }> = [];
    const errors: Error[] = [];

    const watcher = await startFileDeltaWatcher({
      rootPath: root,
      debounceMs: 25,
      onDelta: (delta) => {
        deltas.push({
          phase: delta.phase,
          paths: delta.changes.map((change) => change.path),
        });
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    await writeFile(join(root, 'created.txt'), 'new file');
    await waitFor(() => deltas.some((delta) => delta.paths.includes('created.txt')));

    watcher.close();
    await rm(root, { recursive: true, force: true });

    expect(errors).toEqual([]);
    expect(deltas[0]).toEqual({ phase: 'baseline', paths: [] });
    expect(deltas.some((delta) => delta.phase === 'running')).toBe(true);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for file watcher event.');
}
