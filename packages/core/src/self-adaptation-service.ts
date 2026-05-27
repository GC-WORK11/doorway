/**
 * Self-Adaptation Service
 *
 * Implements the Self-Adapting IDE feature for Doorway:
 * - Adaptation Triggers: UI adaptation based on behavior patterns
 * - Project Pattern Learning: Learn project structure, conventions
 * - Context Compaction: Automatic context management
 * - Model Switching: Dynamic model selection based on task
 */

import type Database from 'better-sqlite3';
import type { ThreadId, ProjectId, ProviderModelProjection } from '@doorway/protocol';
import { DoorwayEventBus } from './event-bus.js';
import { getThreadOperationalMemory } from './operational-memory.js';
import { createCompactCheckpoint } from './compact-checkpoint.js';
import { listProviderModels } from './provider-models.js';
import { createPatternSurfaceService, PatternSurfaceService, type PatternEvent } from './pattern-surface.js';

// ============================================================================
// Types
// ============================================================================

export type AdaptationTriggerType =
  | 'adjust_compaction'
  | 'change_model'
  | 'add_context'
  | 'adapt_ui'
  | 'update_config'
  | 'retry_task'
  | 'learn_project';

export interface AdaptationTrigger {
  pattern: RegExp;
  action: AdaptationTriggerType;
  confidence: number;
  description: string;
}

export interface AdaptationContext {
  projectId: ProjectId;
  threadId: ThreadId;
  currentInput: string;
  userPreferences: UserPreferences;
  projectContext: ProjectContext;
  sessionContext: SessionContext;
}

export interface UserPreferences {
  theme?: 'dark' | 'light';
  autoCompactThreshold?: number;
  preferredModel?: string;
  compactModeEnabled?: boolean;
  [key: string]: unknown;
}

export interface ProjectContext {
  framework?: string;
  language?: string;
  packageManager?: string;
  projectPath?: string;
  recentCommands?: readonly string[];
  filePatterns?: readonly string[];
}

export interface SessionContext {
  errorCount?: number;
  retryCount?: number;
  contextTokenPercent?: number;
  lastModelUsed?: string;
  taskComplexity?: 'low' | 'medium' | 'high';
}

export interface AdaptationResult {
  applied: boolean;
  action: AdaptationTriggerType;
  message: string;
  changes?: Record<string, unknown>;
  confidence: number;
}

export interface CompactionStrategy {
  threshold: number;
  aggressive: boolean;
  preserveRecentMessages: number;
  compressPatterns: boolean;
}

export interface ModelSelection {
  modelId: string;
  providerId: string;
  reason: string;
  confidence: number;
  taskType: string;
}

export interface LearnedPattern {
  readonly id: string;
  readonly type: string;
  readonly trigger: string;
  readonly frequency: number;
  readonly lastSeen: Date;
  readonly confidence: number;
  readonly suggestion?: string;
}

// ============================================================================
// Task Type Classification
// ============================================================================

type TaskCategory = 'debug' | 'build' | 'review' | 'refactor' | 'test' | 'unknown';

const TASK_PATTERNS: readonly [TaskCategory, RegExp][] = [
  ['debug', /(?:debug|fix|debugging|broken|error|issue|problem|not working)/i],
  ['build', /(?:build|create|implement|add|new|feature|make)/i],
  ['review', /(?:review|check|audit|analyze|examine|look at)/i],
  ['refactor', /(?:refactor|restructure|cleanup|clean|reorganize|improve)/i],
  ['test', /(?:test|testing|spec|coverage|verify|validation)/i],
];

const MODEL_FOR_TASK: Record<TaskCategory, readonly string[]> = {
  debug: ['claude-opus', 'claude-sonnet'],
  build: ['claude-sonnet', 'claude-opus'],
  review: ['claude-opus', 'claude-sonnet'],
  refactor: ['claude-sonnet', 'claude-opus'],
  test: ['claude-sonnet', 'claude'],
  unknown: ['claude-sonnet'],
};

const COMPLEXITY_INDICATORS: readonly [TaskCategory, RegExp][] = [
  ['debug', /complex|intricate|multiple.*files|across.*modules|architecture/i],
  ['build', /architecture|system|full-stack|microservice|distributed/i],
  ['review', /security|performance|critical|thorough|detailed/i],
];

// ============================================================================
// Default Triggers
// ============================================================================

