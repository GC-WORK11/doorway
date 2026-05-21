import { describe, expect, it } from 'vitest';
import type { ProjectId, TerminalSessionId, ThreadId, ThreadProjection } from '@doorway/protocol';
import {
  appendRetained,
  createUnavailableDoorwayAPI,
  launchThreadRefreshId,
  mergeLiveTerminalChunk,
  mergeLaunchedThreadList,
  permissionDecisionTerminalInput,
} from './hooks';

describe('appendRetained', () => {
  it('keeps the newest items inside the configured buffer size', () => {
    expect(appendRetained([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    expect(appendRetained([1, 2, 3], 4, 1)).toEqual([4]);
  });
});

describe('permissionDecisionTerminalInput', () => {
  it('maps explicit approval decisions to terminal prompt answers', () => {
    expect(permissionDecisionTerminalInput('approved')).toBe('y\n');
    expect(permissionDecisionTerminalInput('denied')).toBe('n\n');
  });
});

describe('mergeLiveTerminalChunk', () => {
  it('appends persisted live terminal chunks without reloading transcript state', () => {
    const sessionId = 'term_live';
    const first = terminalChunk(sessionId, 0, 'pnpm test\n');
    const second = terminalChunk(sessionId, 1, 'PASS\n');

    expect(
      mergeLiveTerminalChunk([first], {
        sessionId,
        data: second.text,
        chunk: second,
      })
    ).toEqual([first, second]);
  });

  it('replaces duplicate live chunks and ignores unpersisted or mismatched payloads', () => {
    const sessionId = 'term_live';
    const first = terminalChunk(sessionId, 0, 'old\n');
    const replacement = terminalChunk(sessionId, 0, 'new\n');

    expect(
      mergeLiveTerminalChunk([first], {
        sessionId,
        data: replacement.text,
        chunk: replacement,
      })
    ).toEqual([replacement]);
    expect(mergeLiveTerminalChunk([first], { sessionId, data: 'raw\n' })).toEqual([first]);
    expect(
      mergeLiveTerminalChunk([first], {
        sessionId,
        data: 'foreign\n',
        chunk: terminalChunk('term_other', 1, 'foreign\n'),
      })
    ).toEqual([first]);
  });
});

describe('launch thread refresh helpers', () => {
  const projectId = 'project_doorway' as ProjectId;
  const existingThread = threadProjection('thread_existing' as ThreadId, projectId, 'Existing');
  const launchedThread = threadProjection('thread_auto' as ThreadId, projectId, 'Auto created');

  it('uses the auto-created thread id when launching without an active thread', () => {
    expect(launchThreadRefreshId(null, launchedThread.id)).toBe(launchedThread.id);
    expect(launchThreadRefreshId(existingThread, launchedThread.id)).toBe(existingThread.id);
    expect(launchThreadRefreshId(null, undefined)).toBeUndefined();
  });

  it('adds the fetched launched thread once to renderer thread state', () => {
    expect(mergeLaunchedThreadList([existingThread], launchedThread)).toEqual([
      launchedThread,
      existingThread,
    ]);
    expect(mergeLaunchedThreadList([launchedThread, existingThread], launchedThread)).toEqual([
      launchedThread,
      existingThread,
    ]);
  });
});

describe('createUnavailableDoorwayAPI', () => {
  it('returns honest empty projections instead of fake production state', async () => {
    const api = createUnavailableDoorwayAPI();

    await expect(api.listProjects()).resolves.toEqual([]);
    await expect(api.listProviderModels()).resolves.toEqual([]);
    await expect(api.listToolCapabilities()).resolves.toEqual([]);
    await expect(api.listThreads()).resolves.toEqual([]);
    await expect(api.listWorktrees()).resolves.toEqual([]);
    await expect(api.getTerminalTranscript('missing' as never)).resolves.toEqual([]);
    await expect(api.getThreadOperationalMemory('thread_empty')).resolves.toMatchObject({
      threadId: 'thread_empty',
      observedCommands: [],
      repeatedCommands: [],
    });
  });

  it('fails actions that require the Electron backend bridge', async () => {
    const api = createUnavailableDoorwayAPI();

    await expect(api.openProject({ path: '/repo' })).rejects.toThrow(
      'Doorway backend bridge is not available for openProject'
    );
    await expect(api.createTerminal()).rejects.toThrow(
      'Doorway backend bridge is not available for createTerminal'
    );
  });
});

function threadProjection(id: ThreadId, projectId: ProjectId, title: string): ThreadProjection {
  return {
    id,
    projectId,
    title,
    status: 'active',
    createdAt: new Date('2026-05-18T01:00:00.000Z'),
    updatedAt: new Date('2026-05-18T01:00:00.000Z'),
  } satisfies ThreadProjection;
}

function terminalChunk(sessionId: string, sequence: number, text: string) {
  return {
    sessionId: sessionId as TerminalSessionId,
    sequence,
    timestamp: new Date('2026-05-21T01:00:00.000Z'),
    text,
    isStdout: true,
    isStderr: false,
  };
}
