import type Database from 'better-sqlite3';
import type {
  AgentRunId,
  HandoffCapsuleId,
  HandoffCapsuleProjection,
  ProviderId,
  TestStatus,
  ThreadId,
} from '@doorway/protocol';

export function listHandoffCapsules(
  db: Database.Database,
  threadId: ThreadId
): readonly HandoffCapsuleProjection[] {
  const rows = db
    .prepare(
      `
      SELECT id, thread_id, source_run_id, target_provider, summary, latest_intent,
        run_summary, worktree_path, branch, changed_files, diff_summary, test_status,
        open_questions, next_prompt, created_at
      FROM handoff_capsules
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `
    )
    .all(threadId) as HandoffCapsuleRow[];

  return rows.map((row) => ({
    id: row.id as HandoffCapsuleId,
    threadId: row.thread_id as ThreadId,
    sourceRunId: row.source_run_id as AgentRunId,
    targetProvider: (row.target_provider ?? undefined) as ProviderId | undefined,
    summary: row.summary,
    latestIntent: row.latest_intent,
    runSummary: row.run_summary,
    worktreePath: row.worktree_path ?? undefined,
    branch: row.branch ?? undefined,
    changedFiles: JSON.parse(row.changed_files) as readonly string[],
    diffSummary: row.diff_summary,
    testStatus: (row.test_status ?? undefined) as TestStatus | undefined,
    openQuestions: JSON.parse(row.open_questions) as readonly string[],
    nextPrompt: row.next_prompt,
    createdAt: new Date(row.created_at),
    evidence: [{ kind: 'handoff', id: row.id, label: 'Handoff capsule' }],
  }));
}

interface HandoffCapsuleRow {
  readonly id: string;
  readonly thread_id: string;
  readonly source_run_id: string;
  readonly target_provider: string | null;
  readonly summary: string;
  readonly latest_intent: string;
  readonly run_summary: string;
  readonly worktree_path: string | null;
  readonly branch: string | null;
  readonly changed_files: string;
  readonly diff_summary: string;
  readonly test_status: string | null;
  readonly open_questions: string;
  readonly next_prompt: string;
  readonly created_at: string;
}
