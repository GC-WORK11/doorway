import type Database from 'better-sqlite3';
import type {
  EventType,
  MergeAssessmentProjection,
  MergeSafetyScore,
  TaskId,
  ThreadId,
} from '@doorway/protocol';
import { recordEvent } from './event-service.js';
import { generateId, toISOString } from './id-gen.js';
import { NotFoundError } from './errors.js';

export function recordMergeAssessment(
  db: Database.Database,
  threadId: ThreadId,
  options: {
    readonly taskId: TaskId;
    readonly score: MergeSafetyScore;
    readonly reason: string;
    readonly cleanApply: boolean;
    readonly testsPassed: boolean;
    readonly highRiskFiles: readonly string[];
    readonly hasApproval: boolean;
  }
): MergeAssessmentProjection {
  assertThreadExists(db, threadId);
  assertTaskExists(db, options.taskId);

  const assessmentId = generateId('merge_assessment');
  const createdAt = new Date();

  db.prepare(
    `
    INSERT INTO merge_assessments (
      id, thread_id, task_id, score, reason, clean_apply, tests_passed,
      high_risk_files, has_approval, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    assessmentId,
    threadId,
    options.taskId,
    options.score,
    options.reason,
    options.cleanApply ? 1 : 0,
    options.testsPassed ? 1 : 0,
    JSON.stringify(options.highRiskFiles),
    options.hasApproval ? 1 : 0,
    toISOString(createdAt)
  );

  recordEvent(db, threadId, 'merge.evaluated' as EventType, {
    assessmentId,
    taskId: options.taskId,
    score: options.score,
    reason: options.reason,
  });

  return {
    id: assessmentId,
    taskId: options.taskId,
    score: options.score,
    reason: options.reason,
    cleanApply: options.cleanApply,
    testsPassed: options.testsPassed,
    highRiskFiles: options.highRiskFiles,
    hasApproval: options.hasApproval,
    createdAt,
    evidence: [{ kind: 'merge', id: assessmentId, label: 'MergeJudge assessment' }],
  };
}

export function listMergeAssessments(
  db: Database.Database,
  threadId: ThreadId
): readonly MergeAssessmentProjection[] {
  const rows = db
    .prepare(
      `
      SELECT id, task_id, score, reason, clean_apply, tests_passed,
        high_risk_files, has_approval, created_at
      FROM merge_assessments
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `
    )
    .all(threadId) as MergeAssessmentRow[];

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id as TaskId,
    score: row.score as MergeSafetyScore,
    reason: row.reason,
    cleanApply: row.clean_apply === 1,
    testsPassed: row.tests_passed === 1,
    highRiskFiles: JSON.parse(row.high_risk_files) as readonly string[],
    hasApproval: row.has_approval === 1,
    createdAt: new Date(row.created_at),
    evidence: [{ kind: 'merge', id: row.id, label: 'MergeJudge assessment' }],
  }));
}

function assertThreadExists(db: Database.Database, threadId: ThreadId): void {
  const row = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('Thread', threadId);
  }
}

function assertTaskExists(db: Database.Database, taskId: TaskId): void {
  const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('Task', taskId);
  }
}

interface MergeAssessmentRow {
  readonly id: string;
  readonly task_id: string;
  readonly score: string;
  readonly reason: string;
  readonly clean_apply: number;
  readonly tests_passed: number;
  readonly high_risk_files: string;
  readonly has_approval: number;
  readonly created_at: string;
}
