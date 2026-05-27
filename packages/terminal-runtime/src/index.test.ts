import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager, createSessionManager } from './session.js';
import { SessionNotFoundError } from './errors.js';
import type {
  CreateSessionOptions,
  TerminalBackend,
  TerminalSessionHandle,
  TerminalSessionInfo,
} from './types.js';
import type { AgentRunId, TerminalRuntime, TerminalSessionId, ThreadId } from '@doorway/protocol';
import { createFaultRecoveryService } from '@doorway/core';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = createSessionManager({
      defaultCols: 80,
      defaultRows: 24,
    });
  });

  afterEach(() => {
    manager.closeAll();
  });

  describe('launch', () => {
    it('should launch a new terminal session', async () => {
      const result = await manager.launch({
        cwd: process.cwd(),
      });

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toMatch(/^term_/);
      expect(result.pid).toBeGreaterThan(0);
      expect(result.startedAt).toBeInstanceOf(Date);
    });

    it('should list sessions after launch', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      const sessions = manager.listSessions();
      expect(sessions).toContain(result.sessionId);
    });

    it('should check if session is running', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      expect(manager.isRunning(result.sessionId)).toBe(true);
      expect(manager.hasSession(result.sessionId)).toBe(true);
    });

    it('should get session info', async () => {
      const cwd = process.cwd();
      const result = await manager.launch({ cwd });

      const info = manager.getSessionInfo(result.sessionId);
      expect(info).toBeDefined();
      expect(info?.id).toBe(result.sessionId);
      expect(info?.cwd).toBe(cwd);
      expect(info?.runtime).toBe('pty');
    });
  });

  describe('sendInput', () => {
    it('should send input to a session', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      // Send a simple echo command
      manager.sendInput(result.sessionId, 'echo "hello"\n');

      // Give it a moment to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const output = manager.getOutput(result.sessionId);
      expect(output).toContain('hello');
    });

    it('should throw SessionNotFoundError for invalid session', async () => {
      expect(() => {
        manager.sendInput('term_invalid' as import('@doorway/protocol').TerminalSessionId, 'test');
      }).toThrow(SessionNotFoundError);
    });
  });

  describe('getTranscript', () => {
    it('should capture transcript chunks', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      manager.sendInput(result.sessionId, 'echo "test"\n');

      // Give it a moment
      await new Promise((resolve) => setTimeout(resolve, 100));

      const transcript = manager.getTranscript(result.sessionId);
      expect(transcript.length).toBeGreaterThan(0);
      expect(transcript[0]).toHaveProperty('sessionId');
      expect(transcript[0]).toHaveProperty('sequence');
      expect(transcript[0]).toHaveProperty('timestamp');
      expect(transcript[0]).toHaveProperty('text');
      expect(transcript[0]).toHaveProperty('isStdout');
    });

    it('should get full output as string', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      manager.sendInput(result.sessionId, 'echo "full output"\n');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const output = manager.getOutput(result.sessionId);
      expect(typeof output).toBe('string');
    });

    it('should suppress injected input echoes from clean output while preserving raw transcript', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({ backend });
      const result = await localManager.launch({ cwd: process.cwd() });

      localManager.sendInput(result.sessionId, 'yes\n');
      backend.emitData(result.sessionId, 'yes\naccepted\n');

      expect(localManager.getOutput(result.sessionId)).toBe('yes\naccepted\n');
      expect(localManager.getCleanOutput(result.sessionId)).toBe('accepted\n');
      expect(localManager.getDecodedTranscript(result.sessionId).map((chunk) => chunk.text)).toEqual([
        'accepted\n',
      ]);
      localManager.closeAll();
    });

    it('should suppress injected input echoes split across output chunks', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({ backend });
      const result = await localManager.launch({ cwd: process.cwd() });

      localManager.sendInput(result.sessionId, 'continue\n');
      backend.emitData(result.sessionId, 'cont');
      backend.emitData(result.sessionId, 'inue\nnext\n');

      expect(localManager.getOutput(result.sessionId)).toBe('continue\nnext\n');
      expect(localManager.getCleanOutput(result.sessionId)).toBe('next\n');
      expect(localManager.getDecodedTranscript(result.sessionId).map((chunk) => chunk.text)).toEqual([
        'next\n',
      ]);
      localManager.closeAll();
    });

    it('should suppress terminal newline variants in injected input echoes', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({ backend });
      const result = await localManager.launch({ cwd: process.cwd() });

      localManager.sendInput(result.sessionId, 'yes\n');
      backend.emitData(result.sessionId, 'yes\r\naccepted\n');

      expect(localManager.getOutput(result.sessionId)).toBe('yes\r\naccepted\n');
      expect(localManager.getCleanOutput(result.sessionId)).toBe('accepted\n');
      localManager.closeAll();
    });

    it('should suppress carriage-return input echoes that the PTY expands to CRLF', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({ backend });
      const result = await localManager.launch({ cwd: process.cwd() });

      localManager.sendInput(result.sessionId, 'yes\r');
      backend.emitData(result.sessionId, 'yes\r\naccepted\n');

      expect(localManager.getOutput(result.sessionId)).toBe('yes\r\naccepted\n');
      expect(localManager.getCleanOutput(result.sessionId)).toBe('accepted\n');
      localManager.closeAll();
    });

    it('should detect a real PTY interactive prompt and inject a carriage-return answer', async () => {
      const result = await manager.launch({ cwd: process.cwd(), env: { PS1: '' } });
      const awaitingInput = new Promise<import('@doorway/protocol').TerminalStateDetection>(
        (resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No real PTY input prompt')), 3000);
          const unsubscribe = manager.onStateChange((sessionId, detection) => {
            if (sessionId !== result.sessionId || detection.state !== 'awaiting_input') return;
            clearTimeout(timeout);
            unsubscribe();
            resolve(detection);
          });
        }
      );

      manager.sendInput(
        result.sessionId,
        "printf 'Proceed? '; IFS= read -r answer; printf 'Answer:%s\\n' \"$answer\"; exit\n"
      );

      const detection = await awaitingInput;
      expect(detection.signals).toContain('question_pattern');

      manager.sendInput(result.sessionId, 'yes\r');

      await waitFor(() => manager.getCleanOutput(result.sessionId).includes('Answer:yes'), 3000);
      expect(manager.getOutput(result.sessionId)).toContain('yes');
      expect(manager.getCleanOutput(result.sessionId)).toContain('Proceed?');
      expect(manager.getCleanOutput(result.sessionId)).toContain('Answer:yes');
      expect(manager.getCleanOutput(result.sessionId)).not.toContain('yes\r\nAnswer:yes');
    });

    it('should not leave echo suppression state behind after a failed input write', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({ backend });
      const result = await localManager.launch({ cwd: process.cwd() });

      backend.setWriteError(result.sessionId, new Error('EPIPE'));

      expect(() => localManager.sendInput(result.sessionId, 'yes\n')).toThrow('EPIPE');

      backend.setWriteError(result.sessionId, null);
      backend.emitData(result.sessionId, 'yes\naccepted\n');

      expect(localManager.getOutput(result.sessionId)).toBe('yes\naccepted\n');
      expect(localManager.getCleanOutput(result.sessionId)).toBe('yes\naccepted\n');
      localManager.closeAll();
    });

    it('should refresh registered process heartbeat when terminal output arrives', async () => {
      const backend = new FakeTerminalBackend();
      const faultRecovery = createFaultRecoveryService();
      const localManager = createSessionManager({ backend, faultRecovery });
      const result = await localManager.launch({ cwd: process.cwd() });
      const staleHeartbeat = new Date(Date.now() - 10_000);
      faultRecovery.registerProcess({
        sessionId: result.sessionId,
        runId: 'run_terminal_heartbeat' as AgentRunId,
        threadId: 'thread_terminal_heartbeat' as ThreadId,
        provider: 'generic',
        startedAt: staleHeartbeat,
        lastHeartbeat: staleHeartbeat,
        status: 'running',
      });

      expect(faultRecovery.detectHangedProcesses(1000).map((record) => record.sessionId)).toContain(
        result.sessionId
      );

      backend.emitData(result.sessionId, 'still working\n');

      const processRecord = faultRecovery.getProcess(result.sessionId);
      expect(processRecord?.lastHeartbeat.getTime()).toBeGreaterThan(staleHeartbeat.getTime());
      expect(faultRecovery.detectHangedProcesses(1000)).toEqual([]);
      localManager.closeAll();
    });

    it('should mark confirmed input prompts as waiting input for hang detection', async () => {
      const backend = new FakeTerminalBackend();
      const faultRecovery = createFaultRecoveryService();
      const localManager = createSessionManager({ backend, faultRecovery });
      const result = await localManager.launch({ cwd: process.cwd() });
      const staleHeartbeat = new Date(Date.now() - 10_000);
      faultRecovery.registerProcess({
        sessionId: result.sessionId,
        runId: 'run_terminal_waiting_input' as AgentRunId,
        threadId: 'thread_terminal_waiting_input' as ThreadId,
        provider: 'generic',
        startedAt: staleHeartbeat,
        lastHeartbeat: staleHeartbeat,
        status: 'running',
      });
      const confirmedState = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('No confirmed input state')), 1500);
        const unsubscribe = localManager.onStateChange((sessionId, detection) => {
          if (sessionId !== result.sessionId || detection.state !== 'awaiting_input') return;
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        });
      });

      backend.emitData(result.sessionId, '\x1b[1;32m>\x1b[0m \x1b[?25h');
      await confirmedState;

      expect(faultRecovery.getProcess(result.sessionId)?.status).toBe('waiting_input');
      expect(faultRecovery.detectHangedProcesses(0)).toEqual([]);
      localManager.closeAll();
    });

    it('should expose clean output without terminal controls', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      manager.sendInput(result.sessionId, 'printf "\\033[31msemantic\\033[0m\\n"\n');

      await waitFor(() => manager.getCleanOutput(result.sessionId).includes('semantic'));

      const rawOutput = manager.getOutput(result.sessionId);
      const cleanOutput = manager.getCleanOutput(result.sessionId);

      expect(rawOutput).toContain('\x1b[');
      expect(cleanOutput).toContain('semantic');
      expect(cleanOutput).not.toContain('\x1b[');
      expect(manager.getDecodedTranscript(result.sessionId).length).toBeGreaterThan(0);
      expect(
        manager
          .getDecodedTranscript(result.sessionId)
          .some((chunk) => chunk.controlEvents.some((event) => event.type === 'csi'))
      ).toBe(true);
      expect(
        manager
          .getDecodedTranscript(result.sessionId)
          .some((chunk) => chunk.stateDetection.state === 'outputting')
      ).toBe(true);
    });

    it('should notify confirmed state changes after terminal silence', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({
        backend,
        stateConfirmationDelayMs: 20,
      });
      const result = await localManager.launch({ cwd: process.cwd() });
      const confirmedState = new Promise<import('@doorway/protocol').TerminalStateDetection>(
        (resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No confirmed terminal state')), 1500);
          const unsubscribe = localManager.onStateChange((sessionId, detection) => {
            if (sessionId !== result.sessionId) return;
            clearTimeout(timeout);
            unsubscribe();
            resolve(detection);
          });
        }
      );

      backend.emitData(result.sessionId, '\x1b[1;32m>\x1b[0m \x1b[?25h');

      const detection = await confirmedState;
      localManager.closeAll();
      expect(detection.confirmed).toBe(true);
      expect(detection.state).toBe('awaiting_input');
      expect(detection.confirmationSignals).toContain('silence_500ms');
    });

    it('should inject a newline and emit stuck state when thinking goes stale', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({
        backend,
        hangCheckIntervalMs: 10,
        thinkingTimeoutMs: 20,
      });
      const result = await localManager.launch({ cwd: process.cwd() });
      const stuckState = new Promise<import('@doorway/protocol').TerminalStateDetection>(
        (resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No stale terminal state')), 1500);
          const unsubscribe = localManager.onStateChange((sessionId, detection) => {
            if (sessionId !== result.sessionId || detection.state !== 'stuck') return;
            clearTimeout(timeout);
            unsubscribe();
            resolve(detection);
          });
        }
      );

      backend.emitData(result.sessionId, '\x1b[?25lThinking...');

      const detection = await stuckState;
      expect(detection.signals).toContain('newline_recovery_attempted');
      expect(backend.getWrites(result.sessionId)).toContain('\n');
      localManager.closeAll();
    });

    it('should hard-stop a session when newline recovery does not restore output', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({
        backend,
        hangCheckIntervalMs: 10,
        thinkingTimeoutMs: 20,
        hardRecoveryDelayMs: 20,
      });
      const result = await localManager.launch({ cwd: process.cwd() });
      const escalatedState = new Promise<import('@doorway/protocol').TerminalStateDetection>(
        (resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No hard recovery escalation')), 1500);
          const unsubscribe = localManager.onStateChange((sessionId, detection) => {
            if (
              sessionId !== result.sessionId ||
              !detection.signals.includes('hard_recovery_requested')
            ) {
              return;
            }
            clearTimeout(timeout);
            unsubscribe();
            resolve(detection);
          });
        }
      );

      backend.emitData(result.sessionId, '\x1b[?25lThinking...');

      const detection = await escalatedState;
      expect(detection.state).toBe('stuck');
      expect(detection.signals).toContain('stale_after_newline_recovery');
      expect(backend.getWrites(result.sessionId)).toContain('\n');
      expect(backend.getKills(result.sessionId)).toContain(9);
      localManager.closeAll();
    });

    it('should emit failed state when newline recovery write fails', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({
        backend,
        hangCheckIntervalMs: 10,
        thinkingTimeoutMs: 20,
        hardRecoveryDelayMs: 20,
      });
      const result = await localManager.launch({ cwd: process.cwd() });
      backend.setWriteError(result.sessionId, new Error('EPIPE'));
      const failedState = new Promise<import('@doorway/protocol').TerminalStateDetection>(
        (resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No failed write state')), 1500);
          const unsubscribe = localManager.onStateChange((sessionId, detection) => {
            if (
              sessionId !== result.sessionId ||
              detection.state !== 'failed' ||
              !detection.signals.includes('newline_recovery_failed')
            ) {
              return;
            }
            clearTimeout(timeout);
            unsubscribe();
            resolve(detection);
          });
        }
      );

      backend.emitData(result.sessionId, '\x1b[?25lThinking...');

      const detection = await failedState;
      expect(detection.signals).toContain('terminal_write_failed');
      expect(backend.getWrites(result.sessionId)).toEqual([]);
      expect(backend.getKills(result.sessionId)).toEqual([]);
      localManager.closeAll();
    });

    it('should preserve Codex alternate-screen content in clean output', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({ backend });
      const result = await localManager.launch({ cwd: process.cwd() });

      backend.emitData(
        result.sessionId,
        '\x1b[?1049h\x1b[1mCodex\x1b[0m by OpenAI\n\x1b[36m❯\x1b[0m\x1b[?1049l'
      );

      const [chunk] = localManager.getDecodedTranscript(result.sessionId);
      expect(localManager.getCleanOutput(result.sessionId)).toContain('Codex by OpenAI');
      expect(chunk?.screenSnapshot.alternateText).toContain('Codex by OpenAI');
      expect(chunk?.controlEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'screen_buffer', buffer: 'alternate', active: true }),
          expect.objectContaining({ type: 'screen_buffer', buffer: 'main', active: false }),
        ])
      );
      localManager.closeAll();
    });
  });

  describe('resize', () => {
    it('should resize a session', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      // Should not throw
      manager.resize(result.sessionId, 120, 40);

      const info = manager.getSessionInfo(result.sessionId);
      expect(info).toBeDefined();
    });

    it('should resize all active sessions to shared panel dimensions', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({ backend });
      const first = await localManager.launch({ cwd: process.cwd() });
      const second = await localManager.launch({ cwd: process.cwd() });

      localManager.resizeAll(132, 43);

      expect(backend.getResizes(first.sessionId)).toEqual([{ cols: 132, rows: 43 }]);
      expect(backend.getResizes(second.sessionId)).toEqual([{ cols: 132, rows: 43 }]);
      localManager.closeAll();
    });
  });

  describe('close', () => {
    it('should close a session', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      expect(manager.isRunning(result.sessionId)).toBe(true);

      manager.close(result.sessionId);

      // Give time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.isRunning(result.sessionId)).toBe(false);
    });

    it('should close all sessions', async () => {
      await manager.launch({ cwd: process.cwd() });
      await manager.launch({ cwd: process.cwd() });

      expect(manager.listSessions().length).toBeGreaterThanOrEqual(2);

      manager.closeAll();

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.listSessions().length).toBe(0);
    });
  });

  describe('stop', () => {
    it('should stop a session', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      const exitCode = manager.stop(result.sessionId);

      expect(exitCode).toBe(0);
    });

    it('should escalate graceful stop to SIGKILL when the session does not exit', async () => {
      const backend = new FakeTerminalBackend();
      const localManager = createSessionManager({
        backend,
        shutdownGracePeriodMs: 20,
      });
      const result = await localManager.launch({ cwd: process.cwd() });
      backend.setExitOnKill(result.sessionId, false);

      localManager.stop(result.sessionId);

      await waitFor(() => backend.getKills(result.sessionId).includes(9));
      expect(backend.getKills(result.sessionId)).toEqual([15, 9]);
      localManager.closeAll();
    });

    it('should notify exit subscribers', async () => {
      const result = await manager.launch({ cwd: process.cwd() });
      const exits: string[] = [];
      let unsubscribe = () => {};
      const exitPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`No exit callback for ${result.sessionId}`)),
          2000
        );
        unsubscribe = manager.onExit((sessionId) => {
          exits.push(sessionId);
          clearTimeout(timeout);
          resolve();
        });
      });

      manager.stop(result.sessionId, 9);
      await exitPromise;
      unsubscribe();

      expect(exits).toContain(result.sessionId);
    });
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}

