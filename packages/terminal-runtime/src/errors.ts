/**
 * Terminal Runtime Errors
 */

export class TerminalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TerminalError';
  }
}

export class SessionNotFoundError extends TerminalError {
  constructor(sessionId: string) {
    super(`Terminal session not found: ${sessionId}`, 'SESSION_NOT_FOUND', { sessionId });
    this.name = 'SessionNotFoundError';
  }
}

export class SessionAlreadyRunningError extends TerminalError {
  constructor(sessionId: string) {
    super(`Terminal session already running: ${sessionId}`, 'SESSION_ALREADY_RUNNING', {
      sessionId,
    });
    this.name = 'SessionAlreadyRunningError';
  }
}

export class SessionCrashedError extends TerminalError {
  constructor(sessionId: string, exitCode: number, signal?: string) {
    super(
      `Terminal session crashed: ${sessionId} (exit: ${exitCode}${signal ? `, signal: ${signal}` : ''})`,
      'SESSION_CRASHED',
      { sessionId, exitCode, signal }
    );
    this.name = 'SessionCrashedError';
  }
}

export class PtyError extends TerminalError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PTY_ERROR', context);
    this.name = 'PtyError';
  }
}

export class ResizeError extends TerminalError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'RESIZE_ERROR', context);
    this.name = 'ResizeError';
  }
}

export class WriteError extends TerminalError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'WRITE_ERROR', context);
    this.name = 'WriteError';
  }
}

export class KillError extends TerminalError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'KILL_ERROR', context);
    this.name = 'KillError';
  }
}
