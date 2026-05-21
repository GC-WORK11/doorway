/**
 * Handoff Capsule Types
 */

import type {
  ThreadId,
  AgentRunId,
  WorktreeId,
  ThreadSummary,
  RunSummary,
  ProviderId,
} from '@doorway/protocol';

export interface HandoffCapsule {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly createdAt: Date;
  readonly summary: ThreadSummary;
  readonly latestIntent: string;
  readonly runSummaries: readonly RunSummary[];
  readonly worktreePath?: string;
  readonly branch?: string;
  readonly changedFiles: readonly ChangedFile[];
  readonly diffSummary: string;
  readonly testStatus?: TestStatus;
  readonly openQuestions: readonly string[];
  readonly nextPrompt: string;
  readonly metadata: CapsuleMetadata;
}

export interface ChangedFile {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted';
  readonly additions: number;
  readonly deletions: number;
  readonly summary: string;
}

export type TestStatus = 'pass' | 'fail' | 'pending' | 'skipped' | 'unknown';

export interface CapsuleMetadata {
  readonly createdBy: 'user' | 'agent';
  readonly targetProvider?: ProviderId;
  readonly version: string;
  readonly doorwayVersion: string;
}

export interface CapsuleOptions {
  readonly threadId: ThreadId;
  readonly summary: ThreadSummary;
  readonly latestIntent: string;
  readonly runSummaries: readonly RunSummary[];
  readonly worktreePath?: string;
  readonly branch?: string;
  readonly changedFiles: readonly ChangedFile[];
  readonly diffSummary: string;
  readonly testStatus?: TestStatus;
  readonly openQuestions: readonly string[];
  readonly nextPrompt: string;
  readonly createdBy?: 'user' | 'agent';
  readonly targetProvider?: ProviderId;
}

export interface CapsuleFormat {
  readonly json: string;
  readonly markdown: string;
  readonly minimal: string;
}

export interface CapsuleParseResult {
  readonly capsule: HandoffCapsule;
  readonly format: 'json' | 'markdown' | 'minimal';
}
