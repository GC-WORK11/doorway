/**
 * Terminal Runtime Types
 */

import type {
  TerminalControlEvent,
  TerminalScreenSnapshot,
  TerminalSessionId,
  TerminalRuntime,
  TerminalStateDetection,
} from '@doorway/protocol';

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

export interface DecodedTranscriptChunk {
  readonly sessionId: TerminalSessionId;
  readonly sequence: number;
  readonly timestamp: Date;
  readonly text: string;
  readonly rawText: string;
  readonly controlEvents: readonly TerminalControlEvent[];
  readonly screenSnapshot: TerminalScreenSnapshot;
  readonly stateDetection: TerminalStateDetection;
  readonly isStdout: boolean;
  readonly isStderr: boolean;
}

export interface LaunchResult {
  readonly sessionId: TerminalSessionId;
  readonly pid: number;
  readonly exitCode?: number;
  readonly startedAt: Date;
}

/**
 * A self-contained terminal block representing one command interaction.
 * Models the Warp terminal block concept.
 */
export interface TerminalBlock {
  readonly id: string;
  readonly sessionId: TerminalSessionId;
  readonly index: number;
  readonly command: string;
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly exitCode?: number;
  readonly output: string;
  readonly outputHeight: number;
  readonly cwd?: string;
  readonly isStreaming: boolean;
  readonly isCollapsed: boolean;
}

/**
 * Events emitted by block-aware session tracking.
 */
export type BlockEvent =
  | { type: 'block_start'; block: TerminalBlock }
  | { type: 'block_data'; blockId: string; data: string }
  | { type: 'block_end'; blockId: string; exitCode: number }
  | { type: 'block_update'; block: TerminalBlock };

export interface BlockEventHandler {
  onBlockEvent(event: BlockEvent): void;
}
