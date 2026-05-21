/**
 * Review Board
 *
 * Manages the review workflow: viewing agent run outputs,
 * making approval decisions, and preparing for merge.
 */

import type { TaskId, AgentRunId, WorktreeId, FileChange } from '@doorway/protocol';
import type {
  ReviewItem,
  ReviewBoardState,
  ReviewDecision,
  MergePlan,
  MergeStrategy,
} from './types.js';
import { InvalidReviewStateError, NoItemsSelectedError } from './errors.js';

export interface ReviewBoardOptions {
  taskId: TaskId;
  baseBranch: string;
  integrationBranchName?: string;
}

/**
 * Manages the review board state and workflow.
 */
export class ReviewBoard {
  private readonly taskId: TaskId;
  private readonly baseBranch: string;
  private readonly integrationBranchName: string;
  private items: Map<AgentRunId, ReviewItem> = new Map();
  private mergePlan?: MergePlan;

  constructor(options: ReviewBoardOptions) {
    this.taskId = options.taskId;
    this.baseBranch = options.baseBranch;
    this.integrationBranchName =
      options.integrationBranchName ?? `doorway/integration-${String(options.taskId)}`;
  }

  /**
   * Add an agent run to the review board.
   */
  addItem(item: Omit<ReviewItem, 'status'>): void {
    const reviewItem: ReviewItem = {
      ...item,
      status: 'pending',
    };
    this.items.set(item.runId, reviewItem);
  }

  /**
   * Remove an agent run from the review board.
   */
  removeItem(runId: AgentRunId): boolean {
    return this.items.delete(runId);
  }

  /**
   * Get all review items.
   */
  getItems(): readonly ReviewItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Get a specific review item.
   */
  getItem(runId: AgentRunId): ReviewItem | undefined {
    return this.items.get(runId);
  }

  /**
   * Make a review decision on an agent run.
   */
  decide(runId: AgentRunId, decision: ReviewDecision): void {
    const item = this.items.get(runId);
    if (!item) {
      throw new InvalidReviewStateError(`Review item not found: ${runId}`);
    }

    const updatedItem: ReviewItem = {
      ...item,
      status: decision.decision === 'approve' ? 'approved' : 'rejected',
      approvalNotes: decision.notes,
    };
    this.items.set(runId, updatedItem);
  }

  /**
   * Get items approved for merge.
   */
  getApprovedItems(): readonly ReviewItem[] {
    return this.getItems().filter((item) => item.status === 'approved');
  }

  /**
   * Get items rejected for merge.
   */
  getRejectedItems(): readonly ReviewItem[] {
    return this.getItems().filter((item) => item.status === 'rejected');
  }

  /**
   * Get items pending review.
   */
  getPendingItems(): readonly ReviewItem[] {
    return this.getItems().filter((item) => item.status === 'pending');
  }

  /**
   * Check if all items have been reviewed.
   */
  allReviewed(): boolean {
    return this.getPendingItems().length === 0;
  }

  /**
   * Get the current board state.
   */
  getState(): ReviewBoardState {
    return {
      taskId: this.taskId,
      items: this.getItems(),
      mergePlan: this.mergePlan,
      selectedForMerge: this.getApprovedItems().map((item) => item.runId),
    };
  }

  /**
   * Create a merge plan from approved items.
   */
  createMergePlan(strategy: MergeStrategy = 'sequential'): MergePlan {
    const approved = this.getApprovedItems();

    if (approved.length === 0) {
      throw new NoItemsSelectedError();
    }

    const mergeItems = approved.map((item) => ({
      runId: item.runId,
      sourceBranch: item.branch,
      targetBranch: this.baseBranch,
      status: 'pending' as const,
      changes: item.fileChanges,
    }));

    const plan: MergePlan = {
      id: `plan_${Date.now().toString(36)}`,
      taskId: this.taskId,
      integrationBranch: this.integrationBranchName,
      baseBranch: this.baseBranch,
      items: mergeItems,
      strategy,
      status: 'pending',
      createdAt: new Date(),
    };

    this.mergePlan = plan;
    return plan;
  }

  /**
   * Get the current merge plan.
   */
  getMergePlan(): MergePlan | undefined {
    return this.mergePlan;
  }

  /**
   * Update merge plan status.
   */
  updatePlanStatus(status: MergePlan['status']): void {
    if (!this.mergePlan) {
      throw new InvalidReviewStateError('No merge plan exists');
    }

    this.mergePlan = {
      ...this.mergePlan,
      status,
    };
  }

  /**
   * Check if board is ready for merge.
   */
  isReadyForMerge(): boolean {
    return this.allReviewed() && this.getApprovedItems().length > 0;
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    readyForMerge: boolean;
  } {
    const items = this.getItems();
    return {
      total: items.length,
      approved: this.getApprovedItems().length,
      rejected: this.getRejectedItems().length,
      pending: this.getPendingItems().length,
      readyForMerge: this.isReadyForMerge(),
    };
  }
}

/**
 * Create a review board for a task.
 */
export function createReviewBoard(options: ReviewBoardOptions): ReviewBoard {
  return new ReviewBoard(options);
}
