/**
 * Session Review Service (S2)
 *
 * Tracks success/failure patterns across sessions:
 * - Records task outcomes (success, transient failure, permanent failure)
 * - Tracks retry counts per task type
 * - Classifies errors to guide retry vs. alternative strategies
 * - Generates suggestions for session improvement
 */

import type Database from 'better-sqlite3';
import { generateId, toISOString } from './id-gen.js';

// ============================================================================
// Types
// ============================================================================

export interface SessionReview {
  readonly sessionId: string;
  readonly timestamp: Date;
  readonly tasks: readonly TaskOutcome[];
  readonly modelUsage: Record<string, number>; // model → count
  readonly overallSuccess: boolean;
  readonly suggestions: readonly string[];
}

export interface TaskOutcome {
  readonly taskType: string;
  readonly success: boolean;
  readonly errorType?: 'transient' | 'permanent' | 'unknown';
  readonly retryCount: number;
  readonly duration: number;
  readonly timestamp?: Date;
}

export type SessionReviewEvent =
  | {
      readonly type: 'task_started';
      readonly taskType: string;
      readonly modelId?: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: 'task_completed';
      readonly taskType: string;
      readonly success: boolean;
      readonly errorType?: 'transient' | 'permanent' | 'unknown';
      readonly retryCount: number;
      readonly duration: number;
      readonly modelId?: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: 'task_rejected';
      readonly taskType: string;
      readonly reason: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: 'session_completed';
      readonly overallSuccess: boolean;
      readonly timestamp: Date;
    };

export interface SessionMetrics {
  readonly totalSessions: number;
  readonly successfulSessions: number;
  readonly failedSessions: number;
  readonly averageTaskDuration: number;
  readonly averageRetryCount: number;
  readonly transientFailureRate: number;
  readonly permanentFailureRate: number;
  readonly modelUsageStats: Record<string, { count: number; successRate: number }>;
}

// ============================================================================
// Error Classification Heuristics
// ============================================================================

const TRANSIENT_ERROR_PATTERNS = [
  'timeout',
  'network',
  'connection',
  'temporarily',
  'rate limit',
  '429',
  '503',
  '502',
  '504',
  'econnrefused',
  'etimedout',
  'enotfound',
];

const PERMANENT_ERROR_PATTERNS = [
  'syntax error',
  'syntaxerror',
  'type error',
  'typeerror',
  'not found',
  'does not exist',
  'permission denied',
  'access denied',
  'invalid',
  'cannot',
  'failed to',
  'enoent',
  'eacces',
  'command not found',
  'undefined',
  'null',
];

// ============================================================================
// Session Review Service Implementation
// ============================================================================

export class SessionReviewService {
  private sessionTasks: Map<string, TaskOutcome[]> = new Map();
  private sessionModelUsage: Map<string, Record<string, number>> = new Map();
  private pendingTasks: Map<string, { taskType: string; startTime: Date; modelId?: string }> =
    new Map();
  private completedSessions: SessionReview[] = [];

  constructor(private readonly db?: Database.Database) {
    if (db) {
      this.loadFromDatabase(db);
    }
  }

  /**
   * Record a session review event
   */
  recordEvent(event: SessionReviewEvent): void {
    switch (event.type) {
      case 'task_started':
        this.recordTaskStarted(event);
        break;
      case 'task_completed':
        this.recordTaskCompleted(event);
        break;
      case 'task_rejected':
        this.recordTaskRejected(event);
        break;
      case 'session_completed':
        this.finalizeSession(event);
        break;
    }
  }

  /**
   * Get all session reviews
   */
  getSessionReviews(): readonly SessionReview[] {
    return [...this.completedSessions];
  }

  /**
   * Get session review by ID
   */
  getSessionReview(sessionId: string): SessionReview | null {
    return this.completedSessions.find((s) => s.sessionId === sessionId) ?? null;
  }

