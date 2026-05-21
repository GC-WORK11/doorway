/**
 * Auto-Compactor
 *
 * Automatically triggers context compaction when usage exceeds 80% of the
 * model's context window. Runs silently before each agent call.
 *
 * Architecture:
 * - Wraps CompactionManager with auto-detection
 * - Tracks context usage per thread
 * - Emits telemetry for UI feedback
 * - Non-blocking: skips if already compacting
 */

import type Database from 'better-sqlite3';
import type { ThreadId, MessageProjection } from '@doorway/protocol';
import {
  CompactionManager,
  compact,
  estimateContextTokens,
  shouldCompact,
  createCompactionManager,
  type CompactionSettings,
  type CompactionResult,
} from './compaction.js';
import { recordEvent } from '@doorway/core';

// ============================================================================
// Constants
// ============================================================================

/** Default: trigger compaction when context reaches 80% full */
const DEFAULT_AUTO_COMPACT_THRESHOLD = 0.8;

/** Reserve 8K tokens so we don't run dry mid-generation */
const DEFAULT_RESERVE_TOKENS = 8192;

/** Context window for various models (can be overridden per provider) */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  'claude-opus-4-5': 200000,
  'claude-sonnet-4-5': 200000,
  'claude-haiku-3-5': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,

  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,

  // Gemini
  'gemini-2.5-pro': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-1.5-pro': 128000,
  'gemini-1.5-flash': 128000,

  // Default for unknown models
  default: 200000,
};

// ============================================================================
// Auto-Compactor
// ============================================================================

export interface AutoCompactorConfig {
  /** Threshold (0.0-1.0) to trigger auto-compaction. Default: 0.8 (80%) */
  readonly threshold?: number;

  /** Tokens to reserve at top of context. Default: 8192 */
  readonly reserveTokens?: number;

  /** Override context window for specific models */
  readonly modelContextWindows?: Record<string, number>;

  /** Called when auto-compaction starts */
  readonly onAutoCompactStart?: (threadId: string, contextPercent: number) => void;

  /** Called when auto-compaction completes */
  readonly onAutoCompactComplete?: (threadId: string, result: CompactionResult) => void;

  /** Called when auto-compaction is skipped (already compacting) */
  readonly onAutoCompactSkipped?: (threadId: string, reason: string) => void;
}

export class AutoCompactor {
  private readonly db: Database.Database;
  private readonly config: AutoCompactorConfig;
  private readonly manager: CompactionManager;
  private readonly compacting: Set<string> = new Set(); // threadId -> currently compacting

  constructor(db: Database.Database, config: AutoCompactorConfig = {}) {
    this.db = db;
    this.config = config;

    this.manager = createCompactionManager(
      {
        enabled: true,
        reserveTokens: config.reserveTokens ?? DEFAULT_RESERVE_TOKENS,
        contextWindow: DEFAULT_RESERVE_TOKENS * 25, // 200K default
      },
      (threadId, result) => {
        this.onCompactionComplete(threadId, result);
      }
    );
  }

