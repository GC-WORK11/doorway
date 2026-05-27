/**
 * node-pty Backend for Terminal Runtime
 *
 * Provides a cross-platform PTY implementation using node-pty.
 * Supports Linux, macOS, and Windows (ConPTY).
 */

import * as pty from 'node-pty';
import type {
  TerminalBackend,
  CreateSessionOptions,
  TerminalSessionHandle,
  TerminalSessionInfo,
} from './types.js';
import type { TerminalSessionId, TerminalRuntime } from '@doorway/protocol';
import { PtyError, SessionNotFoundError, ResizeError, WriteError, KillError } from './errors.js';

export interface PtyBackendOptions {
  readonly shell?: string;
  readonly defaultCols?: number;
  readonly defaultRows?: number;
}

interface PtySession {
  readonly id: TerminalSessionId;
  pty: pty.IPty;
  readonly cwd: string;
  readonly startedAt: Date;
}

const DEFAULT_COLS = 220;
const DEFAULT_ROWS = 50;
const DEFAULT_SHELL = process.platform === 'win32' ? 'powershell.exe' : 'bash';

/**
 * PTY Backend implementation using node-pty
 */
export class PtyBackend implements TerminalBackend {
  readonly name: TerminalRuntime = 'pty';

  private readonly sessions: Map<string, PtySession> = new Map();
  private readonly shell: string;
  private readonly defaultCols: number;
  private readonly defaultRows: number;

  constructor(options: PtyBackendOptions = {}) {
    this.shell = options.shell ?? DEFAULT_SHELL;
    this.defaultCols = options.defaultCols ?? DEFAULT_COLS;
    this.defaultRows = options.defaultRows ?? DEFAULT_ROWS;
  }

  async createSession(options: CreateSessionOptions): Promise<TerminalSessionHandle> {
    const { cwd, cols = this.defaultCols, rows = this.defaultRows, env = {} } = options;

    const sessionId = this.generateSessionId();
    const mergedEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'doorway',
      ...env,
      COLUMNS: String(cols),
      LINES: String(rows),
    };

    let ptyProcess: pty.IPty;

    try {
      ptyProcess = pty.spawn(this.shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: mergedEnv,
      });
    } catch (error) {
      throw new PtyError(`Failed to spawn PTY: ${error}`, { error: String(error), cwd });
    }

    const session: PtySession = {
      id: sessionId as TerminalSessionId,
      pty: ptyProcess,
      cwd,
      startedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    return new PtySessionHandle(session, this.sessions);
  }

  async listSessions(): Promise<readonly TerminalSessionInfo[]> {
    const sessions: TerminalSessionInfo[] = [];

    for (const [id, session] of this.sessions) {
      sessions.push({
        id,
        pid: session.pty.pid,
        name: `doorway-${id.substring(0, 8)}`,
        cwd: session.cwd,
      });
    }

    return sessions;
  }

  getSession(sessionId: TerminalSessionId): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `term_${timestamp}_${random}`;
  }
}

/**
 * Handle for an active PTY session
 */
class PtySessionHandle implements TerminalSessionHandle {
  readonly id: TerminalSessionId;
  readonly pid: number;
  readonly fd: number;

  private readonly session: PtySession;
  private readonly sessions: Map<string, PtySession>;
  private readonly dataListeners: Set<(data: string) => void> = new Set();
  private readonly exitListeners: Set<(exitCode: number, signal: string | null) => void> =
    new Set();

  constructor(session: PtySession, sessions: Map<string, PtySession>) {
    this.session = session;
    this.sessions = sessions;
    this.id = session.id;
    this.pid = session.pty.pid;
    this.fd = (session.pty as { fd?: number }).fd ?? -1;

    // Forward data to listeners
    session.pty.onData((data: string) => {
      for (const listener of this.dataListeners) {
        try {
          listener(data);
        } catch {
          // Listener threw, ignore
        }
      }
    });

    // Forward exit to listeners
    session.pty.onExit(({ exitCode, signal }: { exitCode: number; signal?: number | string }) => {
      this.sessions.delete(this.id);
      for (const listener of this.exitListeners) {
        try {
          listener(exitCode ?? 0, signal !== undefined ? normalizeExitSignal(signal) : null);
        } catch {
          // Listener threw, ignore
        }
      }
    });
  }

  resize(cols: number, rows: number): void {
    try {
      this.session.pty.resize(cols, rows);
    } catch (error) {
      throw new ResizeError(`Failed to resize PTY: ${error}`, {
        sessionId: this.id,
        cols,
        rows,
      });
    }
  }

  write(data: string): void {
    try {
      this.session.pty.write(data);
    } catch (error) {
      throw new WriteError(`Failed to write to PTY: ${error}`, {
        sessionId: this.id,
      });
    }
  }

  onData(callback: (data: string) => void): () => void {
    this.dataListeners.add(callback);
    return () => {
      this.dataListeners.delete(callback);
    };
  }

  onExit(callback: (exitCode: number, signal: string | null) => void): () => void {
    this.exitListeners.add(callback);
    return () => {
      this.exitListeners.delete(callback);
    };
  }

  kill(signal: string | number = 'SIGTERM'): void {
    const signalStr = normalizeSignal(signal);
    try {
      this.session.pty.kill(signalStr);
    } catch (error) {
      const ctx: Record<string, string | number> = { sessionId: this.id, signal: signalStr };
      throw new KillError(`Failed to kill PTY: ${String(error)}`, ctx);
    }
  }
}

function normalizeSignal(signal: string | number): string {
  if (signal === 2) return 'SIGINT';
  if (signal === 9) return 'SIGKILL';
  if (signal === 15) return 'SIGTERM';
  return String(signal);
}

function normalizeExitSignal(signal: string | number): string | null {
  if (signal === 0 || signal === '0') return null;
  return normalizeSignal(signal);
}

/**
 * Create a PTY backend instance
 */
export function createPtyBackend(options?: PtyBackendOptions): PtyBackend {
  return new PtyBackend(options);
}
