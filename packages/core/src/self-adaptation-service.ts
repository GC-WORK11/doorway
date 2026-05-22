import { ThreadId, ProjectId } from '@doorway/protocol';
import { DoorwayEventBus } from './event-bus';
import { getThreadOperationalMemory } from './operational-memory';

export interface AdaptationTrigger {
  pattern: RegExp;
  action: 'adjust_compaction' | 'change_model' | 'add_context' | 'adapt_ui' | 'update_config';
  confidence: number;
}

export interface AdaptationContext {
  projectId: ProjectId;
  threadId: ThreadId;
  currentInput: string;
  userPreferences: Record<string, any>;
  projectContext: Record<string, any>;
}

export interface AdaptationResult {
  applied: boolean;
  action: string;
  message: string;
  changes?: Record<string, any>;
}

/**
 * SelfAdaptationService
 * 
 * Implements Pi-agent-style self-adapting logic for Doorway.
 * Allows the IDE to adapt its UI, configuration, and context dynamically based on 
 * project context and user requests (e.g., auto-compact mode).
 */
export class SelfAdaptationService {
  private triggers: AdaptationTrigger[] = [
    { pattern: /(?:enable|turn on|start|setup) auto-?compact(?: mode)?/i, action: 'adjust_compaction', confidence: 0.9 },
    { pattern: /(?:put yourself in) auto-?compact(?: mode)?/i, action: 'adjust_compaction', confidence: 0.9 },
    { pattern: /use\s+(gpt|claude|gemini|codex)/i, action: 'change_model', confidence: 0.8 },
    { pattern: /(?:switch to|use) (dark|light) mode/i, action: 'adapt_ui', confidence: 0.9 },
    { pattern: /remember.*from.*project/i, action: 'add_context', confidence: 0.7 },
  ];

  constructor(
    private readonly eventBus: DoorwayEventBus,
    private readonly memoryLoader: typeof getThreadOperationalMemory
  ) {}

  /**
   * Evaluates user input against adaptation triggers and applies necessary changes.
   */
  async evaluateAdaptation(context: AdaptationContext): Promise<AdaptationResult | null> {
    const trigger = this.matchTrigger(context.currentInput);
    if (!trigger) return null;

    let result: AdaptationResult | null = null;

    switch (trigger.action) {
      case 'adjust_compaction':
        result = await this.adjustCompaction(context);
        break;
      case 'change_model':
        result = await this.changeModel(context, trigger);
        break;
      case 'adapt_ui':
        result = await this.adaptUI(context, trigger);
        break;
      case 'add_context':
        result = await this.addContext(context);
        break;
      case 'update_config':
        result = await this.updateConfig(context);
        break;
    }

    if (result && result.applied) {
      this.eventBus.emit('adaptation_applied', {
        threadId: context.threadId,
        action: result.action,
        changes: result.changes,
      });
      // Store in memory that the user preferred this adaptation
      // Using memoryLoader pattern (placeholder for actual storage)
      console.log('[SelfAdaptation] Storing preference:', trigger.action, result.changes);
    }

    return result;
  }

  private matchTrigger(input: string): AdaptationTrigger | undefined {
    return this.triggers.find(t => t.pattern.test(input));
  }

  private async adjustCompaction(context: AdaptationContext): Promise<AdaptationResult> {
    // Scaffold: Set auto-compact threshold in the project/user configuration
    return {
      applied: true,
      action: 'adjust_compaction',
      message: 'Auto-compact mode enabled. I will aggressively compact context to save space.',
      changes: {
        autoCompactThreshold: 0.8,
        compactModeEnabled: true,
      }
    };
  }

  private async changeModel(context: AdaptationContext, trigger: AdaptationTrigger): Promise<AdaptationResult> {
    const match = context.currentInput.match(trigger.pattern);
    const newModel = match ? match[1].toLowerCase() : 'claude';
    return {
      applied: true,
      action: 'change_model',
      message: `Switched primary model to ${newModel}.`,
      changes: {
        preferredModel: newModel
      }
    };
  }

  private async adaptUI(context: AdaptationContext, trigger: AdaptationTrigger): Promise<AdaptationResult> {
    const match = context.currentInput.match(trigger.pattern);
    const mode = match ? match[1].toLowerCase() : 'dark';
    return {
      applied: true,
      action: 'adapt_ui',
      message: `Switched UI to ${mode} mode.`,
      changes: {
        theme: mode
      }
    };
  }

  private async addContext(context: AdaptationContext): Promise<AdaptationResult> {
    return {
      applied: true,
      action: 'add_context',
      message: 'Added requested project context to operational memory.',
      changes: {
        contextExpanded: true
      }
    };
  }

  private async updateConfig(context: AdaptationContext): Promise<AdaptationResult> {
    return {
      applied: true,
      action: 'update_config',
      message: 'Configuration updated successfully based on your request.',
      changes: {
        configUpdated: true
      }
    };
  }
}