const DEFAULT_TRIGGERS: readonly AdaptationTrigger[] = [
  {
    pattern: /(?:enable|turn on|start|setup) auto-?compact(?: mode)?/i,
    action: 'adjust_compaction',
    confidence: 0.95,
    description: 'Enable aggressive context compaction',
  },
  {
    pattern: /(?:disable|turn off|stop) auto-?compact/i,
    action: 'adjust_compaction',
    confidence: 0.95,
    description: 'Disable auto-compact mode',
  },
  {
    pattern: /\/compact\s+(\d+)%/i,
    action: 'adjust_compaction',
    confidence: 0.9,
    description: 'Set specific compaction threshold',
  },
  {
    pattern: /(?:switch to|use|run with)\s+(claude|gpt|gemini|codex)/i,
    action: 'change_model',
    confidence: 0.85,
    description: 'Switch to a specific model provider',
  },
  {
    pattern: /(?:switch to|use)\s+(claude-)?(opus|sonnet|haiku)/i,
    action: 'change_model',
    confidence: 0.9,
    description: 'Switch to a specific Claude model',
  },
  {
    pattern: /(?:switch to|use) (dark|light) mode/i,
    action: 'adapt_ui',
    confidence: 0.95,
    description: 'Switch UI theme',
  },
  {
    pattern: /remember.*from.*project/i,
    action: 'add_context',
    confidence: 0.75,
    description: 'Learn from project patterns',
  },
  {
    pattern: /\/adapt\s+now/i,
    action: 'learn_project',
    confidence: 0.9,
    description: 'Trigger immediate project analysis',
  },
  {
    pattern: /retry.*task/i,
    action: 'retry_task',
    confidence: 0.8,
    description: 'Retry with different approach',
  },
];

// ============================================================================
// Self-Adaptation Service Implementation
// ============================================================================

export class SelfAdaptationService {
  private readonly triggers: AdaptationTrigger[];
  private readonly patternSurface: PatternSurfaceService;
  private readonly preferences: Map<string, UserPreferences>;
  private readonly compactionStrategies: Map<string, CompactionStrategy>;
  private readonly modelSelections: Map<string, string>;

  constructor(
    private readonly db: Database.Database,
    private readonly eventBus: DoorwayEventBus,
    private readonly projectPath: string
  ) {
    this.triggers = [...DEFAULT_TRIGGERS];
    this.patternSurface = createPatternSurfaceService(db);
    this.preferences = new Map();
    this.compactionStrategies = new Map();
    this.modelSelections = new Map();

    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    this.compactionStrategies.set('default', {
      threshold: 0.7,
      aggressive: false,
      preserveRecentMessages: 10,
      compressPatterns: true,
    });
    this.compactionStrategies.set('aggressive', {
      threshold: 0.85,
      aggressive: true,
      preserveRecentMessages: 5,
      compressPatterns: true,
    });
    this.compactionStrategies.set('minimal', {
      threshold: 0.5,
      aggressive: false,
      preserveRecentMessages: 15,
      compressPatterns: false,
    });
  }

  /**
   * Evaluate user input and apply adaptations
   */
  async evaluateAdaptation(context: AdaptationContext): Promise<AdaptationResult | null> {
    const trigger = this.matchTrigger(context.currentInput);
    if (!trigger) {
      return null;
    }

    const result = await this.executeAdaptation(context, trigger);

    if (result.applied) {
      this.eventBus.emit('adaptation_applied', {
        threadId: context.threadId,
        action: result.action,
        changes: result.changes,
        confidence: result.confidence,
      });

      this.recordAdaptationPattern(context, trigger, result);
    }

    return result;
  }

  /**
   * Evaluate context and suggest adaptations based on patterns
   */
  async evaluateContextAdaptations(context: AdaptationContext): Promise<readonly AdaptationResult[]> {
    const results: AdaptationResult[] = [];

    if (this.shouldAutoCompact(context)) {
      results.push(this.createAutoCompactResult(context));
    }

    if (this.shouldSwitchModel(context.sessionContext)) {
      results.push(await this.createModelSwitchResult(context));
    }

    if (this.shouldLearnProject(context)) {
      results.push(this.createLearnProjectResult(context));
    }

    return results;
  }

  /**
   * Create a compact checkpoint for the current thread
   */
  createCompaction(context: AdaptationContext): string | null {
    try {
      const checkpoint = createCompactCheckpoint(this.db, context.threadId);
      return checkpoint.id;
    } catch {
      return null;
    }
  }