class FakeTerminalBackend implements TerminalBackend {
  readonly name: TerminalRuntime = 'pty';
  private readonly handles = new Map<TerminalSessionId, FakeTerminalSessionHandle>();

  async createSession(_options: CreateSessionOptions): Promise<TerminalSessionHandle> {
    const id = `term_fake_${this.handles.size}` as TerminalSessionId;
    const handle = new FakeTerminalSessionHandle(id);
    this.handles.set(id, handle);
    return handle;
  }

  async listSessions(): Promise<readonly TerminalSessionInfo[]> {
    return Array.from(this.handles.values()).map((handle) => ({
      id: handle.id,
      pid: handle.pid,
      name: handle.id,
      cwd: process.cwd(),
    }));
  }

  emitData(sessionId: TerminalSessionId, data: string): void {
    this.handles.get(sessionId)?.emitData(data);
  }

  getWrites(sessionId: TerminalSessionId): readonly string[] {
    return this.handles.get(sessionId)?.writes ?? [];
  }

  getKills(sessionId: TerminalSessionId): readonly number[] {
    return this.handles.get(sessionId)?.kills ?? [];
  }

  getResizes(sessionId: TerminalSessionId): readonly { readonly cols: number; readonly rows: number }[] {
    return this.handles.get(sessionId)?.resizes ?? [];
  }

