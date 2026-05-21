/**
 * Review-Merge Errors
 */

export class ReviewMergeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ReviewMergeError';
  }
}

export class MergeConflictError extends ReviewMergeError {
  constructor(message: string, conflicts: readonly { path: string }[]) {
    super(message, 'MERGE_CONFLICT', { conflicts });
    this.name = 'MergeConflictError';
  }
}

export class MergeFailedError extends ReviewMergeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MERGE_FAILED', context);
    this.name = 'MergeFailedError';
  }
}

export class InvalidReviewStateError extends ReviewMergeError {
  constructor(message: string) {
    super(message, 'INVALID_REVIEW_STATE');
    this.name = 'InvalidReviewStateError';
  }
}

export class NoItemsSelectedError extends ReviewMergeError {
  constructor() {
    super('No items selected for merge', 'NO_ITEMS_SELECTED');
    this.name = 'NoItemsSelectedError';
  }
}

export class BranchNotFoundError extends ReviewMergeError {
  constructor(branch: string) {
    super(`Branch not found: ${branch}`, 'BRANCH_NOT_FOUND', { branch });
    this.name = 'BranchNotFoundError';
  }
}

export class IntegrationBranchExistsError extends ReviewMergeError {
  constructor(branch: string) {
    super(`Integration branch already exists: ${branch}`, 'INTEGRATION_BRANCH_EXISTS', { branch });
    this.name = 'IntegrationBranchExistsError';
  }
}
