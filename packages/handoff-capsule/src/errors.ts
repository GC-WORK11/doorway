/**
 * Handoff Capsule Errors
 */

export class CapsuleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CapsuleError';
  }
}

export class CapsuleParseError extends CapsuleError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CAPSULE_PARSE_ERROR', context);
    this.name = 'CapsuleParseError';
  }
}

export class CapsuleValidationError extends CapsuleError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CAPSULE_VALIDATION_ERROR', context);
    this.name = 'CapsuleValidationError';
  }
}

export class CapsuleNotFoundError extends CapsuleError {
  constructor(capsuleId: string) {
    super(`Capsule not found: ${capsuleId}`, 'CAPSULE_NOT_FOUND', { capsuleId });
    this.name = 'CapsuleNotFoundError';
  }
}

export class CapsuleWriteError extends CapsuleError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CAPSULE_WRITE_ERROR', context);
    this.name = 'CapsuleWriteError';
  }
}
