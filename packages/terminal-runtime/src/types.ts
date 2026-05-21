/**
 * Terminal Runtime Types
 */

import type { TerminalSessionId, TerminalRuntime } from '@doorway/protocol';

export interface TerminalBackend {
  readonly name: TerminalRuntime;
  createSession(options: CreateSessionOptions): Promise<TerminalSessionHandle>;
  listSessions(): Promise<readonly TerminalSessionInfo[]>;
}

export interface CreateSessionOptions {
  readonly cwd: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly env?: Record<string, string>;
}

export interface TerminalSessionHandle {
  readonly id: TerminalSessionId;
  readonly pid: number;
  readonly fd: number;

  resize(cols: number, rows: number): void;
  write(data: string): void;
  onData(callback: (data: string) => void): () => void;
  onExit(callback: (exitCode: number, signal: string | null) => void): () => void;
  kill(signal?: number): void;
}

export interface TerminalSessionInfo {
  readonly id: string;
  readonly pid: number;
  readonly name: string;
  readonly cwd: string;
}

export interface TranscriptChunk {
  readonly sessionId: TerminalSessionId;
  readonly sequence: number;
  readonly timestamp: Date;
  readonly text: string;
  readonly isStdout: boolean;
  readonly isStderr: boolean;
}

export interface LaunchResult {
  readonly sessionId: TerminalSessionId;
  readonly pid: number;
  readonly exitCode?: number;
  readonly startedAt: Date;
}
