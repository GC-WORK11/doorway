/**
 * Auto-Compaction Module
 *
 * Implements context window management with automatic compaction
 * when token usage exceeds configured threshold.
 *
 * Based on pi's auto-compaction queue pattern.
 */

import type { MessageId, MessageProjection } from '@doorway/protocol';

// ============================================================================
// Types
// ============================================================================

export interface CompactionSettings {
  readonly enabled: boolean;
  readonly reserveTokens: number;
  readonly contextWindow: number;
}

export interface TokenEstimate {
  readonly tokens: number;
  readonly usageTokens: number;
  readonly trailingTokens: number;
  readonly lastUsageIndex: number | null;
}

export interface CompactionResult {
  readonly summary: string;
  readonly firstKeptEntryId: string | null;
  readonly tokensBefore: number;
  readonly tokensAfter: number;
  readonly entriesDropped: number;
}

export interface CompactionEntry {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  readonly usage?: {
    readonly input: number;
    readonly output: number;
    readonly totalTokens?: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RESERVE_TOKENS = 8192;
const DEFAULT_CONTEXT_WINDOW = 200000;

/**
 * Estimate tokens from messages by walking backwards to find last valid usage.
 * Falls back to character count * 0.75 for rough estimate.
 */
export function estimateContextTokens(messages: readonly MessageProjection[]): TokenEstimate {
  let usageTokens = 0;
  let trailingTokens = 0;
  let lastUsageIndex: number | null = null;

  // Walk backwards to find last non-error, non-aborted assistant with usage
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      // Check if message has usage info (would be in metadata in real impl)
      // For now, estimate based on content length
      const estimatedTokens = msg.content.length * 0.75;
      if (lastUsageIndex === null) {
        usageTokens = estimatedTokens;
        lastUsageIndex = i;
      } else {
        trailingTokens += estimatedTokens;
      }
    }
  }

  // Calculate total tokens (input estimate based on all messages)
  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += msg.content.length * 0.75;
  }

  return {
    tokens: totalTokens,
    usageTokens,
    trailingTokens,
    lastUsageIndex,
  };
}

/**
 * Determine if compaction should be triggered based on token usage.
 */
export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings: CompactionSettings
): boolean {
  if (!settings.enabled) return false;
  return contextTokens > contextWindow - settings.reserveTokens;
}

/**
 * Generate a summary of dropped messages for context preservation.
 * Uses first message as anchor and summarizes middle messages.
 */
async function generateBranchSummary(
  entries: readonly CompactionEntry[]
): Promise<{ summary: string; droppedIds: string[] }> {
  if (entries.length <= 3) {
    return { summary: '', droppedIds: [] };
  }

  // Keep first (system/setup) and last few messages
  const keepCount = 2;
  const dropped = entries.slice(keepCount, -keepCount);

  if (dropped.length === 0) {
    return { summary: '', droppedIds: [] };
  }

  // Generate summary from dropped messages
  const totalChars = dropped.reduce((sum, e) => sum + e.content.length, 0);
  const summary = `[${dropped.length} messages condensed - ~${Math.round(totalChars * 0.75)} tokens summarized]`;

  return {
    summary,
    droppedIds: dropped.map((e) => e.id),
  };
}

/**
 * Perform compaction on message list, keeping anchor messages and summarizing middle.
 */
export async function compact(
  messages: readonly MessageProjection[],
  settings: CompactionSettings
): Promise<CompactionResult> {
  const estimate = estimateContextTokens(messages);
  const tokensBefore = estimate.tokens;

  if (!shouldCompact(tokensBefore, settings.contextWindow, settings)) {
    return {
      summary: '',
      firstKeptEntryId: null,
      tokensBefore,
      tokensAfter: tokensBefore,
      entriesDropped: 0,
    };
  }

  // Convert to compaction entries
  const entries: CompactionEntry[] = messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
  }));

  // Generate summary of middle messages
  const { summary, droppedIds } = await generateBranchSummary(entries);

  if (!summary) {
    return {
      summary: '',
      firstKeptEntryId: messages[0]?.id ?? null,
      tokensBefore,
      tokensAfter: tokensBefore,
      entriesDropped: 0,
    };
  }

  // Build compacted message list
  const compacted: MessageProjection[] = [];

  // Keep first message (system/setup)
  if (messages[0]) {
    compacted.push(messages[0]);
  }

  // Add summary message
  if (summary) {
    const summaryMsg: MessageProjection = {
      id: `compacted-${Date.now()}` as MessageId,
      role: 'system',
      content: summary,
      createdAt: new Date(),
    };
    compacted.push(summaryMsg);
  }

  // Keep last 2-3 messages (recent context)
  const recentCount = Math.min(3, messages.length - droppedIds.length);
  for (let i = messages.length - recentCount; i < messages.length; i++) {
    if (messages[i]) {
      compacted.push(messages[i]);
    }
  }

  // Estimate tokens after
  let tokensAfter = 0;
  for (const msg of compacted) {
    tokensAfter += msg.content.length * 0.75;
  }

  return {
    summary,
    firstKeptEntryId: compacted[0]?.id ?? null,
    tokensBefore,
    tokensAfter,
    entriesDropped: droppedIds.length,
  };
}

// ============================================================================
// Compaction Manager
// ============================================================================

export interface CompactionQueueEntry {
  readonly threadId: string;
  readonly messages: readonly MessageProjection[];
  readonly enqueuedAt: Date;
}

export class CompactionManager {
  private readonly settings: CompactionSettings;
  private readonly pending: Map<string, CompactionQueueEntry> = new Map();
  private readonly onCompaction: (threadId: string, result: CompactionResult) => void;

  constructor(
    settings: Partial<CompactionSettings> = {},
    onCompaction: (threadId: string, result: CompactionResult) => void = () => {}
  ) {
    this.settings = {
      enabled: settings.enabled ?? false,
      reserveTokens: settings.reserveTokens ?? DEFAULT_RESERVE_TOKENS,
      contextWindow: settings.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    };
    this.onCompaction = onCompaction;
  }

  /**
   * Check if a thread's messages need compaction.
   */
  needsCompaction(threadId: string, messages: readonly MessageProjection[]): boolean {
    if (!this.settings.enabled) return false;

    const estimate = estimateContextTokens(messages);
    return shouldCompact(estimate.tokens, this.settings.contextWindow, this.settings);
  }

  /**
   * Queue a thread for compaction.
   */
  enqueue(threadId: string, messages: readonly MessageProjection[]): void {
    if (this.pending.has(threadId)) return;

    this.pending.set(threadId, {
      threadId,
      messages,
      enqueuedAt: new Date(),
    });
  }

  /**
   * Process pending compactions.
   */
  async processQueue(): Promise<void> {
    for (const [threadId, entry] of this.pending) {
      const result = await compact(entry.messages, this.settings);
      if (result.entriesDropped > 0) {
        this.onCompaction(threadId, result);
      }
      this.pending.delete(threadId);
    }
  }

  /**
   * Get current settings.
   */
  getSettings(): CompactionSettings {
    return { ...this.settings };
  }

  /**
   * Update settings.
   */
  updateSettings(settings: Partial<CompactionSettings>): void {
    Object.assign(this.settings, settings);
  }

  /**
   * Get pending queue size.
   */
  getPendingCount(): number {
    return this.pending.size;
  }
}

// ============================================================================
// Default export with factory
// ============================================================================

export function createCompactionManager(
  settings?: Partial<CompactionSettings>,
  onCompaction?: (threadId: string, result: CompactionResult) => void
): CompactionManager {
  return new CompactionManager(settings, onCompaction);
}
