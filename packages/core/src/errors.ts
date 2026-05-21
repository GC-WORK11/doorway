/**
 * Doorway Core Errors
 * Domain-specific error types for the Doorway application.
 */

export class DoorwayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DoorwayError';
  }
}

export class NotFoundError extends DoorwayError {
  constructor(resource: string, id: string) {
    super(`Resource not found: ${resource} with id ${id}`, 'NOT_FOUND', { resource, id });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DoorwayError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class PersistenceError extends DoorwayError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PERSISTENCE_ERROR', context);
    this.name = 'PersistenceError';
  }
}

export class MigrationError extends DoorwayError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MIGRATION_ERROR', context);
    this.name = 'MigrationError';
  }
}

export class EventSourcingError extends DoorwayError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EVENT_SOURCING_ERROR', context);
    this.name = 'EventSourcingError';
  }
}
