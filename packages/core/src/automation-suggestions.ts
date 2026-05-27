/**
 * Automation Suggestion Engine (S3)
 *
 * Analyzes patterns and session reviews to surface automation candidates:
 * - Pipeline automations: sequences of commands run together repeatedly
 * - Scheduled automations: time-based patterns suggesting scheduled tasks
 * - Workflow automations: common workflow patterns that could be automated
 * - Preemptive automations: suggestions based on failure patterns to prevent issues
 */

import { generateId } from './id-gen.js';
import type { Pattern, PatternSurfaceService } from './pattern-surface.js';
import type { SessionReview, SessionReviewService } from './session-review.js';

// ============================================================================
// Types
// ============================================================================

export type AutomationType = 'pipeline' | 'scheduled' | 'workflow' | 'preemptive';

export interface AutomationSuggestion {
  readonly id: string;
  readonly type: AutomationType;
  readonly title: string;
  readonly description: string;
  readonly trigger: string;
  readonly confidence: number;
  readonly estimatedSavings: number; // minutes per occurrence
  readonly patternIds: readonly string[];
  readonly recommendedAction?: string;
}

export interface AutomationCandidates {
  readonly suggestions: readonly AutomationSuggestion[];
  readonly highPriority: readonly AutomationSuggestion[];
  readonly mediumPriority: readonly AutomationSuggestion[];
  readonly lowPriority: readonly AutomationSuggestion[];
}

// ============================================================================
// Constants
// ============================================================================

const PIPELINE_SEQUENCE_MIN_OCCURRENCES = 3;
const SCHEDULED_ACTIVITY_MIN_FREQUENCY = 5;
const PREEMPTIVE_FAILURE_THRESHOLD = 0.7;
const CONFIDENCE_THRESHOLD_HIGH = 0.8;
const CONFIDENCE_THRESHOLD_MEDIUM = 0.6;

// ============================================================================
// Automation Suggestion Engine Implementation
// ============================================================================

export class AutomationSuggestionEngine {
  constructor(
    private readonly patternService: PatternSurfaceService,
    private readonly sessionService: SessionReviewService
  ) {}

  /**
   * Generate all automation suggestions from patterns and reviews
   */
  generateAutomationSuggestions(
    patterns: readonly Pattern[],
    reviews: readonly SessionReview[]
  ): readonly AutomationSuggestion[] {
    const suggestions: AutomationSuggestion[] = [];

    // Generate pipeline suggestions from workflow patterns
    suggestions.push(...this.generatePipelineSuggestions(patterns));

    // Generate scheduled suggestions from time patterns
    suggestions.push(...this.generateScheduledSuggestions(patterns));

    // Generate preemptive suggestions from failure patterns
    suggestions.push(...this.generatePreemptiveSuggestions(reviews));

    // Generate workflow automation suggestions
    suggestions.push(...this.generateWorkflowSuggestions(patterns));

    // Deduplicate and sort by confidence
    return this.deduplicateAndSort(suggestions);
  }

