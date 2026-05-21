import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager, createSessionManager } from './session.js';
import { SessionNotFoundError } from './errors.js';

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
  });

  describe('resize', () => {
    it('should resize a session', async () => {
      const result = await manager.launch({ cwd: process.cwd() });

      // Should not throw
      manager.resize(result.sessionId, 120, 40);

      const info = manager.getSessionInfo(result.sessionId);
      expect(info).toBeDefined();
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

describe('Errors', () => {
  it('should create SessionNotFoundError with correct properties', () => {
    const error = new SessionNotFoundError('term_123');

    expect(error.name).toBe('SessionNotFoundError');
    expect(error.code).toBe('SESSION_NOT_FOUND');
    expect(error.context).toEqual({ sessionId: 'term_123' });
    expect(error.message).toContain('term_123');
  });
});
