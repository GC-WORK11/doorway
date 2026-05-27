import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPty } from 'node-pty';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node-pty', () => ({
  spawn: spawnMock,
}));

import { PtyBackend } from './pty-backend.js';
import { WriteError } from './errors.js';

describe('PtyBackend', () => {
  let ptyProcess: FakePty;

  beforeEach(() => {
    spawnMock.mockReset();
    ptyProcess = fakePty();
    spawnMock.mockReturnValue(ptyProcess);
  });

  it('spawns terminals with Doorway Layer 1 default dimensions and env', async () => {
    const backend = new PtyBackend();

    await backend.createSession({ cwd: '/repo' });

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({
        name: 'xterm-256color',
        cols: 220,
        rows: 50,
        cwd: '/repo',
        env: expect.objectContaining({
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          TERM_PROGRAM: 'doorway',
          COLUMNS: '220',
          LINES: '50',
        }),
      })
    );
  });

  it('keeps explicit dimensions authoritative in the spawned env', async () => {
    const backend = new PtyBackend({ defaultCols: 180, defaultRows: 40 });

    await backend.createSession({
      cwd: '/repo',
      cols: 132,
      rows: 43,
      env: {
        TERM_PROGRAM: 'custom-doorway',
        COLUMNS: '999',
        LINES: '999',
      },
    });

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({
        cols: 132,
        rows: 43,
        env: expect.objectContaining({
          TERM_PROGRAM: 'custom-doorway',
          COLUMNS: '132',
          LINES: '43',
        }),
      })
    );
  });

  it('normalizes numeric exit signals before notifying subscribers', async () => {
    const backend = new PtyBackend();
    const session = await backend.createSession({ cwd: '/repo' });
    const exits: Array<{ readonly exitCode: number; readonly signal: string | null }> = [];

    session.onExit((exitCode, signal) => {
      exits.push({ exitCode, signal });
    });

    ptyProcess.emitExit({ exitCode: 137, signal: 9 });

    expect(exits).toEqual([{ exitCode: 137, signal: 'SIGKILL' }]);
  });

  it('treats node-pty signal 0 as no exit signal', async () => {
    const backend = new PtyBackend();
    const session = await backend.createSession({ cwd: '/repo' });
    const exits: Array<{ readonly exitCode: number; readonly signal: string | null }> = [];

    session.onExit((exitCode, signal) => {
      exits.push({ exitCode, signal });
    });

    ptyProcess.emitExit({ exitCode: 0, signal: 0 });

    expect(exits).toEqual([{ exitCode: 0, signal: null }]);
  });

  it('wraps PTY write failures as WriteError', async () => {
    const backend = new PtyBackend();
    const session = await backend.createSession({ cwd: '/repo' });
    vi.mocked(ptyProcess.write).mockImplementation(() => {
      throw new Error('EPIPE');
    });

    expect(() => session.write('input\n')).toThrow(WriteError);
    expect(() => session.write('input\n')).toThrow('EPIPE');
  });
});

interface FakePty extends IPty {
  emitExit(event: { readonly exitCode: number; readonly signal?: number | string }): void;
}

function fakePty(): FakePty {
  let exitHandler: ((event: { readonly exitCode: number; readonly signal?: number | string }) => void) | null =
    null;
  return {
    pid: 1234,
    fd: 1,
    process: 'bash',
    handleFlowControl: false,
    onData: vi.fn(),
    onExit: vi.fn((handler) => {
      exitHandler = handler as (event: { readonly exitCode: number; readonly signal?: number | string }) => void;
      return { dispose: vi.fn() };
    }),
    resize: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    emitExit(event) {
      exitHandler?.(event);
    },
  } as unknown as FakePty;
}
