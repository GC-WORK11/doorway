/**
 * Review-Merge Types
 */

import type { TaskId, AgentRunId, WorktreeId, FileChange } from '@doorway/protocol';

export type MergeStrategy = 'sequential' | 'parallel' | 'cherry-pick';

export type MergeStatus = 'pending' | 'in_progress' | 'success' | 'conflict' | 'failed';

export interface ReviewItem {
  readonly runId: AgentRunId;
  readonly worktreeId: WorktreeId;
  readonly role: string;
  readonly branch: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly fileChanges: readonly FileChange[];
  readonly diffSummary: string;
  readonly testStatus?: 'pass' | 'fail' | 'pending' | 'skipped';
  readonly approvalNotes?: string;
}

export interface MergePlan {
  readonly id: string;
  readonly taskId: TaskId;
  readonly integrationBranch: string;
  readonly baseBranch: string;
  readonly items: readonly MergeItem[];
  readonly strategy: MergeStrategy;
  readonly status: MergeStatus;
  readonly createdAt: Date;
}

export interface MergeItem {
  readonly runId: AgentRunId;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly status: MergeStatus;
  readonly changes: readonly FileChange[];
  readonly conflicts?: readonly ConflictFile[];
}

export interface ConflictFile {
  readonly path: string;
  readonly conflictMarkers?: string;
}

export interface MergeResult {
  readonly planId: string;
  readonly status: MergeStatus;
  readonly mergedBranches: readonly string[];
  readonly conflicts: readonly ConflictFile[];
  readonly testResults?: {
    passed: boolean;
    output?: string;
  };
  readonly summary: string;
}

export interface ReviewBoardState {
  readonly taskId: TaskId;
  readonly items: readonly ReviewItem[];
  readonly mergePlan?: MergePlan;
  readonly selectedForMerge: readonly AgentRunId[];
}

export interface ReviewDecision {
  readonly runId: AgentRunId;
  readonly decision: 'approve' | 'reject';
  readonly notes?: string;
}
