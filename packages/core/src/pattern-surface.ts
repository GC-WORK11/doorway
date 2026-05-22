/**
 * Pattern Surface Service (S1)
 * 
 * Tracks recurring patterns in user behavior:
 * - Command patterns: repeated commands suggesting automation opportunity
 * - Model preferences: user tends to use specific models for specific tasks
 * - Tool success rates: track which tools succeed/fail in which contexts
 * - Time patterns: when user typically performs certain activities
 * - Workflow patterns: sequences of commands that repeat together
 */

import type Database from 'better-sqlite3';
import { generateId, toISOString } from './id-gen.js';

// ============================================================================
// Types
// ============================================================================

export type PatternType = 'command' | 'model_preference' | 'tool_success_rate' | 'time_pattern' | 'workflow';

export interface Pattern {
  readonly id: string;
  readonly type: PatternType;
  readonly trigger: string;
  readonly frequency: number;
  readonly lastSeen: Date;
  readonly confidence: number; // 0-1
  readonly suggestion?: string;
  readonly evidence: readonly string[]; // file refs, command refs
}

export interface PatternSuggestion {
  readonly patternId: string;
  readonly suggestion: string;
  readonly estimatedSavingsMinutes: number;
  readonly confidence: number;
}

export type PatternEvent = {
  readonly type: 'command';
  readonly command: string;
  readonly projectId?: string;
  readonly threadId?: string;
  readonly timestamp: Date;
} | {
  readonly type: 'model_preference';
  readonly taskType: string;
  readonly modelId: string;
  readonly projectId?: string;
  readonly timestamp: Date;
} | {
  readonly type: 'tool_success_rate';
  readonly toolId: string;
  readonly success: boolean;
  readonly errorType?: string;
  readonly projectId?: string;
  readonly timestamp: Date;
} | {
  readonly type: 'time_pattern';
  readonly activity: string;
  readonly hourOfDay: number;
  readonly dayOfWeek?: number;
  readonly projectId?: string;
  readonly timestamp: Date;
} | {
  readonly type: 'workflow';
  readonly steps: readonly string[];
  readonly projectId?: string;
  readonly threadId?: string;
  readonly timestamp: Date;
};

export interface ModelPreference {
  readonly taskType: string;
  readonly modelId: string;
  readonly confidence: number;
  readonly sampleSize: number;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_COMMAND_FREQUENCY_FOR_SUGGESTION = 3;
const MIN_WORKFLOW_FREQUENCY_FOR_SUGGESTION = 2;
const MIN_SUCCESS_RATE_SAMPLE_SIZE = 3;
const TIME_PATTERN_WINDOW_HOURS = 4;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

// ============================================================================
// Storage Interface (for in-memory pattern tracking)
// ============================================================================

interface StoredPattern {
  id: string;
  type: PatternType;
  trigger: string;
  frequency: number;
  firstSeen: Date;
  lastSeen: Date;
  confidence: number;
  suggestion?: string;
  evidence: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Pattern Surface Service Implementation
// ============================================================================

export class PatternSurfaceService {
  private patterns: Map<string, StoredPattern> = new Map();
  private modelPreferences: Map<string, ModelPreference> = new Map();
  private recentEvents: PatternEvent[] = [];
  private readonly maxRecentEvents = 1000;

  constructor(private readonly db?: Database.Database) {
    if (db) {
      this.loadFromDatabase(db);
    }
  }

  /**
   * Record a new pattern event
   */
  recordEvent(event: PatternEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    switch (event.type) {
      case 'command':
        this.recordCommandPattern(event);
        break;
      case 'model_preference':
        this.recordModelPreference(event);
        break;
      case 'tool_success_rate':
        this.recordToolSuccessRate(event);
        break;
      case 'time_pattern':
        this.recordTimePattern(event);
        break;
      case 'workflow':
        this.recordWorkflowPattern(event);
        break;
    }
  }