  /**
   * Get metrics aggregated across all sessions
   */
  getMetrics(): SessionMetrics {
    if (this.completedSessions.length === 0) {
      return {
        totalSessions: 0,
        successfulSessions: 0,
        failedSessions: 0,
        averageTaskDuration: 0,
        averageRetryCount: 0,
        transientFailureRate: 0,
        permanentFailureRate: 0,
        modelUsageStats: {},
      };
    }

    let totalTasks = 0;
    let totalDuration = 0;
    let totalRetries = 0;
    let transientFailures = 0;
    let permanentFailures = 0;
    const modelStats: Record<string, { count: number; successes: number }> = {};

    for (const session of this.completedSessions) {
      for (const task of session.tasks) {
        totalTasks += 1;
        totalDuration += task.duration;
        totalRetries += task.retryCount;

        if (!task.success) {
          if (task.errorType === 'transient') {
            transientFailures += 1;
          } else if (task.errorType === 'permanent') {
            permanentFailures += 1;
          }
        }
      }

      for (const [modelId, count] of Object.entries(session.modelUsage)) {
        if (!modelStats[modelId]) {
          modelStats[modelId] = { count: 0, successes: 0 };
        }
        modelStats[modelId].count += count;
      }
    }

    // Calculate per-model success rates
    const modelUsageStats: Record<string, { count: number; successRate: number }> = {};
    for (const [modelId, stats] of Object.entries(modelStats)) {
      let successes = 0;
      for (const session of this.completedSessions) {
        for (const task of session.tasks) {
          if (task.success) {
            // This is a simplification - we'd need task-model mapping for accurate rates
            successes += 1;
          }
        }
      }
      modelUsageStats[modelId] = {
        count: stats.count,
        successRate: totalTasks > 0 ? successes / totalTasks : 0,
      };
    }

    return {
      totalSessions: this.completedSessions.length,
      successfulSessions: this.completedSessions.filter((s) => s.overallSuccess).length,
      failedSessions: this.completedSessions.filter((s) => !s.overallSuccess).length,
      averageTaskDuration: totalTasks > 0 ? totalDuration / totalTasks : 0,
      averageRetryCount: totalTasks > 0 ? totalRetries / totalTasks : 0,
      transientFailureRate: totalTasks > 0 ? transientFailures / totalTasks : 0,
      permanentFailureRate: totalTasks > 0 ? permanentFailures / totalTasks : 0,
      modelUsageStats,
    };
  }

  /**
   * Generate suggestions based on failure patterns
   */
  getSuggestions(): readonly string[] {
    const suggestions: string[] = [];
    const metrics = this.getMetrics();

    if (metrics.transientFailureRate > 0.2) {
      suggestions.push(
        `High transient failure rate (${(metrics.transientFailureRate * 100).toFixed(1)}%). Consider implementing retry with exponential backoff.`
      );
    }

    if (metrics.permanentFailureRate > 0.15) {
      suggestions.push(
        `Elevated permanent failure rate (${(metrics.permanentFailureRate * 100).toFixed(1)}%). Review common failure patterns for root causes.`
      );
    }

    if (metrics.averageRetryCount > 2) {
      suggestions.push(
        `Average retry count is ${metrics.averageRetryCount.toFixed(1)}. Consider preemptive checks before task execution.`
      );
    }

    // Analyze specific error patterns
    const errorPatterns = this.analyzeErrorPatterns();
    for (const pattern of errorPatterns) {
      if (pattern.count >= 3) {
        suggestions.push(this.generateErrorSuggestion(pattern));
      }
    }

    return suggestions;
  }