  /**
   * Get recommended model for current task
   */
  getRecommendedModel(context: AdaptationContext): ModelSelection | null {
    const taskCategory = this.classifyTask(context.currentInput);
    const complexity = this.assessComplexity(context.sessionContext);

    const preferredModels = this.getPreferredModelsForTask(taskCategory, complexity);

    const availableModels = listProviderModels(this.db);

    for (const preferred of preferredModels) {
      const match = availableModels.find((m) =>
        m.modelId.toLowerCase().includes(preferred.toLowerCase())
      );
      if (match) {
        return {
          modelId: match.modelId,
          providerId: match.providerId,
          reason: `Best model for ${taskCategory} tasks with ${complexity} complexity`,
          confidence: 0.85,
          taskType: taskCategory,
        };
      }
    }

    return null;
  }

  /**
   * Get current compaction strategy for a project
   */
  getCompactionStrategy(projectId: ProjectId): CompactionStrategy {
    const pref = this.preferences.get(projectId as string);
    const strategyName = pref?.compactModeEnabled ? 'aggressive' : 'default';
    return this.compactionStrategies.get(strategyName) ?? this.compactionStrategies.get('default')!;
  }

  /**
   * Get learned project patterns
   */
  getProjectPatterns(projectId: ProjectId): readonly LearnedPattern[] {
    return this.patternSurface.getPatterns().map((p) => ({
      id: p.id,
      type: p.type,
      trigger: p.trigger,
      frequency: p.frequency,
      lastSeen: p.lastSeen,
      confidence: p.confidence,
      suggestion: p.suggestion,
    }));
  }

  /**
   * Record a pattern event for learning
   */
  recordPattern(event: PatternEvent): void {
    this.patternSurface.recordEvent(event);
  }

  /**
   * Update user preferences
   */
  updatePreferences(projectId: ProjectId, updates: Partial<UserPreferences>): void {
    const existing = this.preferences.get(projectId as string) ?? {};
    this.preferences.set(projectId as string, { ...existing, ...updates });
  }