  /**
   * Get all patterns, optionally filtered by type
   */
  getPatterns(type?: PatternType): readonly Pattern[] {
    const patterns: Pattern[] = [];
    for (const pattern of Array.from(this.patterns.values())) {
      if (type === undefined || pattern.type === type) {
        patterns.push(this.storedToPattern(pattern));
      }
    }
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get pattern suggestions based on tracked patterns
   */
  getSuggestions(): readonly PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    for (const pattern of Array.from(this.patterns.values())) {
      if (pattern.frequency < MIN_COMMAND_FREQUENCY_FOR_SUGGESTION) {
        continue;
      }

      const suggestion = this.generateSuggestionForPattern(pattern);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get model preference for a specific task type
   */
  getModelPreference(taskType: string): string | null {
    const pref = this.modelPreferences.get(taskType);
    if (!pref || pref.confidence < DEFAULT_CONFIDENCE_THRESHOLD) {
      return null;
    }
    return pref.modelId;
  }

  /**
   * Get all model preferences
   */
  getModelPreferences(): readonly ModelPreference[] {
    return Array.from(this.modelPreferences.values());
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private recordCommandPattern(event: Extract<PatternEvent, { type: 'command' }>): void {
    const key = `cmd:${event.command}`;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.frequency += 1;
      existing.lastSeen = event.timestamp;
      existing.confidence = this.calculateConfidence(existing.frequency, 10);
      if (event.threadId) {
        existing.evidence.push(`thread:${event.threadId}`);
      }
    } else {
      this.patterns.set(key, {
        id: generateId('pattern'),
        type: 'command',
        trigger: event.command,
        frequency: 1,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        confidence: 0.1,
        evidence: event.threadId ? [`thread:${event.threadId}`] : [],
      });
    }
  }

  private recordModelPreference(event: Extract<PatternEvent, { type: 'model_preference' }>): void {
    const taskType = event.taskType;
    const existing = this.modelPreferences.get(taskType);

    if (existing) {
      if (existing.modelId === event.modelId) {
        const newSampleSize = existing.sampleSize + 1;
        const newConfidence = Math.min(0.95, newSampleSize / (newSampleSize + 2));
        this.modelPreferences.set(taskType, {
          ...existing,
          sampleSize: newSampleSize,
          confidence: newConfidence,
        });
      } else {
        // Preference shifted - reduce confidence
        const newSampleSize = existing.sampleSize + 1;
        const newConfidence = existing.confidence * 0.7;
        if (newConfidence < 0.2) {
          // Switch to new model
          this.modelPreferences.set(taskType, {
            taskType,
            modelId: event.modelId,
            confidence: 0.3,
            sampleSize: newSampleSize,
          });
        } else {
          this.modelPreferences.set(taskType, {
            ...existing,
            sampleSize: newSampleSize,
            confidence: newConfidence,
          });
        }
      }
    } else {
      this.modelPreferences.set(taskType, {
        taskType,
        modelId: event.modelId,
        confidence: 0.3,
        sampleSize: 1,
      });
    }

    // Also store as pattern for tracking
    const patternKey = `model:${taskType}:${event.modelId}`;
    const existingPattern = this.patterns.get(patternKey);
    if (existingPattern) {
      existingPattern.frequency += 1;
      existingPattern.lastSeen = event.timestamp;
      existingPattern.confidence = this.calculateConfidence(existingPattern.frequency, 5);
    } else {
      this.patterns.set(patternKey, {
        id: generateId('pattern'),
        type: 'model_preference',
        trigger: `${taskType} -> ${event.modelId}`,
        frequency: 1,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        confidence: 0.3,
        evidence: [],
        metadata: { taskType, modelId: event.modelId },
      });
    }
  }

  private recordToolSuccessRate(event: Extract<PatternEvent, { type: 'tool_success_rate' }>): void {
    const key = `tool:${event.toolId}`;
    const existing = this.patterns.get(key);

    if (existing) {
      const metadata = existing.metadata as { successes?: number; failures?: number } | undefined;
      const successes = (metadata?.successes ?? 0) + (event.success ? 1 : 0);
      const failures = (metadata?.failures ?? 0) + (event.success ? 0 : 1);
      const total = successes + failures;

      existing.metadata = { successes, failures };
      existing.frequency = total;
      existing.lastSeen = event.timestamp;
      existing.confidence = total >= MIN_SUCCESS_RATE_SAMPLE_SIZE 
        ? this.calculateConfidence(successes, total) 
        : 0;

      if (!event.success && event.errorType) {
        existing.evidence.push(`error:${event.errorType}`);
        existing.suggestion = this.generateToolFailureSuggestion(event.toolId, event.errorType);
      }
    } else {
      this.patterns.set(key, {
        id: generateId('pattern'),
        type: 'tool_success_rate',
        trigger: event.toolId,
        frequency: 1,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        confidence: 0.1,
        evidence: event.success ? [] : [`error:${event.errorType ?? 'unknown'}`],
        metadata: { 
          successes: event.success ? 1 : 0, 
          failures: event.success ? 0 : 1,
          lastErrorType: event.errorType 
        },
        suggestion: !event.success ? this.generateToolFailureSuggestion(event.toolId, event.errorType) : undefined,
      });
    }
  }

  private recordTimePattern(event: Extract<PatternEvent, { type: 'time_pattern' }>): void {
    const hourKey = Math.floor(event.hourOfDay / TIME_PATTERN_WINDOW_HOURS) * TIME_PATTERN_WINDOW_HOURS;
    const key = `time:${event.activity}:${hourKey}`;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.frequency += 1;
      existing.lastSeen = event.timestamp;
      existing.confidence = this.calculateConfidence(existing.frequency, 10);
      if (event.dayOfWeek !== undefined) {
        const metadata = existing.metadata as { hours?: Set<number>; days?: Set<number> } | undefined;
        metadata?.hours?.add(event.hourOfDay);
        metadata?.days?.add(event.dayOfWeek);
      }
    } else {
      this.patterns.set(key, {
        id: generateId('pattern'),
        type: 'time_pattern',
        trigger: event.activity,
        frequency: 1,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        confidence: 0.1,
        evidence: [`hour:${event.hourOfDay}`],
        metadata: { 
          preferredHourStart: hourKey,
          hours: new Set([event.hourOfDay]),
          days: event.dayOfWeek !== undefined ? new Set([event.dayOfWeek]) : undefined,
        },
      });
    }
  }

  private recordWorkflowPattern(event: Extract<PatternEvent, { type: 'workflow' }>): void {
    const workflowKey = event.steps.join(' -> ');
    const key = `workflow:${workflowKey}`;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.frequency += 1;
      existing.lastSeen = event.timestamp;
      existing.confidence = this.calculateConfidence(existing.frequency, 5);
      if (event.threadId) {
        existing.evidence.push(`thread:${event.threadId}`);
      }
    } else {
      this.patterns.set(key, {
        id: generateId('pattern'),
        type: 'workflow',
        trigger: workflowKey,
        frequency: 1,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        confidence: 0.2,
        evidence: event.threadId ? [`thread:${event.threadId}`] : [],
        metadata: { steps: event.steps },
      });
    }
  }

