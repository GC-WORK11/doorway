/**
 * Terminal Session Manager
 *
 * High-level API for managing terminal sessions, capturing transcripts,
 * and handling the complete lifecycle.
 */

import { terminalSubmitInput } from '@doorway/protocol';
import type {
  TerminalSessionId,
  TerminalRuntime,
  TerminalStateDetection,
  TranscriptChunk,
} from '@doorway/protocol';
import type {
  TerminalBackend,
  CreateSessionOptions,
  TerminalSessionHandle,
  LaunchResult,
  BlockEvent,
  TerminalBlock,
  DecodedTranscriptChunk,
} from './types.js';
import { PtyBackend, createPtyBackend } from './pty-backend.js';
import { SessionNotFoundError, SessionAlreadyRunningError } from './errors.js';
import { BlockList } from './block-list.js';
import { classifyTerminalExit } from './exit-taxonomy.js';
import { TerminalDecoder } from './terminal-decoder.js';
import { TerminalStateDetector } from './state-detector.js';
import type { FaultRecoveryService } from '@doorway/core';
import { getFaultRecoveryService } from '@doorway/core';

export interface SessionManagerOptions {
  readonly backend?: TerminalBackend;
  readonly defaultCols?: number;
  readonly defaultRows?: number;
  readonly faultRecovery?: FaultRecoveryService;
  readonly sessionGracePeriodMs?: number;
  readonly stateConfirmationDelayMs?: number;
  readonly hangCheckIntervalMs?: number;
  readonly thinkingTimeoutMs?: number;
  readonly hardRecoveryDelayMs?: number;
  readonly shutdownGracePeriodMs?: number;
}

interface ActiveSession {
  readonly id: TerminalSessionId;
  readonly handle: TerminalSessionHandle;
  readonly runtime: TerminalRuntime;
  readonly cwd: string;
  readonly startedAt: Date;
  transcript: TranscriptChunk[];
  decodedTranscript: DecodedTranscriptChunk[];
  transcriptSequence: number;
  decodedTranscriptSequence: number;
  decoder: TerminalDecoder;
  stateDetector: TerminalStateDetector;
  blockList: BlockList;
  currentBlockId: string | null;
  pendingOutput: string;
  stateConfirmationTimer: ReturnType<typeof setTimeout> | null;
  hangWatchdogTimer: ReturnType<typeof setInterval> | null;
  shutdownTimer: ReturnType<typeof setTimeout> | null;
  lastOutputAt: Date;
  lastStateDetection: TerminalStateDetection | null;
  newlineRecoveryAttempted: boolean;
  hardRecoveryAttempted: boolean;
  pendingEchoes: PendingEcho[];
  blockEventHandlers: Set<(event: BlockEvent) => void>;
}

interface PendingEcho {
  remaining: string;
  expiresAt: number;
}

const ECHO_SUPPRESSION_TTL_MS = 2000;

/**
 * Manages terminal sessions with transcript capture and lifecycle management.
 */