  /**
   * Get the context window for a specific model.
   */
  getContextWindow(modelId?: string): number {
    if (!modelId) {
      return MODEL_CONTEXT_WINDOWS.default;
    }

    // Check explicit overrides first
    if (this.config.modelContextWindows?.[modelId]) {
      return this.config.modelContextWindows[modelId];
    }

    // Check built-in table
    if (MODEL_CONTEXT_WINDOWS[modelId]) {
      return MODEL_CONTEXT_WINDOWS[modelId];
    }

    // Try partial match (e.g., "claude-3.5-sonnet-20240620" -> "claude-3.5-sonnet")
    const normalized = modelId.toLowerCase().replace(/-(\d{8})$/, '');
    for (const [key, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      if (normalized.includes(key) || key.includes(normalized.split('-')[0])) {
        return window;
      }
    }

    return MODEL_CONTEXT_WINDOWS.default;
  }

  /**
   * Get current context usage as a percentage (0.0-1.0+).
   */
  getContextUsagePercent(messages: readonly MessageProjection[], modelId?: string): number {
    const estimate = estimateContextTokens(messages);
    const contextWindow = this.getContextWindow(modelId);
    return estimate.tokens / contextWindow;
  }

  /**
   * Check if auto-compaction should trigger.
   */
  shouldAutoCompact(messages: readonly MessageProjection[], modelId?: string): boolean {
    const threshold = this.config.threshold ?? DEFAULT_AUTO_COMPACT_THRESHOLD;
    const usage = this.getContextUsagePercent(messages, modelId);
    return usage >= threshold;
  }

  /**
   * Get compactable message range (what would be dropped in compaction).
   */
  getCompactableMessages(messages: readonly MessageProjection[]): {
    keepCount: number;
    dropCount: number;
    tokensSaved: number;
  } {
    const estimate = estimateContextTokens(messages);
    const contextWindow = this.getContextWindow();

    if (
      estimate.tokens <
      contextWindow * (this.config.threshold ?? DEFAULT_AUTO_COMPACT_THRESHOLD)
    ) {
      return { keepCount: messages.length, dropCount: 0, tokensSaved: 0 };
    }

    // Keep first (system) + last 3 messages, drop everything in between
    const keepCount = Math.min(4, messages.length);
    const dropCount = Math.max(0, messages.length - keepCount);
    const tokensSaved = estimate.trailingTokens;

    return { keepCount, dropCount, tokensSaved };
  }

  /**
   * Trigger auto-compaction for a thread if needed.
   * Returns true if compaction was triggered, false otherwise.
   */
  async autoCompactIfNeeded(
    threadId: ThreadId,
    messages: readonly MessageProjection[],
    modelId?: string
  ): Promise<boolean> {
    // Skip if already compacting this thread
    if (this.compacting.has(threadId as string)) {
      this.config.onAutoCompactSkipped?.(threadId as string, 'already_compacting');
      return false;
    }

    // Check if compaction is needed
    const threshold = this.config.threshold ?? DEFAULT_AUTO_COMPACT_THRESHOLD;
    const usage = this.getContextUsagePercent(messages, modelId);

    if (usage < threshold) {
      return false;
    }

    // Mark as compacting
    this.compacting.add(threadId as string);

    // Emit start event
    this.config.onAutoCompactStart?.(threadId as string, usage);

    try {
      const contextWindow = this.getContextWindow(modelId);
      const result = await compact(messages, {
        enabled: true,
        reserveTokens: this.config.reserveTokens ?? DEFAULT_RESERVE_TOKENS,
        contextWindow,
      });

      if (result.entriesDropped > 0) {
        // Record the compaction event for replay/audit
        this.recordCompactionEvent(threadId as string, result);

        // Call completion handler
        this.config.onAutoCompactComplete?.(threadId as string, result);

        return true;
      }

      return false;
    } finally {
      // Always clear compacting flag
      this.compacting.delete(threadId as string);
    }
  }

  /**
   * Record compaction event for replay and audit trail.
   */
  private recordCompactionEvent(threadId: string, result: CompactionResult): void {
    recordEvent(this.db, threadId as ThreadId, 'thread.compacted', {
      checkpointId: `compaction-${Date.now()}`,
      threadId: threadId as ThreadId,
      terminalSessionIds: [],
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Handle compaction completion from manager.
   */
  private onCompactionComplete(threadId: string, result: CompactionResult): void {
    this.compacting.delete(threadId);
    this.config.onAutoCompactComplete?.(threadId, result);
  }

  /**
   * Get whether a thread is currently being compacted.
   */
  isCompacting(threadId: string): boolean {
    return this.compacting.has(threadId);
  }

  /**
   * Get manager settings.
   */
  getManager(): CompactionManager {
    return this.manager;
  }

  /**
   * Create a default auto-compactor with sensible defaults.
   */
  static createDefault(db: Database.Database): AutoCompactor {
    return new AutoCompactor(db, {
      threshold: 0.8,
      reserveTokens: 8192,
    });
  }
}

// ============================================================================
// Integration helpers
// ============================================================================

/**
 * Create an auto-compactor integration for the orchestrator.
 * Returns a function that should be called before each agent call.
 */
export function createAutoCompactorIntegration(autoCompactor: AutoCompactor): {
  checkAndCompact: (
    threadId: ThreadId,
    messages: readonly MessageProjection[],
    modelId?: string
  ) => Promise<boolean>;
  getUsagePercent: (messages: readonly MessageProjection[], modelId?: string) => number;
  isCompacting: (threadId: string) => boolean;
} {
  return {
    /**
     * Call this before each agent invocation.
     * Returns true if compaction happened (messages were modified).
     */
    async checkAndCompact(
      threadId: ThreadId,
      messages: readonly MessageProjection[],
      modelId?: string
    ): Promise<boolean> {
      return autoCompactor.autoCompactIfNeeded(threadId, messages, modelId);
    },

    /**
     * Get current context usage for UI display.
     */
    getUsagePercent(messages: readonly MessageProjection[], modelId?: string): number {
      return autoCompactor.getContextUsagePercent(messages, modelId);
    },

    /**
     * Check if thread is currently compacting.
     */
    isCompacting(threadId: string): boolean {
      return autoCompactor.isCompacting(threadId);
    },
  };
}