  private generateSuggestionForPattern(pattern: StoredPattern): PatternSuggestion | null {
    switch (pattern.type) {
      case 'command':
        if (pattern.frequency < MIN_COMMAND_FREQUENCY_FOR_SUGGESTION) {
          return null;
        }
        return {
          patternId: pattern.id,
          suggestion: `Consider creating an alias or automation for "${pattern.trigger}" (run ${pattern.frequency} times)`,
          estimatedSavingsMinutes: pattern.frequency * 0.5, // 30 seconds saved per occurrence
          confidence: pattern.confidence,
        };

      case 'workflow':
        if (pattern.frequency < MIN_WORKFLOW_FREQUENCY_FOR_SUGGESTION) {
          return null;
        }
        return {
          patternId: pattern.id,
          suggestion: `Create a pipeline automation for: ${pattern.trigger}`,
          estimatedSavingsMinutes: pattern.frequency * 2, // 2 minutes per pipeline run
          confidence: pattern.confidence,
        };

      case 'tool_success_rate': {
        if (pattern.metadata && (pattern.metadata as { failures?: number }).failures && pattern.confidence > 0.7) {
          return {
            patternId: pattern.id,
            suggestion: `Tool "${pattern.trigger}" has high failure rate. Consider preemptive checks.`,
            estimatedSavingsMinutes: (pattern.metadata as { failures?: number }).failures! * 3,
            confidence: pattern.confidence,
          };
        }
        return null;
      }

      case 'time_pattern':
        if (pattern.frequency >= 5 && pattern.confidence > 0.7) {
          const metadata = pattern.metadata as { preferredHourStart?: number } | undefined;
          return {
            patternId: pattern.id,
            suggestion: `Schedule this activity around hour ${metadata?.preferredHourStart ?? 9}`,
            estimatedSavingsMinutes: 5,
            confidence: pattern.confidence,
          };
        }
        return null;

      default:
        return null;
    }
  }