  /**
   * Get automation candidates categorized by priority
   */
  getAutomationCandidates(): AutomationCandidates {
    const patterns = this.patternService.getPatterns();
    const reviews = this.sessionService.getSessionReviews();
    const suggestions = this.generateAutomationSuggestions(patterns, reviews);

    const highPriority = suggestions.filter((s) => s.confidence >= CONFIDENCE_THRESHOLD_HIGH);
    const mediumPriority = suggestions.filter(
      (s) => s.confidence >= CONFIDENCE_THRESHOLD_MEDIUM && s.confidence < CONFIDENCE_THRESHOLD_HIGH
    );
    const lowPriority = suggestions.filter((s) => s.confidence < CONFIDENCE_THRESHOLD_MEDIUM);

    return {
      suggestions,
      highPriority,
      mediumPriority,
      lowPriority,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generate pipeline automation suggestions from command sequences
   */
  private generatePipelineSuggestions(patterns: readonly Pattern[]): AutomationSuggestion[] {
    const suggestions: AutomationSuggestion[] = [];
    const workflowPatterns = patterns.filter((p) => p.type === 'workflow' && p.confidence >= 0.3);

    for (const pattern of workflowPatterns) {
      if (pattern.frequency < PIPELINE_SEQUENCE_MIN_OCCURRENCES) {
        continue;
      }

      const metadata = this.getWorkflowMetadata(pattern);
      if (!metadata) {
        continue;
      }

      suggestions.push({
        id: generateId('automation'),
        type: 'pipeline',
        title: `Pipeline automation: ${this.truncateTrigger(pattern.trigger)}`,
        description: `This sequence of ${metadata.stepCount} commands has been run ${pattern.frequency} times together.`,
        trigger: pattern.trigger,
        confidence: pattern.confidence,
        estimatedSavings: pattern.frequency * 2, // 2 minutes per pipeline run
        patternIds: [pattern.id],
        recommendedAction: `Create a combined command or script to run: ${pattern.trigger}`,
      });
    }

    return suggestions;
  }

  /**
   * Generate scheduled automation suggestions from time patterns
   */
  private generateScheduledSuggestions(patterns: readonly Pattern[]): AutomationSuggestion[] {
    const suggestions: AutomationSuggestion[] = [];
    const timePatterns = patterns.filter((p) => p.type === 'time_pattern' && p.confidence >= 0.3);

    for (const pattern of timePatterns) {
      if (pattern.frequency < SCHEDULED_ACTIVITY_MIN_FREQUENCY) {
        continue;
      }

      const metadata = pattern.evidence[0] ? this.parseTimeEvidence(pattern) : null;
      const hour = metadata?.hour ?? 9;

      suggestions.push({
        id: generateId('automation'),
        type: 'scheduled',
        title: `Scheduled: ${pattern.trigger}`,
        description: `This activity occurs regularly around ${hour}:00. Consider scheduling it as an automated task.`,
        trigger: `Schedule at ${hour}:00`,
        confidence: pattern.confidence,
        estimatedSavings: 5, // 5 minutes per scheduled occurrence
        patternIds: [pattern.id],
        recommendedAction: `Create a scheduled automation to run at ${hour}:00`,
      });
    }

    return suggestions;
  }

  /**
   * Generate preemptive automation suggestions from failure patterns
   */
  private generatePreemptiveSuggestions(reviews: readonly SessionReview[]): AutomationSuggestion[] {
    const suggestions: AutomationSuggestion[] = [];
    const failurePatterns = this.analyzeFailurePatterns(reviews);

    for (const failure of failurePatterns) {
      if (failure.rate < PREEMPTIVE_FAILURE_THRESHOLD) {
        continue;
      }

      suggestions.push({
        id: generateId('automation'),
        type: 'preemptive',
        title: `Preemptive check: ${failure.taskType}`,
        description: `Task "${failure.taskType}" fails ${(failure.rate * 100).toFixed(0)}% of the time (${failure.count} failures). Consider adding preemptive validation.`,
        trigger: `Before running: ${failure.taskType}`,
        confidence: failure.rate,
        estimatedSavings: failure.count * 3, // 3 minutes saved per prevented failure
        patternIds: failure.patternIds,
        recommendedAction: this.generatePreemptiveAction(failure),
      });
    }

    return suggestions;
  }

  /**
   * Generate workflow automation suggestions
   */
  private generateWorkflowSuggestions(patterns: readonly Pattern[]): AutomationSuggestion[] {
    const suggestions: AutomationSuggestion[] = [];
    const commandPatterns = patterns.filter((p) => p.type === 'command' && p.frequency >= 5);

    // Look for commands that frequently follow each other
    const sequences = this.findCommandSequences(commandPatterns);

    for (const sequence of sequences) {
      suggestions.push({
        id: generateId('automation'),
        type: 'workflow',
        title: `Workflow automation: ${sequence.commands[0]} → ${sequence.commands[sequence.commands.length - 1]}`,
        description: `${sequence.commands.join(', ')} are often run together. Create a workflow to automate this sequence.`,
        trigger: sequence.commands.join(' -> '),
        confidence: sequence.confidence,
        estimatedSavings: sequence.frequency * 1.5,
        patternIds: sequence.patternIds,
        recommendedAction: `Combine these commands into a single workflow: ${sequence.commands.join(' && ')}`,
      });
    }

    return suggestions;
  }

  /**
   * Analyze failure patterns across reviews
   */
  private analyzeFailurePatterns(
    reviews: readonly SessionReview[]
  ): { taskType: string; count: number; rate: number; patternIds: string[] }[] {
    const taskStats: Map<string, { total: number; failures: number; patternIds: Set<string> }> =
      new Map();

    for (const review of reviews) {
      for (const task of review.tasks) {
        let stats = taskStats.get(task.taskType);
        if (!stats) {
          stats = { total: 0, failures: 0, patternIds: new Set() };
          taskStats.set(task.taskType, stats);
        }

        stats.total += 1;
        if (!task.success) {
          stats.failures += 1;
        }
      }
    }

    const patterns: { taskType: string; count: number; rate: number; patternIds: string[] }[] = [];
    for (const [taskType, stats] of Array.from(taskStats.entries())) {
      if (stats.total >= 3) {
        patterns.push({
          taskType,
          count: stats.failures,
          rate: stats.failures / stats.total,
          patternIds: Array.from(stats.patternIds),
        });
      }
    }

    return patterns.sort((a, b) => b.rate - a.rate);
  }

  /**
   * Find command sequences from command patterns
   */
  private findCommandSequences(
    commandPatterns: readonly Pattern[]
  ): { commands: string[]; frequency: number; confidence: number; patternIds: string[] }[] {
    const sequences: {
      commands: string[];
      frequency: number;
      confidence: number;
      patternIds: string[];
    }[] = [];

    // Group commands by thread/context using evidence
    const evidenceMap: Map<string, { command: string; patternId: string; frequency: number }[]> =
      new Map();

    for (const pattern of commandPatterns) {
      for (const evidence of pattern.evidence) {
        if (evidence.startsWith('thread:')) {
          const threadId = evidence;
          const existing = evidenceMap.get(threadId) ?? [];
          existing.push({
            command: pattern.trigger,
            patternId: pattern.id,
            frequency: pattern.frequency,
          });
          evidenceMap.set(threadId, existing);
        }
      }
    }

    // Find sequential patterns within each context
    for (const [, commands] of Array.from(evidenceMap.entries())) {
      if (commands.length < 2) {
        continue;
      }

      // Sort by frequency to find most common sequence
      commands.sort((a, b) => b.frequency - a.frequency);

      // Create pairs/triplets of commonly used commands
      for (let i = 0; i < commands.length - 1; i++) {
        const seq = [commands[i].command, commands[i + 1].command];
        const minFreq = Math.min(commands[i].frequency, commands[i + 1].frequency);

        if (minFreq >= 3) {
          sequences.push({
            commands: seq,
            frequency: minFreq,
            confidence: Math.min(0.9, minFreq / 10),
            patternIds: [commands[i].patternId, commands[i + 1].patternId],
          });
        }
      }
    }

    return sequences;
  }

  /**
   * Generate preemptive action recommendation
   */
  private generatePreemptiveAction(failure: {
    taskType: string;
    count: number;
    rate: number;
    patternIds: string[];
  }): string {
    if (failure.rate > 0.9) {
      return `Block this task by default and require user confirmation before proceeding.`;
    }
    if (failure.rate > 0.7) {
      return `Add validation checks before running "${failure.taskType}" to catch common failure conditions.`;
    }
    return `Log warnings when "${failure.taskType}" is about to run based on its ${(failure.rate * 100).toFixed(0)}% failure rate.`;
  }

  /**
   * Get workflow metadata from pattern
   */
  private getWorkflowMetadata(pattern: Pattern): { stepCount: number } | null {
    // Workflow triggers are stored as "step1 -> step2 -> step3"
    const steps = pattern.trigger.split(' -> ');
    if (steps.length < 2) {
      return null;
    }
    return { stepCount: steps.length };
  }

  /**
   * Parse time evidence from pattern
   */
  private parseTimeEvidence(pattern: Pattern): { hour: number } | null {
    const hourEvidence = pattern.evidence.find((e) => e.startsWith('hour:'));
    if (!hourEvidence) {
      return null;
    }
    const hour = parseInt(hourEvidence.replace('hour:', ''), 10);
    return Number.isNaN(hour) ? null : { hour };
  }

  /**
   * Truncate trigger string for display
   */
  private truncateTrigger(trigger: string, maxLength = 50): string {
    if (trigger.length <= maxLength) {
      return trigger;
    }
    return trigger.substring(0, maxLength - 3) + '...';
  }

  /**
   * Deduplicate suggestions and sort by confidence
   */
  private deduplicateAndSort(suggestions: AutomationSuggestion[]): AutomationSuggestion[] {
    const seen = new Set<string>();
    const unique: AutomationSuggestion[] = [];

    for (const suggestion of suggestions) {
      const key = `${suggestion.type}:${suggestion.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }

    return unique.sort((a, b) => b.confidence - a.confidence);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAutomationSuggestionEngine(
  patternService: PatternSurfaceService,
  sessionService: SessionReviewService
): AutomationSuggestionEngine {
  return new AutomationSuggestionEngine(patternService, sessionService);
}

/**
 * Standalone function to generate automation suggestions
 */
export function generateAutomationSuggestions(
  patterns: readonly Pattern[],
  reviews: readonly SessionReview[]
): readonly AutomationSuggestion[] {
  // Create minimal services for standalone use
  const patternService = {
    getPatterns: () => patterns,
  } as PatternSurfaceService;

  const sessionService = {
    getSessionReviews: () => reviews,
  } as SessionReviewService;

  const engine = new AutomationSuggestionEngine(patternService, sessionService);
  return engine.generateAutomationSuggestions(patterns, reviews);
}
