/**
 * Terminal Session Manager
 *
 * High-level API for managing terminal sessions, capturing transcripts,
 * and handling the complete lifecycle.
 */

import type { TerminalSessionId, TerminalRuntime, TranscriptChunk } from '@doorway/protocol';
import type {
  TerminalBackend,
  CreateSessionOptions,
  TerminalSessionHandle,
  LaunchResult,
} from './types.js';
import { PtyBackend, createPtyBackend } from './pty-backend.js';
import { SessionNotFoundError, SessionAlreadyRunningError } from './errors.js';

export interface SessionManagerOptions {
  readonly backend?: TerminalBackend;
  readonly defaultCols?: number;
  readonly defaultRows?: number;
}

interface ActiveSession {
  readonly id: TerminalSessionId;
  readonly handle: TerminalSessionHandle;
  readonly runtime: TerminalRuntime;
  readonly cwd: string;
  readonly startedAt: Date;
  transcript: TranscriptChunk[];
  transcriptSequence: number;
}

/**
 * Manages terminal sessions with transcript capture and lifecycle management.
 */
export class SessionManager {
  private readonly backend: TerminalBackend;
  private readonly sessions: Map<string, ActiveSession> = new Map();
  private readonly dataCallbacks: Set<(sessionId: TerminalSessionId, data: string) => void> =
    new Set();
  private readonly exitCallbacks: Set<
    (sessionId: TerminalSessionId, exitCode: number, signal: string | null) => void
  > = new Set();

  constructor(options: SessionManagerOptions = {}) {
    this.backend =
      options.backend ??
      createPtyBackend({
        defaultCols: options.defaultCols,
        defaultRows: options.defaultRows,
      });
  }

  /**
   * Launch a command in a new terminal session.
   *
   * Note: For running specific commands, use launchCommand() instead.
   * This method creates an interactive shell session.
   */
  async launch(options: CreateSessionOptions): Promise<LaunchResult> {
    const { cwd, env } = options;

    // Note: We allow multiple sessions in same cwd for parallel agent runs
    // The SessionAlreadyRunningError check was too restrictive for Doorway's use case

    const handle = await this.backend.createSession({ cwd, env });
    const sessionId = handle.id;

    const session: ActiveSession = {
      id: sessionId,
      handle,
      runtime: this.backend.name,
      cwd,
      startedAt: new Date(),
      transcript: [],
      transcriptSequence: 0,
    };

    this.sessions.set(sessionId, session);

    // Capture output to transcript
    handle.onData((data) => {
      const chunk: TranscriptChunk = {
        sessionId,
        sequence: session.transcriptSequence++,
        timestamp: new Date(),
        text: data,
        isStdout: true,
        isStderr: false,
      };
      session.transcript.push(chunk);
      for (const callback of this.dataCallbacks) {
        callback(sessionId, data);
      }
    });

    handle.onExit((exitCode, signal) => {
      for (const callback of this.exitCallbacks) {
        callback(sessionId, exitCode, signal);
      }
      this.sessions.delete(sessionId);
    });

    return {
      sessionId,
      pid: handle.pid,
      startedAt: session.startedAt,
    };
  }

  /**
   * Launch a specific command in a new terminal session.
   */
  async launchCommand(
    command: string,
    args: readonly string[] = [],
    options: CreateSessionOptions
  ): Promise<LaunchResult> {
    const session = await this.launch(options);

    // Send the command
    const fullCommand = [command, ...args].join(' ') + '\n';
    this.sendInput(session.sessionId, fullCommand);

    return session;
  }

  /**
   * Send input to a terminal session.
   */
  sendInput(sessionId: TerminalSessionId, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    session.handle.write(data);
  }

  /**
   * Resize a terminal session.
   */
  resize(sessionId: TerminalSessionId, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    session.handle.resize(cols, rows);
  }

  /**
   * Get the transcript for a session.
   */
  getTranscript(sessionId: TerminalSessionId): readonly TranscriptChunk[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return session.transcript;
  }

  /**
   * Get the full output buffer for a session.
   */
  getOutput(sessionId: TerminalSessionId): string {
    const transcript = this.getTranscript(sessionId);
    return transcript.map((chunk) => chunk.text).join('');
  }

  /**
   * Stop a terminal session.
   */
  stop(sessionId: TerminalSessionId, signal: number = 15): number {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    session.handle.kill(signal);

    return 0; // Exit code will be reported via onExit callback
  }

  /**
   * Check if a session is running.
   */
  isRunning(sessionId: TerminalSessionId): boolean {
    return this.sessions.has(sessionId);
  }

  hasSession(sessionId: TerminalSessionId): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * List all active sessions.
   */
  listSessions(): readonly TerminalSessionId[] {
    return Array.from(this.sessions.keys()) as unknown as readonly TerminalSessionId[];
  }

  /**
   * Subscribe to terminal output for all active and future sessions.
   */
  onData(callback: (sessionId: TerminalSessionId, data: string) => void): () => void {
    this.dataCallbacks.add(callback);
    return () => {
      this.dataCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to terminal exits for all active and future sessions.
   */
  onExit(
    callback: (sessionId: TerminalSessionId, exitCode: number, signal: string | null) => void
  ): () => void {
    this.exitCallbacks.add(callback);
    return () => {
      this.exitCallbacks.delete(callback);
    };
  }

  /**
   * Get session info.
   */
  getSessionInfo(sessionId: TerminalSessionId):
    | {
        readonly id: TerminalSessionId;
        readonly runtime: TerminalRuntime;
        readonly cwd: string;
        readonly startedAt: Date;
        readonly transcriptLength: number;
      }
    | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    return {
      id: session.id,
      runtime: session.runtime,
      cwd: session.cwd,
      startedAt: session.startedAt,
      transcriptLength: session.transcript.length,
    };
  }

  /**
   * Close a session and clean up resources.
   */
  close(sessionId: TerminalSessionId): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return; // Already closed or never existed
    }

    try {
      session.handle.kill(9); // SIGKILL
    } catch {
      // Process may already be dead
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Close all sessions and clean up.
   */
  closeAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.close(sessionId as TerminalSessionId);
    }
  }
}

/**
 * Create a session manager instance.
 */
export function createSessionManager(options?: SessionManagerOptions): SessionManager {
  return new SessionManager(options);
}