  /**
   * Get retry recommendations for a task type
   */
  getRetryRecommendation(taskType: string): {
    shouldRetry: boolean;
    backoffMs: number;
    maxRetries: number;
  } {
    const taskOutcomes = this.getTaskOutcomes(taskType);

    if (taskOutcomes.length === 0) {
      return { shouldRetry: true, backoffMs: 1000, maxRetries: 3 };
    }

    const recentFailures = taskOutcomes.filter((t) => !t.success).slice(-5);

    if (recentFailures.length === 0) {
      return { shouldRetry: true, backoffMs: 1000, maxRetries: 3 };
    }

    const lastFailure = recentFailures[recentFailures.length - 1];

    if (lastFailure.errorType === 'permanent') {
      return { shouldRetry: false, backoffMs: 0, maxRetries: 0 };
    }

    if (lastFailure.errorType === 'transient') {
      const retryCount = lastFailure.retryCount;
      const backoffMs = Math.min(30000, 1000 * Math.pow(2, retryCount));
      return { shouldRetry: true, backoffMs, maxRetries: 3 - retryCount };
    }

    // Unknown error type - suggest investigation
    return { shouldRetry: false, backoffMs: 0, maxRetries: 0 };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private recordTaskStarted(event: Extract<SessionReviewEvent, { type: 'task_started' }>): void {
    this.pendingTasks.set(event.taskType, {
      taskType: event.taskType,
      startTime: event.timestamp,
      modelId: event.modelId,
    });

    // Track model usage
    if (event.modelId) {
      const sessionId = this.getCurrentSessionId();
      if (sessionId) {
        const usage = this.sessionModelUsage.get(sessionId) ?? {};
        usage[event.modelId] = (usage[event.modelId] ?? 0) + 1;
        this.sessionModelUsage.set(sessionId, usage);
      }
    }
  }

  private recordTaskCompleted(
    event: Extract<SessionReviewEvent, { type: 'task_completed' }>
  ): void {
    const pending = this.pendingTasks.get(event.taskType);
    const duration = pending
      ? event.timestamp.getTime() - pending.startTime.getTime()
      : event.duration;

    const outcome: TaskOutcome = {
      taskType: event.taskType,
      success: event.success,
      errorType: event.errorType,
      retryCount: event.retryCount,
      duration: duration || event.duration,
      timestamp: event.timestamp,
    };

    const sessionId = this.getCurrentSessionId() ?? generateId('session');
    const tasks = this.sessionTasks.get(sessionId) ?? [];
    tasks.push(outcome);
    this.sessionTasks.set(sessionId, tasks);

    this.pendingTasks.delete(event.taskType);
  }

  private recordTaskRejected(event: Extract<SessionReviewEvent, { type: 'task_rejected' }>): void {
    const sessionId = this.getCurrentSessionId() ?? generateId('session');
    const tasks = this.sessionTasks.get(sessionId) ?? [];

    tasks.push({
      taskType: event.taskType,
      success: false,
      errorType: 'permanent',
      retryCount: 0,
      duration: 0,
    });
    this.sessionTasks.set(sessionId, tasks);
  }

  private finalizeSession(event: Extract<SessionReviewEvent, { type: 'session_completed' }>): void {
    const sessionId = this.getCurrentSessionId() ?? generateId('session');
    const tasks = this.sessionTasks.get(sessionId) ?? [];
    const modelUsage = this.sessionModelUsage.get(sessionId) ?? {};

    const review: SessionReview = {
      sessionId,
      timestamp: event.timestamp,
      tasks,
      modelUsage,
      overallSuccess: event.overallSuccess,
      suggestions: this.generateSessionSuggestions(tasks),
    };

    this.completedSessions.push(review);
    this.sessionTasks.delete(sessionId);
    this.sessionModelUsage.delete(sessionId);
  }

  private generateSessionSuggestions(tasks: readonly TaskOutcome[]): string[] {
    const suggestions: string[] = [];

    const failures = tasks.filter((t) => !t.success);
    if (failures.length === 0) {
      return ['All tasks completed successfully.'];
    }

    const transientCount = failures.filter((f) => f.errorType === 'transient').length;
    const permanentCount = failures.filter((f) => f.errorType === 'permanent').length;
    const unknownCount = failures.filter((f) => f.errorType === 'unknown').length;

    if (transientCount > 0) {
      suggestions.push(`${transientCount} transient failure(s) - retry with backoff recommended.`);
    }

    if (permanentCount > 0) {
      suggestions.push(`${permanentCount} permanent failure(s) - investigate root cause.`);
    }

    if (unknownCount > 0) {
      suggestions.push(`${unknownCount} unknown failure(s) - additional diagnostics needed.`);
    }

    const highRetryTasks = tasks.filter((t) => t.retryCount >= 2);
    if (highRetryTasks.length > 0) {
      suggestions.push(
        `Consider preemptive checks for: ${highRetryTasks.map((t) => t.taskType).join(', ')}`
      );
    }

    return suggestions;
  }

  private analyzeErrorPatterns(): { errorType: string; taskType: string; count: number }[] {
    const patterns: Map<string, { errorType: string; taskType: string; count: number }> = new Map();

    for (const session of this.completedSessions) {
      for (const task of session.tasks) {
        if (!task.success && task.errorType) {
          const key = `${task.taskType}:${task.errorType}`;
          const existing = patterns.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            patterns.set(key, {
              errorType: task.errorType,
              taskType: task.taskType,
              count: 1,
            });
          }
        }
      }
    }

    return Array.from(patterns.values());
  }

