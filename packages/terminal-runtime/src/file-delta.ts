import { watch, type FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { TerminalFileDeltaEntry, TerminalFileDeltaPhase } from '@doorway/protocol';

export interface FileSnapshotEntry {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export type FileSnapshot = ReadonlyMap<string, FileSnapshotEntry>;

export interface FileDeltaWatcherDelta {
  readonly rootPath: string;
  readonly phase: TerminalFileDeltaPhase;
  readonly changes: readonly TerminalFileDeltaEntry[];
  readonly snapshot: FileSnapshot;
}

export interface FileDeltaWatcher {
  readonly rootPath: string;
  flush(phase?: TerminalFileDeltaPhase): Promise<FileSnapshot>;
  close(): void;
}

export interface FileDeltaWatcherOptions {
  readonly rootPath: string;
  readonly debounceMs?: number;
  readonly onDelta: (delta: FileDeltaWatcherDelta) => void;
  readonly onError: (error: Error) => void;
}

const IGNORED_NAMES = new Set([
  '.git',
  '.doorway',
  'node_modules',
  'dist',
  'build',
  '.turbo',
  '.next',
  'coverage',
]);

export async function startFileDeltaWatcher(
  options: FileDeltaWatcherOptions
): Promise<FileDeltaWatcher> {
  let baseline = await snapshotFiles(options.rootPath);
  let closed = false;
  let debounceTimer: NodeJS.Timeout | undefined;
  let captureQueue: Promise<void> = Promise.resolve();
  const debounceMs = options.debounceMs ?? 150;

  options.onDelta({
    rootPath: options.rootPath,
    phase: 'baseline',
    changes: [],
    snapshot: baseline,
  });

  const watcher = watchDirectory(options.rootPath, (filename) => {
    if (closed || isIgnoredRelativePath(filename)) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      captureQueue = captureQueue
        .then(async () => {
          await capture('running');
        })
        .catch(options.onError);
    }, debounceMs);
  });

  watcher.on('error', options.onError);
  watcher.unref();

  async function capture(phase: TerminalFileDeltaPhase): Promise<FileSnapshot> {
    if (closed && phase !== 'stopped') {
      return baseline;
    }
    const current = await snapshotFiles(options.rootPath);
    const changes = diffFileSnapshots(baseline, current);
    baseline = current;
    if (changes.length > 0 || phase === 'stopped') {
      options.onDelta({
        rootPath: options.rootPath,
        phase,
        changes,
        snapshot: current,
      });
    }
    return current;
  }

  return {
    rootPath: options.rootPath,
    async flush(phase: TerminalFileDeltaPhase = 'running'): Promise<FileSnapshot> {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      await captureQueue;
      return capture(phase);
    },
    close(): void {
      closed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      watcher.close();
    },
  };
}

export async function snapshotFiles(rootPath: string): Promise<FileSnapshot> {
  const entries = new Map<string, FileSnapshotEntry>();
  await walk(rootPath, rootPath, entries);
  return entries;
}

export function diffFileSnapshots(
  before: FileSnapshot,
  after: FileSnapshot
): readonly TerminalFileDeltaEntry[] {
  const changes: TerminalFileDeltaEntry[] = [];

  for (const [path, current] of after) {
    const previous = before.get(path);
    if (!previous) {
      changes.push({ path, changeType: 'created', currentSize: current.size });
      continue;
    }
    if (previous.size !== current.size || previous.mtimeMs !== current.mtimeMs) {
      changes.push({
        path,
        changeType: 'modified',
        previousSize: previous.size,
        currentSize: current.size,
      });
    }
  }

  for (const [path, previous] of before) {
    if (!after.has(path)) {
      changes.push({ path, changeType: 'deleted', previousSize: previous.size });
    }
  }

  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

function watchDirectory(rootPath: string, onChange: (filename: string | null) => void): FSWatcher {
  return watch(rootPath, { recursive: true }, (_eventType, filename) => {
    onChange(filename ? String(filename) : null);
  });
}

function isIgnoredRelativePath(filename: string | null): boolean {
  if (!filename) {
    return false;
  }
  return filename.split(/[\\/]/).some((segment) => IGNORED_NAMES.has(segment));
}

async function walk(
  rootPath: string,
  currentPath: string,
  entries: Map<string, FileSnapshotEntry>
): Promise<void> {
  let children;
  try {
    children = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const child of children) {
    if (IGNORED_NAMES.has(child.name)) {
      continue;
    }
    const childPath = join(currentPath, child.name);
    if (child.isDirectory()) {
      await walk(rootPath, childPath, entries);
      continue;
    }
    if (!child.isFile()) {
      continue;
    }
    try {
      const fileStat = await stat(childPath);
      const relativePath = relative(rootPath, childPath);
      entries.set(relativePath, {
        path: relativePath,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
      });
    } catch {
      continue;
    }
  }
}