  setExitOnKill(sessionId: TerminalSessionId, exitOnKill: boolean): void {
    const handle = this.handles.get(sessionId);
    if (handle) {
      handle.exitOnKill = exitOnKill;
    }
  }

  setWriteError(sessionId: TerminalSessionId, error: Error | null): void {
    const handle = this.handles.get(sessionId);
    if (handle) {
      handle.writeError = error;
    }
  }
}

class FakeTerminalSessionHandle implements TerminalSessionHandle {
  readonly pid = 1234;
  readonly fd = 1;
  readonly writes: string[] = [];
  readonly kills: number[] = [];
  readonly resizes: Array<{ readonly cols: number; readonly rows: number }> = [];
  exitOnKill = true;
  writeError: Error | null = null;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(exitCode: number, signal: string | null) => void>();

  constructor(readonly id: TerminalSessionId) {}

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }

  write(data: string): void {
    if (this.writeError) {
      throw this.writeError;
    }
    this.writes.push(data);
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

  kill(signal: number = 15): void {
    this.kills.push(signal);
    if (!this.exitOnKill) return;
    for (const listener of this.exitListeners) {
      listener(signal === 9 ? 137 : 0, signal === 9 ? 'SIGKILL' : null);
    }
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }
}

describe('Errors', () => {
  it('should create SessionNotFoundError with correct properties', () => {
    const error = new SessionNotFoundError('term_123');

    expect(error.name).toBe('SessionNotFoundError');
    expect(error.code).toBe('SESSION_NOT_FOUND');
    expect(error.context).toEqual({ sessionId: 'term_123' });
    expect(error.message).toContain('term_123');
  });
});