  /**
   * Get user preferences for a project
   */
  getPreferences(projectId: ProjectId): UserPreferences {
    return this.preferences.get(projectId as string) ?? {};
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private matchTrigger(input: string): AdaptationTrigger | undefined {
    return this.triggers.find((t) => t.pattern.test(input));
  }

  private async executeAdaptation(
    context: AdaptationContext,
    trigger: AdaptationTrigger
  ): Promise<AdaptationResult> {
    switch (trigger.action) {
      case 'adjust_compaction':
        return this.adjustCompaction(context, trigger);
      case 'change_model':
        return this.changeModel(context, trigger);
      case 'adapt_ui':
        return this.adaptUI(context, trigger);
      case 'add_context':
        return this.addContext(context);
      case 'learn_project':
        return this.learnProject(context);
      case 'retry_task':
        return this.retryTask(context);
      case 'update_config':
        return this.updateConfig(context);
      default:
        return {
          applied: false,
          action: trigger.action,
          message: 'Unknown adaptation action',
          confidence: 0,
        };
    }
  }

  private adjustCompaction(context: AdaptationContext, trigger: AdaptationTrigger): AdaptationResult {
    const thresholdMatch = context.currentInput.match(/\/compact\s+(\d+)%/i);
    const isDisabling = /(?:disable|turn off|stop)/i.test(context.currentInput);

    let threshold = 0.8;
    let aggressive = true;
    let message = 'Auto-compact mode enabled with aggressive compaction.';

    if (thresholdMatch) {
      threshold = Math.min(0.95, Math.max(0.3, parseInt(thresholdMatch[1], 10) / 100));
      aggressive = threshold > 0.7;
      message = `Compaction threshold set to ${Math.round(threshold * 100)}%.`;
    } else if (isDisabling) {
      threshold = 0.5;
      aggressive = false;
      message = 'Auto-compact mode disabled.';
    }

    const strategy: CompactionStrategy = {
      threshold,
      aggressive,
      preserveRecentMessages: aggressive ? 5 : 10,
      compressPatterns: true,
    };

    this.compactionStrategies.set(context.projectId as string, strategy);
    this.updatePreferences(context.projectId, {
      autoCompactThreshold: threshold,
      compactModeEnabled: aggressive,
    });

    return {
      applied: true,
      action: 'adjust_compaction',
      message,
      changes: { compactionStrategy: strategy },
      confidence: trigger.confidence,
    };
  }

  private changeModel(context: AdaptationContext, trigger: AdaptationTrigger): AdaptationResult {
    const input = context.currentInput.toLowerCase();

    let modelId = 'claude-sonnet';

    if (input.includes('opus')) {
      modelId = 'claude-opus';
    } else if (input.includes('sonnet')) {
      modelId = 'claude-sonnet';
    } else if (input.includes('haiku')) {
      modelId = 'claude-haiku';
    } else if (input.includes('gpt')) {
      modelId = 'gpt-4o';
    } else if (input.includes('gemini')) {
      modelId = 'gemini-pro';
    } else if (input.includes('codex')) {
      modelId = 'codex';
    }

    const availableModels = listProviderModels(this.db);
    const selectedModel = availableModels.find(
      (m) => m.modelId.toLowerCase().includes(modelId.toLowerCase())
    );

    if (!selectedModel) {
      return {
        applied: false,
        action: 'change_model',
        message: `Model ${modelId} is not available.`,
        confidence: 0,
      };
    }

    this.modelSelections.set(context.projectId as string, selectedModel.modelId);
    this.updatePreferences(context.projectId, { preferredModel: selectedModel.modelId });

    this.recordPattern({
      type: 'model_preference',
      taskType: this.classifyTask(context.currentInput),
      modelId: selectedModel.modelId,
      projectId: context.projectId as string,
      timestamp: new Date(),
    });

    return {
      applied: true,
      action: 'change_model',
      message: `Switched to ${selectedModel.displayName ?? selectedModel.modelId}.`,
      changes: {
        modelId: selectedModel.modelId,
        providerId: selectedModel.providerId,
      },
      confidence: trigger.confidence,
    };
  }

  private adaptUI(context: AdaptationContext, trigger: AdaptationTrigger): AdaptationResult {
    const input = context.currentInput.toLowerCase();
    const mode = input.includes('light') ? 'light' : 'dark';

    this.updatePreferences(context.projectId, { theme: mode });

    return {
      applied: true,
      action: 'adapt_ui',
      message: `Switched UI to ${mode} mode.`,
      changes: { theme: mode },
      confidence: trigger.confidence,
    };
  }

  private addContext(context: AdaptationContext): AdaptationResult {
    const memory = getThreadOperationalMemory(this.db, context.threadId);

    const projectPatterns = memory.repeatedCommands.slice(0, 5).map((cmd) => cmd.command);

    this.recordPattern({
      type: 'workflow',
      steps: projectPatterns as readonly string[],
      projectId: context.projectId as string,
      threadId: context.threadId as string,
      timestamp: new Date(),
    });

    return {
      applied: true,
      action: 'add_context',
      message: `Learned ${projectPatterns.length} patterns from recent session.`,
      changes: {
        learnedPatterns: projectPatterns,
        totalPatterns: memory.storedPatternCount,
      },
      confidence: 0.75,
    };
  }

  private learnProject(context: AdaptationContext): AdaptationResult {
    const patterns = this.patternSurface.getPatterns();
    const suggestions = this.patternSurface.getSuggestions();

    const relevantPatterns = patterns.filter(
      (p) => p.frequency >= 3 && p.confidence >= 0.6
    );

    return {
      applied: true,
      action: 'learn_project',
      message: `Project analysis complete. Found ${relevantPatterns.length} significant patterns.`,
      changes: {
        patternsDiscovered: relevantPatterns.length,
        suggestionsAvailable: suggestions.length,
        highConfidencePatterns: relevantPatterns.filter((p) => p.confidence >= 0.8).length,
      },
      confidence: 0.9,
    };
  }

  private retryTask(context: AdaptationContext): AdaptationResult {
    const suggestions = this.patternSurface.getSuggestions();

    const retrySuggestion = suggestions.find(
      (s) => s.confidence >= 0.7 && s.suggestion.includes('retry')
    );

    return {
      applied: true,
      action: 'retry_task',
      message: retrySuggestion
        ? `Retry recommended: ${retrySuggestion.suggestion}`
        : 'Retrying task with adjusted parameters.',
      changes: {
        retryCount: (context.sessionContext.retryCount ?? 0) + 1,
        suggestion: retrySuggestion?.suggestion ?? null,
      },
      confidence: 0.8,
    };
  }

  private updateConfig(context: AdaptationContext): AdaptationResult {
    return {
      applied: true,
      action: 'update_config',
      message: 'Configuration updated based on project patterns.',
      changes: {
        configUpdated: true,
        strategy: this.getCompactionStrategy(context.projectId),
      },
      confidence: 0.85,
    };
  }

  private recordAdaptationPattern(
    context: AdaptationContext,
    trigger: AdaptationTrigger,
    result: AdaptationResult
  ): void {
    if (result.action === 'change_model') {
      this.recordPattern({
        type: 'model_preference',
        taskType: this.classifyTask(context.currentInput),
        modelId: (result.changes?.modelId as string) ?? 'unknown',
        projectId: context.projectId as string,
        timestamp: new Date(),
      });
    }

    if (result.action === 'adjust_compaction') {
      this.recordPattern({
        type: 'command',
        command: `compact:${result.changes?.compactionStrategy ? JSON.stringify(result.changes.compactionStrategy) : 'default'}`,
        projectId: context.projectId as string,
        threadId: context.threadId as string,
        timestamp: new Date(),
      });
    }
  }

  private classifyTask(input: string): TaskCategory {
    for (const [category, pattern] of TASK_PATTERNS) {
      if (pattern.test(input)) {
        return category;
      }
    }
    return 'unknown';
  }

  private assessComplexity(context: SessionContext): 'low' | 'medium' | 'high' {
    if ((context.errorCount ?? 0) >= 3) {
      return 'high';
    }
    if (context.contextTokenPercent && context.contextTokenPercent > 70) {
      return 'high';
    }
    if (context.taskComplexity === 'high') {
      return 'high';
    }
    if (context.taskComplexity === 'low') {
      return 'low';
    }
    return 'medium';
  }

  private getPreferredModelsForTask(
    task: TaskCategory,
    complexity: 'low' | 'medium' | 'high'
  ): readonly string[] {
    const baseModels = MODEL_FOR_TASK[task];

    if (complexity === 'high') {
      return baseModels[0] ? [baseModels[0]] : ['claude-opus'];
    }

    return [...baseModels];
  }

  private shouldAutoCompact(context: AdaptationContext): boolean {
    const pref = this.getPreferences(context.projectId);
    if (!pref.autoCompactThreshold) {
      return (context.sessionContext.contextTokenPercent ?? 0) > 70;
    }
    return (context.sessionContext.contextTokenPercent ?? 0) > pref.autoCompactThreshold * 100;
  }

  private shouldSwitchModel(context: SessionContext): boolean {
    if ((context.errorCount ?? 0) >= 2) {
      return true;
    }
    if (context.retryCount && context.retryCount >= 2) {
      return true;
    }
    return false;
  }

  private shouldLearnProject(context: AdaptationContext): boolean {
    const patterns = this.patternSurface.getPatterns();
    const recentCommands = context.projectContext.recentCommands ?? [];

    if (recentCommands.length >= 10) {
      return true;
    }

    return patterns.length === 0;
  }

  private createAutoCompactResult(context: AdaptationContext): AdaptationResult {
    const strategy = this.getCompactionStrategy(context.projectId);

    return {
      applied: true,
      action: 'adjust_compaction',
      message: 'Context approaching limit. Compacting automatically.',
      changes: {
        autoCompaction: true,
        compactionStrategy: strategy,
        contextPercent: context.sessionContext.contextTokenPercent,
      },
      confidence: 0.85,
    };
  }

  private async createModelSwitchResult(
    context: AdaptationContext
  ): Promise<AdaptationResult> {
    const model = this.getRecommendedModel(context);

    if (!model) {
      return {
        applied: false,
        action: 'change_model',
        message: 'No model switch recommended at this time.',
        confidence: 0,
      };
    }

    this.modelSelections.set(context.projectId as string, model.modelId);
    this.updatePreferences(context.projectId, { preferredModel: model.modelId });

    return {
      applied: true,
      action: 'change_model',
      message: `Switching to ${model.modelId} for better ${model.taskType} performance.`,
      changes: {
        modelId: model.modelId,
        providerId: model.providerId,
        reason: model.reason,
      },
      confidence: model.confidence,
    };
  }

  private createLearnProjectResult(context: AdaptationContext): AdaptationResult {
    const projectPatterns = this.getProjectPatterns(context.projectId);

    return {
      applied: true,
      action: 'learn_project',
      message: 'Project pattern learning triggered.',
      changes: {
        patternsLearned: projectPatterns.length,
        recentCommands: context.projectContext.recentCommands?.length ?? 0,
      },
      confidence: 0.8,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSelfAdaptationService(
  db: Database.Database,
  eventBus: DoorwayEventBus,
  projectPath: string
): SelfAdaptationService {
  return new SelfAdaptationService(db, eventBus, projectPath);
}