  private generateErrorSuggestion(pattern: {
    errorType: string;
    taskType: string;
    count: number;
  }): string {
    if (pattern.errorType === 'transient') {
      return `Task "${pattern.taskType}" has ${pattern.count} transient failures. Consider adding retry logic or pre-flight checks.`;
    }
    if (pattern.errorType === 'permanent') {
      return `Task "${pattern.taskType}" has ${pattern.count} permanent failures. This may indicate a configuration or setup issue.`;
    }
    return `Task "${pattern.taskType}" has ${pattern.count} failures of unknown type. Investigate logging to determine root cause.`;
  }

  private getTaskOutcomes(taskType: string): TaskOutcome[] {
    const outcomes: TaskOutcome[] = [];
    for (const session of this.completedSessions) {
      for (const task of session.tasks) {
        if (task.taskType === taskType) {
          outcomes.push(task);
        }
      }
    }
    for (const tasks of this.sessionTasks.values()) {
      for (const task of tasks) {
        if (task.taskType === taskType) {
          outcomes.push(task);
        }
      }
    }
    return outcomes.sort((a, b) => {
      const aTime = a.timestamp?.getTime() ?? 0;
      const bTime = b.timestamp?.getTime() ?? 0;
      return bTime - aTime;
    });
  }

  private getCurrentSessionId(): string | undefined {
    // In a real implementation, this would track the current session context
    // For now, we use the most recent session with pending tasks
    for (const entry of Array.from(this.sessionTasks.entries())) {
      const [sessionId, tasks] = entry;
      if (tasks.length > 0) {
        return sessionId;
      }
    }
    return undefined;
  }

  private loadFromDatabase(db: Database.Database): void {
    // Load session reviews from database
    // This would require a session_reviews table to be implemented
    // For now, we start fresh and persist as needed
  }

  /**
   * Persist session reviews to database (for future use)
   */
  persistToDatabase(db: Database.Database): void {
    // This would persist completed sessions to a session_reviews table
    // Implementation would require adding the table to database.ts first
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Classify an error message as transient or permanent
 */
export function classifyError(errorMessage: string): 'transient' | 'permanent' | 'unknown' {
  const lowerMessage = errorMessage.toLowerCase();

  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (lowerMessage.includes(pattern)) {
      return 'transient';
    }
  }

  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (lowerMessage.includes(pattern)) {
      return 'permanent';
    }
  }

  return 'unknown';
}

/**
 * Calculate recommended backoff time for retries
 */
export function calculateBackoff(retryCount: number, baseMs = 1000): number {
  return Math.min(baseMs * Math.pow(2, retryCount), 30000);
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSessionReviewService(db?: Database.Database): SessionReviewService {
  return new SessionReviewService(db);
}
