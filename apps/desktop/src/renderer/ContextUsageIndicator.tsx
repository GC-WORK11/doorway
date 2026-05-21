import React from 'react';
import type {
  OperationalMemoryProjection,
  TerminalSessionId,
  TerminalProjection,
} from '@doorway/protocol';
import { useHarnessState } from './HarnessContext';

/**
 * Context Usage Indicator
 *
 * Shows a visual indicator of context window usage based on:
 * - Terminal transcript chunks
 * - Terminal inputs
 * - Thread messages
 * - Agent events
 *
 * Auto-compaction triggers at 80% (configurable).
 */

interface ContextUsageIndicatorProps {
  /** Custom threshold for compaction warning. Default: 0.8 (80%) */
  threshold?: number;
}

export function ContextUsageIndicator({ threshold = 0.8 }: ContextUsageIndicatorProps) {
  const { terminalSessions, threadEvents } = useHarnessState();

  // Calculate estimated token usage
  const stats = calculateContextStats(terminalSessions, threadEvents);

  // Determine status color
  const statusClass =
    stats.usagePercent >= threshold
      ? 'danger'
      : stats.usagePercent >= threshold * 0.7
        ? 'warning'
        : 'ok';

  return (
    <div className="context-usage-indicator" aria-label="Context usage">
      <div className="context-usage-indicator__bar">
        <div
          className={`context-usage-indicator__fill context-usage-indicator__fill--${statusClass}`}
          style={{ width: `${Math.min(stats.usagePercent * 100, 100)}%` }}
        />
      </div>
      <div className="context-usage-indicator__meta">
        <span
          className={`context-usage-indicator__percent context-usage-indicator__percent--${statusClass}`}
        >
          {Math.round(stats.usagePercent * 100)}%
        </span>
        <span className="context-usage-indicator__detail">
          {stats.approxTokens.toLocaleString()} tokens
        </span>
        {stats.usagePercent >= threshold && (
          <span className="context-usage-indicator__warning">Auto-compact at 80%</span>
        )}
      </div>
      <div className="context-usage-indicator__breakdown">
        <span title="Terminal transcript chunks">{stats.transcriptChunks} chunks</span>
        <span title="Terminal input events">{stats.inputEvents} inputs</span>
        <span title="Thread events">{stats.threadEvents} events</span>
      </div>
    </div>
  );
}

interface ContextStats {
  readonly usagePercent: number;
  readonly approxTokens: number;
  readonly transcriptChunks: number;
  readonly inputEvents: number;
  readonly threadEvents: number;
}

function calculateContextStats(
  terminalSessions: readonly TerminalProjection[],
  threadEvents: readonly { id: string }[]
): ContextStats {
  // Estimate tokens based on:
  // - Each transcript chunk: ~100 tokens avg
  // - Each input: ~50 tokens avg
  // - Each event: ~20 tokens avg
  // - Context window: 200K tokens (Claude default)

  const TRANSCRIPT_TOKENS_PER_CHUNK = 100;
  const INPUT_TOKENS_PER_EVENT = 50;
  const EVENT_TOKENS = 20;
  const CONTEXT_WINDOW = 200000;

  // Count transcript chunks across all sessions
  let totalTranscriptChars = 0;
  for (const session of terminalSessions) {
    // Each session's transcript contributes to context
    if (session.lastOutput) {
      totalTranscriptChars += session.lastOutput.length;
    }
  }

  // Estimate tokens from characters (rough: 4 chars = 1 token)
  const transcriptTokens = Math.ceil(totalTranscriptChars / 4);
  const inputTokens =
    threadEvents.filter((e) => e.id.startsWith('term_inp')).length * INPUT_TOKENS_PER_EVENT;
  const eventTokens = threadEvents.length * EVENT_TOKENS;

  const approxTokens = transcriptTokens + inputTokens + eventTokens;
  const usagePercent = approxTokens / CONTEXT_WINDOW;

  return {
    usagePercent,
    approxTokens,
    transcriptChunks: terminalSessions.length,
    inputEvents: threadEvents.filter((e) => e.id.startsWith('term_inp')).length,
    threadEvents: threadEvents.length,
  };
}

/**
 * CompactableMessagesInfo
 *
 * Shows how many messages could be compacted if auto-compaction triggers.
 * TODO: Wire this to the EvidencePanel when operational memory is fully integrated.
 */
function CompactableMessagesInfo() {
  const { operationalMemory, terminalSessions } = useHarnessState();

  if (!operationalMemory) {
    return null;
  }

  const { observedCommands, storedPatternCount } = operationalMemory;

  return (
    <div className="compactable-messages-info" aria-label="Operational memory summary">
      <span className="compactable-messages-info__count">
        {observedCommands.length} commands observed
      </span>
      {storedPatternCount > 0 && (
        <span className="compactable-messages-info__patterns">
          · {storedPatternCount} learned patterns
        </span>
      )}
      {observedCommands
        .filter((c) => c.isStoredPattern)
        .map((cmd) => (
          <span
            key={cmd.command}
            className="compactable-messages-info__pattern"
            title={`Command: ${cmd.command} (${cmd.runCount} runs)`}
          >
            <code>{cmd.command}</code>
          </span>
        ))}
    </div>
  );
}
