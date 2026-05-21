import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewBoard, createReviewBoard } from './review-board.js';
import type { ReviewItem, MergePlan } from './types.js';
import { InvalidReviewStateError, NoItemsSelectedError } from './errors.js';

describe('ReviewBoard', () => {
  let board: ReviewBoard;

  beforeEach(() => {
    board = createReviewBoard({
      taskId: 'task_123' as import('@doorway/protocol').TaskId,
      baseBranch: 'main',
    });
  });

  describe('addItem', () => {
    it('should add a review item', () => {
      const item = createMockItem('run_1', 'backend');

      board.addItem(item);

      const items = board.getItems();
      expect(items).toHaveLength(1);
      expect(items[0]?.runId).toBe('run_1');
      expect(items[0]?.status).toBe('pending');
    });

    it('should add multiple items', () => {
      board.addItem(createMockItem('run_1', 'backend'));
      board.addItem(createMockItem('run_2', 'frontend'));

      const items = board.getItems();
      expect(items).toHaveLength(2);
    });
  });

  describe('removeItem', () => {
    it('should remove an item', () => {
      board.addItem(createMockItem('run_1', 'backend'));

      const removed = board.removeItem('run_1' as import('@doorway/protocol').AgentRunId);

      expect(removed).toBe(true);
      expect(board.getItems()).toHaveLength(0);
    });

    it('should return false for non-existent item', () => {
      const removed = board.removeItem('run_nonexistent' as import('@doorway/protocol').AgentRunId);

      expect(removed).toBe(false);
    });
  });

  describe('decide', () => {
    beforeEach(() => {
      board.addItem(createMockItem('run_1', 'backend'));
    });

    it('should approve an item', () => {
      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
        notes: 'Looks good',
      });

      const item = board.getItem('run_1' as import('@doorway/protocol').AgentRunId);
      expect(item?.status).toBe('approved');
      expect(item?.approvalNotes).toBe('Looks good');
    });

    it('should reject an item', () => {
      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'reject',
        notes: 'Needs more work',
      });

      const item = board.getItem('run_1' as import('@doorway/protocol').AgentRunId);
      expect(item?.status).toBe('rejected');
    });

    it('should throw for non-existent item', () => {
      expect(() => {
        board.decide('run_nonexistent' as import('@doorway/protocol').AgentRunId, {
          runId: 'run_nonexistent' as import('@doorway/protocol').AgentRunId,
          decision: 'approve',
        });
      }).toThrow(InvalidReviewStateError);
    });
  });

  describe('getApprovedItems', () => {
    it('should return only approved items', () => {
      board.addItem(createMockItem('run_1', 'backend'));
      board.addItem(createMockItem('run_2', 'frontend'));
      board.addItem(createMockItem('run_3', 'tester'));

      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
      });
      board.decide('run_2' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_2' as import('@doorway/protocol').AgentRunId,
        decision: 'reject',
      });

      const approved = board.getApprovedItems();

      expect(approved).toHaveLength(1);
      expect(approved[0]?.runId).toBe('run_1');
    });
  });

  describe('allReviewed', () => {
    it('should return false when items are pending', () => {
      board.addItem(createMockItem('run_1', 'backend'));

      expect(board.allReviewed()).toBe(false);
    });

    it('should return true when all items are reviewed', () => {
      board.addItem(createMockItem('run_1', 'backend'));
      board.addItem(createMockItem('run_2', 'frontend'));

      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
      });
      board.decide('run_2' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_2' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
      });

      expect(board.allReviewed()).toBe(true);
    });
  });

  describe('createMergePlan', () => {
    beforeEach(() => {
      board.addItem(createMockItem('run_1', 'backend'));
      board.addItem(createMockItem('run_2', 'frontend'));
    });

    it('should create merge plan from approved items', () => {
      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
      });

      const plan = board.createMergePlan('sequential');

      expect(plan.items).toHaveLength(1);
      expect(plan.items[0]?.sourceBranch).toBe('doorway/task-123/backend');
      expect(plan.status).toBe('pending');
    });

    it('should throw when no approved items', () => {
      expect(() => {
        board.createMergePlan();
      }).toThrow(NoItemsSelectedError);
    });

    it('should set strategy correctly', () => {
      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
      });

      const plan = board.createMergePlan('cherry-pick');

      expect(plan.strategy).toBe('cherry-pick');
    });
  });

  describe('getSummary', () => {
    it('should return correct summary', () => {
      board.addItem(createMockItem('run_1', 'backend'));
      board.addItem(createMockItem('run_2', 'frontend'));
      board.addItem(createMockItem('run_3', 'tester'));

      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
      });
      board.decide('run_2' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_2' as import('@doorway/protocol').AgentRunId,
        decision: 'reject',
      });

      const summary = board.getSummary();

      expect(summary.total).toBe(3);
      expect(summary.approved).toBe(1);
      expect(summary.rejected).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.readyForMerge).toBe(false); // Not all reviewed
    });
  });

  describe('getState', () => {
    it('should return complete board state', () => {
      board.addItem(createMockItem('run_1', 'backend'));
      board.decide('run_1' as import('@doorway/protocol').AgentRunId, {
        runId: 'run_1' as import('@doorway/protocol').AgentRunId,
        decision: 'approve',
      });

      const state = board.getState();

      expect(state.taskId).toBe('task_123');
      expect(state.items).toHaveLength(1);
      expect(state.selectedForMerge).toHaveLength(1);
    });
  });

  describe('createReviewBoard', () => {
    it('should create review board factory', () => {
      const board = createReviewBoard({
        taskId: 'task_456' as import('@doorway/protocol').TaskId,
        baseBranch: 'develop',
        integrationBranchName: 'custom-integration',
      });

      expect(board).toBeInstanceOf(ReviewBoard);
    });
  });
});

describe('Errors', () => {
  it('should create InvalidReviewStateError with correct properties', () => {
    const error = new InvalidReviewStateError('Test error');

    expect(error.name).toBe('InvalidReviewStateError');
    expect(error.code).toBe('INVALID_REVIEW_STATE');
    expect(error.message).toContain('Test error');
  });

  it('should create NoItemsSelectedError', () => {
    const error = new NoItemsSelectedError();

    expect(error.name).toBe('NoItemsSelectedError');
    expect(error.code).toBe('NO_ITEMS_SELECTED');
  });
});

// Helper function
function createMockItem(runId: string, role: string): Omit<ReviewItem, 'status'> {
  return {
    runId: runId as import('@doorway/protocol').AgentRunId,
    worktreeId: `wt_${runId}` as import('@doorway/protocol').WorktreeId,
    role,
    branch: `doorway/task-123/${role}`,
    fileChanges: [],
    diffSummary: `Mock diff for ${role}`,
  };
}