  private generateToolFailureSuggestion(toolId: string, errorType?: string): string {
    if (errorType === 'pre-commit') {
      return `Pre-commit hook fails for ${toolId}. Try: git commit --no-verify`;
    }
    if (errorType === 'permission') {
      return `Permission denied for ${toolId}. Check file permissions.`;
    }
    return `Investigate failures in ${toolId} before next use.`;
  }

  private calculateConfidence(observations: number, scale: number): number {
    // Simple confidence calculation based on observation count
    return Math.min(0.95, 0.1 + (observations / (observations + scale)) * 0.85);
  }

  private storedToPattern(stored: StoredPattern): Pattern {
    return {
      id: stored.id,
      type: stored.type,
      trigger: stored.trigger,
      frequency: stored.frequency,
      lastSeen: stored.lastSeen,
      confidence: stored.confidence,
      suggestion: stored.suggestion,
      evidence: [...stored.evidence],
    };
  }

  private loadFromDatabase(db: Database.Database): void {
    // Load patterns from pattern_memory_items table
    const rows = db.prepare(
      `SELECT id, kind as type, pattern_key as trigger, occurrences as frequency, 
              confidence, evidence_json, last_seen_at, first_seen_at
       FROM pattern_memory_items
       WHERE kind IN ('command', 'model_preference', 'tool_success_rate', 'time_pattern', 'workflow')`
    ).all() as DatabaseRow[];

    for (const row of rows) {
      const evidence = JSON.parse(row.evidence_json as string) as string[];
      this.patterns.set(row.trigger as string, {
        id: row.id as string,
        type: row.type as PatternType,
        trigger: row.trigger as string,
        frequency: row.frequency as number,
        firstSeen: new Date(row.first_seen_at as string),
        lastSeen: new Date(row.last_seen_at as string),
        confidence: row.confidence as number,
        evidence,
      });
    }
  }

  /**
   * Persist patterns to database (for future use with a proper persistence layer)
   */
  persistToDatabase(db: Database.Database, projectId: string): void {
    const upsert = db.prepare(`
      INSERT INTO pattern_memory_items (
        id, project_id, kind, pattern_key, summary, occurrences, confidence,
        evidence_json, first_seen_at, last_seen_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, kind, pattern_key) DO UPDATE SET
        occurrences = excluded.occurrences,
        confidence = excluded.confidence,
        evidence_json = excluded.evidence_json,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `);

    for (const pattern of Array.from(this.patterns.values())) {
      upsert.run(
        pattern.id,
        projectId,
        pattern.type,
        pattern.trigger,
        `Pattern: ${pattern.trigger}`,
        pattern.frequency,
        pattern.confidence,
        JSON.stringify(pattern.evidence),
        toISOString(pattern.firstSeen),
        toISOString(pattern.lastSeen),
        toISOString(new Date())
      );
    }
  }
}

interface DatabaseRow {
  id: string;
  type: string;
  trigger: string;
  frequency: number;
  confidence: number;
  evidence_json: string;
  first_seen_at: string;
  last_seen_at: string;
}

// ============================================================================
// Factory function
// ============================================================================

export function createPatternSurfaceService(db?: Database.Database): PatternSurfaceService {
  return new PatternSurfaceService(db);
}