export class SessionManager {
  private readonly backend: TerminalBackend;
  private readonly sessions: Map<string, ActiveSession> = new Map();
  private readonly dataCallbacks: Set<
    (sessionId: TerminalSessionId, data: string, decodedChunk?: DecodedTranscriptChunk) => void
  > = new Set();
  private readonly decodedDataCallbacks: Set<
    (sessionId: TerminalSessionId, chunk: DecodedTranscriptChunk) => void
  > = new Set();
  private readonly stateCallbacks: Set<
    (sessionId: TerminalSessionId, detection: TerminalStateDetection) => void
  > = new Set();
  private readonly exitCallbacks: Set<
    (sessionId: TerminalSessionId, exitCode: number, signal: string | null) => void
  > = new Set();
  private readonly blockEventCallbacks: Set<(sessionId: TerminalSessionId, event: BlockEvent) => void> =
    new Set();
  private readonly faultRecovery: FaultRecoveryService;
  private readonly sessionGracePeriodMs: number;
  private readonly stateConfirmationDelayMs: number;
  private readonly hangCheckIntervalMs: number;
  private readonly thinkingTimeoutMs: number;
  private readonly hardRecoveryDelayMs: number;
  private readonly shutdownGracePeriodMs: number;
  private readonly pendingDeletions: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(options: SessionManagerOptions = {}) {
    this.backend =
      options.backend ??
      createPtyBackend({
        defaultCols: options.defaultCols,
        defaultRows: options.defaultRows,
      });
    this.faultRecovery = options.faultRecovery ?? getFaultRecoveryService();
    this.sessionGracePeriodMs = options.sessionGracePeriodMs ?? 5000;
    this.stateConfirmationDelayMs = options.stateConfirmationDelayMs ?? 1000;
    this.hangCheckIntervalMs = options.hangCheckIntervalMs ?? 500;
    this.thinkingTimeoutMs = options.thinkingTimeoutMs ?? 30000;
    this.hardRecoveryDelayMs = options.hardRecoveryDelayMs ?? 5000;
    this.shutdownGracePeriodMs = options.shutdownGracePeriodMs ?? 5000;
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

    const blockList = new BlockList(sessionId);
    const session: ActiveSession = {
      id: sessionId,
      handle,
      runtime: this.backend.name,
      cwd,
      startedAt: new Date(),
      transcript: [],
      decodedTranscript: [],
      transcriptSequence: 0,
      decodedTranscriptSequence: 0,
      decoder: new TerminalDecoder(),
      stateDetector: new TerminalStateDetector(),
      blockList,
      currentBlockId: null,
      pendingOutput: '',
      stateConfirmationTimer: null,
      hangWatchdogTimer: null,
      shutdownTimer: null,
      lastOutputAt: new Date(),
      lastStateDetection: null,
      newlineRecoveryAttempted: false,
      hardRecoveryAttempted: false,
      pendingEchoes: [],
      blockEventHandlers: new Set(),
    };

    this.sessions.set(sessionId, session);
    this.startHangWatchdog(session);

    // Capture output to transcript and build blocks
    handle.onData((data) => {
      session.lastOutputAt = new Date();
      this.faultRecovery.heartbeat(sessionId, 'running');
      session.newlineRecoveryAttempted = false;
      session.hardRecoveryAttempted = false;
      const chunk: TranscriptChunk = {
        sessionId,
        sequence: session.transcriptSequence++,
        timestamp: new Date(),
        text: data,
        isStdout: true,
        isStderr: false,
      };
      session.transcript.push(chunk);

      const semanticData = this.suppressEcho(session, data);
      const decoded = session.decoder.decode(semanticData);
      let decodedChunk: DecodedTranscriptChunk | null = null;
      if (decoded.text.length > 0 || decoded.events.length > 0) {
        const stateDetection = session.stateDetector.update({
          text: decoded.text,
          rawText: data,
          controlEvents: decoded.events,
          isStderr: false,
        });
        session.lastStateDetection = stateDetection;
        decodedChunk = {
          sessionId,
          sequence: session.decodedTranscriptSequence++,
          timestamp: chunk.timestamp,
          text: decoded.text,
          rawText: data,
          controlEvents: decoded.events,
          screenSnapshot: decoded.screenSnapshot,
          stateDetection,
          isStdout: true,
          isStderr: false,
        };
        session.decodedTranscript.push(decodedChunk);
        this.scheduleStateConfirmation(session, stateDetection);
      }

      // Track block output
      this.handleBlockData(session, decoded.text);

      if (decodedChunk !== null) {
        for (const callback of this.decodedDataCallbacks) {
          callback(sessionId, decodedChunk);
        }
      }

      for (const callback of this.dataCallbacks) {
        callback(sessionId, data, decodedChunk ?? undefined);
      }
    });

    handle.onExit((exitCode, signal) => {
      this.clearSessionTimers(session);

      // Finalize current block if streaming
      if (session.currentBlockId !== null) {
        this.finalizeBlock(session, exitCode);
      }

      // Classify the exit for fault detection
      const classification = classifyTerminalExit({ exitCode, signal });

      // Notify exit callbacks (orchestrator handles fault recovery)
      for (const callback of this.exitCallbacks) {
        callback(sessionId, exitCode, signal);
      }

      // Schedule deletion after grace period to allow transcript queries
      this.scheduleDeletion(sessionId);
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
    const fullCommand = terminalSubmitInput([command, ...args].join(' '));
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

    const pendingEcho: PendingEcho = {
      remaining: data,
      expiresAt: Date.now() + ECHO_SUPPRESSION_TTL_MS,
    };

    session.pendingEchoes.push(pendingEcho);
    try {
      session.handle.write(data);
    } catch (error) {
      session.pendingEchoes = session.pendingEchoes.filter((echo) => echo !== pendingEcho);
      throw error;
    }
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
   * Resize every active terminal session to the shared panel dimensions.
   */
  resizeAll(cols: number, rows: number): void {
    for (const session of this.sessions.values()) {
      session.handle.resize(cols, rows);
    }
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
   * Get semantic output chunks with terminal control sequences removed.
   */
  getDecodedTranscript(sessionId: TerminalSessionId): readonly DecodedTranscriptChunk[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return session.decodedTranscript;
  }

  /**
   * Get the full output buffer for a session.
   */
  getOutput(sessionId: TerminalSessionId): string {
    const transcript = this.getTranscript(sessionId);
    return transcript.map((chunk) => chunk.text).join('');
  }

  /**
   * Get terminal output suitable for state detection and action parsing.
   */
  getCleanOutput(sessionId: TerminalSessionId): string {
    const transcript = this.getDecodedTranscript(sessionId);
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
    if (signal === 15 && this.shutdownGracePeriodMs > 0) {
      if (session.shutdownTimer) {
        clearTimeout(session.shutdownTimer);
      }
      session.shutdownTimer = setTimeout(() => {
        session.shutdownTimer = null;
        if (!this.sessions.has(sessionId)) return;
        session.handle.kill(9);
      }, this.shutdownGracePeriodMs);
    }

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
  onData(
    callback: (sessionId: TerminalSessionId, data: string, decodedChunk?: DecodedTranscriptChunk) => void
  ): () => void {
    this.dataCallbacks.add(callback);
    return () => {
      this.dataCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to semantic terminal output for all active and future sessions.
   */
  onDecodedData(
    callback: (sessionId: TerminalSessionId, chunk: DecodedTranscriptChunk) => void
  ): () => void {
    this.decodedDataCallbacks.add(callback);
    return () => {
      this.decodedDataCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to confirmed semantic terminal state transitions.
   */
  onStateChange(
    callback: (sessionId: TerminalSessionId, detection: TerminalStateDetection) => void
  ): () => void {
    this.stateCallbacks.add(callback);
    return () => {
      this.stateCallbacks.delete(callback);
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
        readonly decodedTranscriptLength: number;
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
      decodedTranscriptLength: session.decodedTranscript.length,
    };
  }

  /**
   * Detect if text looks like a command prompt (ends with $ # or > and has content before).
   */
  private isPrompt(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    // Common prompt patterns: user@host:path$, user@host:path#, path$, path>
    // We detect the prompt suffix and ensure there's actual content before it
    return /^[^\n$#>]+[$#>]\s*$/.test(trimmed) || /^[^\n$#>]+[$#>] $/.test(trimmed);
  }

  /**
   * Detect if text is likely a command (starts without prompt, contains letters).
   */
  private isCommand(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    // Ignore pure output or prompts
    if (this.isPrompt(trimmed)) return false;
    // Commands typically start with letters, ~, ., or common command chars
    return /^[a-zA-Z~./]/.test(trimmed);
  }

  /**
   * Handle incoming data for block building.
   */
  private handleBlockData(session: ActiveSession, data: string): void {
    if (data.length === 0) return;

    // If we're currently streaming a block, append to its output
    if (session.currentBlockId !== null) {
      session.pendingOutput += data;
      const block = session.blockList.updateBlock(session.currentBlockId, {
        output: session.pendingOutput,
      });
      if (block) {
        this.emitBlockEvent(session, { type: 'block_update', block });
        this.emitBlockEvent(session, { type: 'block_data', blockId: session.currentBlockId, data });
      }
      return;
    }

    // Check if this data starts a new command
    if (this.isCommand(data)) {
      this.startBlock(session, data);
    } else {
      // Accumulate non-command output (could be initial shell output)
      session.pendingOutput += data;
    }
  }

  private scheduleStateConfirmation(
    session: ActiveSession,
    detection: TerminalStateDetection
  ): void {
    if (session.stateConfirmationTimer) {
      clearTimeout(session.stateConfirmationTimer);
      session.stateConfirmationTimer = null;
    }

    if (detection.state !== 'awaiting_input' && detection.state !== 'complete') {
      return;
    }

    const delayMs = detection.state === 'awaiting_input' ? 500 : this.stateConfirmationDelayMs;
    session.stateConfirmationTimer = setTimeout(() => {
      session.stateConfirmationTimer = null;
      const confirmed = session.stateDetector.confirmSilence(delayMs);
      if (!confirmed) return;
      if (confirmed.state === 'awaiting_input' || confirmed.state === 'complete') {
        this.faultRecovery.updateStatus(session.id, 'waiting_input');
      }
      for (const callback of this.stateCallbacks) {
        callback(session.id, confirmed);
      }
    }, delayMs);
  }

  private suppressEcho(session: ActiveSession, data: string): string {
    const now = Date.now();
    session.pendingEchoes = session.pendingEchoes.filter((echo) => echo.expiresAt > now);

    let remainingData = data;
    while (remainingData.length > 0 && session.pendingEchoes.length > 0) {
      const echo = session.pendingEchoes[0];
      const consumed = consumeEchoPrefix(remainingData, echo.remaining);

      if (consumed.echoChars === 0) {
        break;
      }

      remainingData = remainingData.slice(consumed.dataChars);
      echo.remaining = echo.remaining.slice(consumed.echoChars);

      if (echo.remaining.length === 0) {
        session.pendingEchoes.shift();
        continue;
      }

      if (remainingData.length === 0) {
        return '';
      }
    }

    return remainingData;
  }

  private startHangWatchdog(session: ActiveSession): void {
    if (this.thinkingTimeoutMs <= 0) return;

    session.hangWatchdogTimer = setInterval(() => {
      const detection = session.lastStateDetection;
      if (!detection) return;

      const silenceMs = Date.now() - session.lastOutputAt.getTime();
      if (!session.newlineRecoveryAttempted) {
        if (detection.state !== 'thinking' && detection.state !== 'outputting') return;
        if (silenceMs < this.thinkingTimeoutMs) return;

        session.newlineRecoveryAttempted = true;
        const stuckDetection = session.stateDetector.markStuck({
          silenceMs,
          reason: `Terminal stayed in ${detection.state} without output for ${silenceMs}ms; injected newline as first recovery step.`,
        });
        session.lastStateDetection = stuckDetection;

        for (const callback of this.stateCallbacks) {
          callback(session.id, stuckDetection);
        }
        try {
          session.handle.write('\n');
        } catch (error) {
          session.hardRecoveryAttempted = true;
          const failedDetection = session.stateDetector.markWriteFailed({
            reason: `Terminal newline recovery write failed: ${formatErrorMessage(error)}.`,
            signals: ['newline_recovery_failed'],
          });
          session.lastStateDetection = failedDetection;
          for (const callback of this.stateCallbacks) {
            callback(session.id, failedDetection);
          }
        }
        return;
      }

      if (session.hardRecoveryAttempted) return;
      if (silenceMs < this.thinkingTimeoutMs + this.hardRecoveryDelayMs) return;

      session.hardRecoveryAttempted = true;
      const stuckDetection = session.stateDetector.markRecoveryEscalated({
        silenceMs,
        reason: `Terminal stayed silent for ${silenceMs}ms after newline recovery; hard-stopping PTY for supervisor recovery.`,
      });
      session.lastStateDetection = stuckDetection;

      for (const callback of this.stateCallbacks) {
        callback(session.id, stuckDetection);
      }
      session.handle.kill(9);
    }, this.hangCheckIntervalMs);
  }

  private clearSessionTimers(session: ActiveSession): void {
    if (session.stateConfirmationTimer) {
      clearTimeout(session.stateConfirmationTimer);
      session.stateConfirmationTimer = null;
    }
    if (session.hangWatchdogTimer) {
      clearInterval(session.hangWatchdogTimer);
      session.hangWatchdogTimer = null;
    }
    if (session.shutdownTimer) {
      clearTimeout(session.shutdownTimer);
      session.shutdownTimer = null;
    }
  }

  /**
   * Start a new block for a command.
   */
  private startBlock(session: ActiveSession, command: string): void {
    // Finalize any previous block first
    if (session.currentBlockId !== null) {
      this.finalizeBlock(session, 0);
    }

    const block = session.blockList.addBlock({
      command: command.trim(),
      startTime: new Date(),
      output: '',
      outputHeight: 0,
      cwd: session.cwd,
      isStreaming: true,
      isCollapsed: false,
    });

    session.currentBlockId = block.id;
    session.pendingOutput = '';

    this.emitBlockEvent(session, { type: 'block_start', block });
  }

  /**
   * Finalize a block when command completes.
   */
  private finalizeBlock(session: ActiveSession, exitCode: number): void {
    if (session.currentBlockId === null) return;

    const blockId = session.currentBlockId;
    session.currentBlockId = null;

    // Calculate approximate output height based on line count
    const lineCount = (session.pendingOutput.match(/\n/g) || []).length;
    const outputHeight = Math.max(1, lineCount + 1);

    const block = session.blockList.updateBlock(blockId, {
      endTime: new Date(),
      exitCode,
      output: session.pendingOutput,
      outputHeight,
      isStreaming: false,
    });

    if (block) {
      this.emitBlockEvent(session, { type: 'block_end', blockId, exitCode });
      this.emitBlockEvent(session, { type: 'block_update', block });
    }

    session.pendingOutput = '';
  }

  /**
   * Emit a block event to all registered handlers.
   */
  private emitBlockEvent(session: ActiveSession, event: BlockEvent): void {
    for (const callback of this.blockEventCallbacks) {
      callback(session.id, event);
    }
  }

  /**
   * Subscribe to block events for a session.
   */
  onBlockEvent(callback: (sessionId: TerminalSessionId, event: BlockEvent) => void): () => void {
    this.blockEventCallbacks.add(callback);
    return () => {
      this.blockEventCallbacks.delete(callback);
    };
  }

  /**
   * Get the block list for a session.
   */
  getBlockList(sessionId: TerminalSessionId): BlockList | undefined {
    const session = this.sessions.get(sessionId);
    return session?.blockList;
  }

  /**
   * Get all blocks for a session.
   */
  getBlocks(sessionId: TerminalSessionId): readonly TerminalBlock[] {
    const blockList = this.getBlockList(sessionId);
    return blockList?.getBlocks() ?? [];
  }

  /**
   * Handle fault detection for a session exit.
   */
  private handleFaultDetection(
    session: ActiveSession,
    classification: ReturnType<typeof classifyTerminalExit>
  ): void {
    const process = this.faultRecovery.getProcess(session.id);
    if (!process) {
      console.warn(
        `[SessionManager] No registered process found for session ${session.id.slice(0, 8)} during fault detection`
      );
      return;
    }

    const fault = this.faultRecovery.detectFaultFromExit(
      classification.exitCode ?? -1,
      classification.signal
    );

    const recoveryAction = this.faultRecovery.determineRecoveryAction(fault, process);
    console.log(
      `[SessionManager] Fault detected: ${fault.faultType} for session ${session.id.slice(0, 8)}, action: ${recoveryAction.type}`
    );

    // Execute recovery action asynchronously
    this.faultRecovery.executeRecovery(recoveryAction, process).catch((err) => {
      console.error(`[SessionManager] Recovery execution failed:`, err);
    });
  }

  /**
   * Schedule session deletion after grace period.
   */
  private scheduleDeletion(sessionId: TerminalSessionId): void {
    // Cancel any existing pending deletion
    this.cancelDeletion(sessionId);

    const timeout = setTimeout(() => {
      this.pendingDeletions.delete(sessionId);
      const session = this.sessions.get(sessionId);
      if (session) {
        this.clearSessionTimers(session);
        try {
          session.handle.kill(9);
        } catch {
          // Already dead
        }
        this.sessions.delete(sessionId);
        this.faultRecovery.unregisterProcess(sessionId);
      }
    }, this.sessionGracePeriodMs);

    this.pendingDeletions.set(sessionId, timeout);
  }

  /**
   * Cancel a pending deletion (e.g., if session is reused).
   */
  private cancelDeletion(sessionId: TerminalSessionId): void {
    const existingTimeout = this.pendingDeletions.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.pendingDeletions.delete(sessionId);
    }
  }

  /**
   * Close a session and clean up resources.
   */
  close(sessionId: TerminalSessionId): void {
    // Cancel any pending deletion
    this.cancelDeletion(sessionId);

    const session = this.sessions.get(sessionId);
    if (!session) {
      return; // Already closed or never existed
    }

    try {
      session.handle.kill(9); // SIGKILL
    } catch {
      // Process may already be dead
    }
    this.clearSessionTimers(session);

    this.sessions.delete(sessionId);
    this.faultRecovery.unregisterProcess(sessionId);
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

function consumeEchoPrefix(
  data: string,
  echo: string
): { readonly dataChars: number; readonly echoChars: number } {
  let dataIndex = 0;
  let echoIndex = 0;

  while (dataIndex < data.length && echoIndex < echo.length) {
    const echoChar = echo[echoIndex];
    const dataChar = data[dataIndex];

    if (echoChar === '\r' && dataChar === '\r' && data[dataIndex + 1] === '\n') {
      dataIndex += 2;
      echoIndex += 1;
      continue;
    }

    if (echoChar === dataChar) {
      dataIndex += 1;
      echoIndex += 1;
      continue;
    }

    if (echoChar === '\n' && dataChar === '\r') {
      dataIndex += data[dataIndex + 1] === '\n' ? 2 : 1;
      echoIndex += 1;
      continue;
    }

    if (echoChar === '\r' && dataChar === '\n') {
      dataIndex += 1;
      echoIndex += 1;
      continue;
    }

    break;
  }

  return { dataChars: dataIndex, echoChars: echoIndex };
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
