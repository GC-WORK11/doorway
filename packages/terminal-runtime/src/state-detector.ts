import type {
  TerminalControlEvent,
  TerminalStateDetection,
  TerminalSemanticState,
} from '@doorway/protocol';

export type TerminalProvider = TerminalStateDetection['provider'];

export class TerminalStateDetector {
  private readonly providerHint?: TerminalProvider;
  private state: TerminalSemanticState = 'unknown';
  private lastDetection: TerminalStateDetection | null = null;
  private buffer = '';
  private sawOutput = false;

  constructor(providerHint?: TerminalProvider) {
    this.providerHint = providerHint;
  }

  update(input: {
    readonly text: string;
    readonly rawText: string;
    readonly controlEvents: readonly TerminalControlEvent[];
    readonly isStderr?: boolean;
  }): TerminalStateDetection {
    this.buffer = trimBuffer(`${this.buffer}${input.text}`);
    const provider = this.detectProvider(input.rawText, input.text);
    const signals: string[] = [];
    const lastLine = lastVisibleLine(this.buffer);
    const normalized = this.buffer.toLowerCase();
    const currentText = input.text.toLowerCase();

    if (input.isStderr || hasFailurePattern(normalized)) {
      signals.push(input.isStderr ? 'stderr_output' : 'failure_pattern');
      return this.transition('failed', provider, 0.85, 'Terminal output matched a failure signal.', signals);
    }

    if (hasInputPrompt(provider, lastLine, normalized)) {
      signals.push('prompt_pattern');
      if (input.controlEvents.some((event) => event.type === 'csi' && event.sequence.includes('?25h'))) {
        signals.push('cursor_visible');
      }
      const hasQuestion = hasQuestionPattern(normalized);
      if (hasQuestion) {
        signals.push('question_pattern');
      }
      const state = this.sawOutput && !hasQuestion ? 'complete' : 'awaiting_input';
      const reason =
        state === 'complete'
          ? 'Terminal returned to an input prompt after output.'
          : hasQuestion
            ? 'Terminal is showing a question prompt.'
            : 'Terminal is showing an input prompt.';
      return this.transition(state, provider, confidence(signals.length, 0.55), reason, signals);
    }

    if (hasThinkingPattern(provider, currentText, input.controlEvents)) {
      signals.push('thinking_indicator');
      if (input.controlEvents.some((event) => event.type === 'erase_line' || event.type === 'carriage_return')) {
        signals.push('progress_overwrite');
      }
      return this.transition('thinking', provider, confidence(signals.length, 0.5), 'Terminal is showing processing indicators.', signals);
    }

    if (input.text.trim().length > 0) {
      this.sawOutput = true;
      signals.push('printable_output');
      return this.transition('outputting', provider, 0.55, 'Terminal emitted printable output.', signals);
    }

    return {
      state: this.state,
      provider,
      confidence: 0.2,
      reason: 'No state-changing terminal signal detected.',
      signals: [],
    };
  }

  confirmSilence(silenceMs: number): TerminalStateDetection | undefined {
    if (!this.lastDetection) return undefined;
    if (this.lastDetection.confirmed) return undefined;
    if (!canConfirmWithSilence(this.lastDetection.state)) return undefined;

    const confirmationSignal = silenceMs >= 1000 ? 'silence_1000ms' : 'silence_500ms';
    const detection: TerminalStateDetection = {
      ...this.lastDetection,
      confidence: Math.min(0.98, this.lastDetection.confidence + 0.12),
      confirmed: true,
      confirmationSignals: [
        ...(this.lastDetection.confirmationSignals ?? []),
        confirmationSignal,
      ],
    };
    this.lastDetection = detection;
    return detection;
  }

  markStuck(input: { readonly silenceMs: number; readonly reason: string }): TerminalStateDetection {
    const provider = this.lastDetection?.provider ?? this.providerHint ?? 'generic';
    return this.transition('stuck', provider, 0.88, input.reason, [
      'stale_state',
      `silence_${input.silenceMs}ms`,
      'newline_recovery_attempted',
    ]);
  }

  markRecoveryEscalated(input: { readonly silenceMs: number; readonly reason: string }): TerminalStateDetection {
    const provider = this.lastDetection?.provider ?? this.providerHint ?? 'generic';
    return this.transition('stuck', provider, 0.94, input.reason, [
      'stale_after_newline_recovery',
      `silence_${input.silenceMs}ms`,
      'hard_recovery_requested',
    ]);
  }

  markWriteFailed(input: {
    readonly reason: string;
    readonly signals?: readonly string[];
  }): TerminalStateDetection {
    const provider = this.lastDetection?.provider ?? this.providerHint ?? 'generic';
    return this.transition('failed', provider, 0.92, input.reason, [
      'terminal_write_failed',
      ...(input.signals ?? []),
    ]);
  }

  private detectProvider(rawText: string, text: string): TerminalProvider {
    if (this.providerHint) return this.providerHint;
    const combined = `${rawText}\n${text}\n${this.buffer}`.toLowerCase();
    if (combined.includes('claude')) return 'claude';
    if (combined.includes('codex') || combined.includes('openai')) return 'codex';
    return 'generic';
  }

  private transition(
    state: TerminalSemanticState,
    provider: TerminalProvider,
    confidenceValue: number,
    reason: string,
    signals: readonly string[]
  ): TerminalStateDetection {
    this.state = state;
    const detection = {
      state,
      provider,
      confidence: confidenceValue,
      reason,
      signals,
    };
    this.lastDetection = detection;
    return detection;
  }
}

function canConfirmWithSilence(state: TerminalSemanticState): boolean {
  return state === 'awaiting_input' || state === 'complete';
}

function hasInputPrompt(provider: TerminalProvider, lastLine: string, normalizedBuffer: string): boolean {
  const trimmed = lastLine.trim();
  if (!trimmed) return false;
  if (provider === 'claude' && trimmed === '>') return true;
  if (provider === 'codex' && (trimmed === '❯' || trimmed === '>')) return true;
  return (
    /^[>$#]\s*$/.test(trimmed) ||
    /(\[y\/n\]|yes\/no|press\s+enter|continue\?|proceed\?|password:|passphrase:)\s*$/i.test(
      normalizedBuffer
    )
  );
}

function hasThinkingPattern(
  provider: TerminalProvider,
  currentText: string,
  controlEvents: readonly TerminalControlEvent[]
): boolean {
  if (/thinking|analyzing|working|processing|reading|searching|planning/.test(currentText)) {
    return true;
  }
  if (provider === 'claude' && /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(currentText)) {
    return true;
  }
  return controlEvents.some(
    (event) => event.type === 'csi' && event.sequence.includes('?25l')
  );
}

function hasQuestionPattern(normalizedBuffer: string): boolean {
  return /\?|(\[y\/n\]|yes\/no|select\s+an?\s+option|choose\s+an?\s+option|enter\s+(a\s+)?choice)/i.test(
    normalizedBuffer
  );
}

function hasFailurePattern(normalizedBuffer: string): boolean {
  return /\b(fatal|panic|exception|permission denied|command not found|segmentation fault)\b/.test(
    normalizedBuffer
  );
}

function confidence(signalCount: number, base: number): number {
  return Math.min(0.95, base + signalCount * 0.12);
}

function trimBuffer(buffer: string): string {
  return buffer.length > 8000 ? buffer.slice(-8000) : buffer;
}

function lastVisibleLine(text: string): string {
  const lines = text.replace(/\r/g, '\n').split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim().length > 0) return lines[index];
  }
  return '';
}
