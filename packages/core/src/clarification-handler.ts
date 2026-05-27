/**
 * Clarification Handler
 *
 * Detects when an agent asks a question in the terminal and
 * prompts the user in the chat UI for a response.
 *
 * This is what makes Doorway feel like a human operator:
 * - Claude asks a question in terminal
 * - Doorway detects it and prompts user in chat
 * - User responds
 * - Doorway re-prompts Claude with the answer
 */

import type { TerminalSessionId, AgentRunId, ThreadId } from '@doorway/protocol';

// ============================================================================
// Types
// ============================================================================

export interface ClarificationRequest {
  readonly id: string;
  readonly sessionId: TerminalSessionId;
  readonly runId: AgentRunId;
  readonly threadId: ThreadId;
  readonly question: string;
  readonly context: string;
  readonly suggestedResponses?: string[];
  readonly timestamp: Date;
  status: 'pending' | 'answered' | 'timeout';
  answer?: string;
}

export interface ClarificationHandlerConfig {
  onClarificationDetected?: (request: ClarificationRequest) => void;
  onClarificationAnswered?: (request: ClarificationRequest) => void;
  readonly timeoutMs?: number;
  readonly debounceMs?: number;
}

export interface ClarificationResponse {
  readonly requestId: string;
  readonly response: string;
}

interface ClarificationSessionState {
  buffer: string;
}

interface PendingDetection {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (request: ClarificationRequest | null) => void;
}

// ============================================================================
// Detection Patterns
// ============================================================================

const QUESTION_PATTERNS = [
  // Direct questions
  { pattern: /^[>]?\s*(.+)\?$/mu, type: 'single_line_question' },
  { pattern: /\?\s*$/mu, type: 'trailing_question_at_eol' },

  // Interactive prompts
  { pattern: /^(y\/n|yes\/no)\s*[>]/im, type: 'yes_no_prompt' },
  { pattern: /\[y\/n\]/i, type: 'yes_no_option' },
  { pattern: /press.*enter.*to.*continue/i, type: 'continue_prompt' },

  // CLI confirmation patterns
  { pattern: /overwrite\s+\?/i, type: 'overwrite_prompt' },
  { pattern: /continue\s*\?\s*\[y\/n\]/i, type: 'continue_confirm' },
  { pattern: /proceed\s*\?\s*\[y\/n\]/i, type: 'proceed_confirm' },

  // Auth/API prompts
  { pattern: /enter\s+(your\s+)?(api\s+key|token|password)/i, type: 'auth_prompt' },
  { pattern: /authenticate\s*\?/i, type: 'auth_prompt' },
  { pattern: /login\s*\?/i, type: 'login_prompt' },

  // Selection prompts
  { pattern: /select\s+(an?\s+)?option/i, type: 'selection_prompt' },
  { pattern: /choose\s+(an?\s+)?(option|item)/i, type: 'selection_prompt' },
  { pattern: /\d+\)\s+.+/m, type: 'numbered_selection' },

  // Claude specific patterns
  { pattern: /could you (clarify|explain|tell me|confirm)/i, type: 'clarification_request' },
  { pattern: /please provide|provide me/i, type: 'information_request' },
  { pattern: /is this correct\?/i, type: 'confirmation_request' },
  { pattern: /should i proceed\?/i, type: 'proceed_request' },
  { pattern: /waiting for (your|input)/i, type: 'waiting_prompt' },

  // Codex specific patterns
  { pattern: /need\s+more\s+information/i, type: 'information_request' },
  { pattern: /requires?\s+input/i, type: 'input_request' },
  { pattern: /please\s+confirm/i, type: 'confirmation_request' },

  // General interactive
  { pattern: /enter\s+(a\s+)?path/i, type: 'path_prompt' },
  { pattern: /enter\s+name/i, type: 'name_prompt' },
  { pattern: /specify\s+(a\s+)?(value|option)/i, type: 'value_prompt' },
];

// Patterns that indicate the agent is WAITING, not just finished
const WAITING_PATTERNS = [
  // eslint-disable-next-line no-control-regex
  { pattern: /\x1b\[\?25h/, type: 'cursor_visible' }, // ANSI cursor visible
  { pattern: /[>$#]\s*$/u, type: 'shell_prompt' }, // Shell prompt
  { pattern: /\|\s*$/u, type: 'pipe_pending' },
];

// ============================================================================
// Clarification Handler
// ============================================================================

export class ClarificationHandler {
  private readonly requests = new Map<string, ClarificationRequest>();
  config: ClarificationHandlerConfig;
  private readonly debounceMs: number;
  private readonly sessionStates = new Map<string, ClarificationSessionState>();
  private readonly pendingDetections = new Map<string, PendingDetection>();

  constructor(config: ClarificationHandlerConfig = {}) {
    this.config = {
      timeoutMs: 300000, // 5 minutes default
      debounceMs: 500, // Wait 500ms after last output
      ...config,
    };
    this.debounceMs = this.config.debounceMs ?? 500;
  }

  /**
   * Process terminal output and detect clarifications
   */
  processOutput(
    sessionId: TerminalSessionId,
    runId: AgentRunId,
    threadId: ThreadId,
    output: string
  ): ClarificationRequest | null {
    const state = this.getSessionState(sessionId);
    const previousBuffer = state.buffer;
    const combinedOutput = output.startsWith(previousBuffer)
      ? output
      : `${previousBuffer}${output}`;
    const freshOutput = output.startsWith(previousBuffer)
      ? output.slice(previousBuffer.length)
      : output;
    state.buffer = trimClarificationBuffer(combinedOutput);

    if (!freshOutput.trim()) {
      return null;
    }

    // Check if we're in a waiting state
    const isWaiting = this.isWaitingState(state.buffer);

    if (!isWaiting) {
      return null;
    }

    // Detect the question
    const question = this.extractQuestion(state.buffer);

    if (!question) {
      return null;
    }

    if (this.hasPendingQuestion(sessionId, question)) {
      return null;
    }

    // Create clarification request
    const request: ClarificationRequest = {
      id: `clarification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      runId,
      threadId,
      question,
      context: this.extractContext(state.buffer),
      suggestedResponses: this.generateSuggestions(question),
      timestamp: new Date(),
      status: 'pending',
    };

    this.requests.set(request.id, request);

    // Notify listener
    this.config.onClarificationDetected?.(request);

    // Set timeout
    this.setTimeout(request.id);

    return request;
  }

  /**
   * Process output with debouncing (async)
   */
  async processOutputAsync(
    sessionId: TerminalSessionId,
    runId: AgentRunId,
    threadId: ThreadId,
    output: string
  ): Promise<ClarificationRequest | null> {
    return new Promise((resolve) => {
      const key = sessionId as string;
      const pending = this.pendingDetections.get(key);
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(null);
      }

      const timer = setTimeout(() => {
        this.pendingDetections.delete(key);
        const result = this.processOutput(sessionId, runId, threadId, output);
        resolve(result);
      }, this.debounceMs);
      this.pendingDetections.set(key, { timer, resolve });
    });
  }

  /**
   * Answer a clarification request
   */
  answerRequest(requestId: string, response: string): ClarificationResponse | null {
    const request = this.requests.get(requestId);

    if (!request) {
      return null;
    }

    request.answer = response;
    request.status = 'answered';

    this.config.onClarificationAnswered?.(request);

    return { requestId, response };
  }

  /**
   * Get pending clarification for a session
   */
  getPendingClarification(sessionId: TerminalSessionId): ClarificationRequest | null {
    for (const request of this.requests.values()) {
      if (request.sessionId === sessionId && request.status === 'pending') {
        return request;
      }
    }
    return null;
  }

  /**
   * Get all pending clarifications
   */
  getPendingClarifications(): ClarificationRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === 'pending');
  }

  /**
   * Get clarification by ID
   */
  getClarification(id: string): ClarificationRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Cancel a clarification request
   */
  cancelRequest(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (request) {
      request.status = 'timeout';
      return true;
    }
    return false;
  }

  /**
   * Clear all requests for a session
   */
  clearSession(sessionId: TerminalSessionId): void {
    for (const [id, request] of this.requests) {
      if (request.sessionId === sessionId) {
        this.requests.delete(id);
      }
    }
    const key = sessionId as string;
    this.sessionStates.delete(key);
    const pending = this.pendingDetections.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(null);
      this.pendingDetections.delete(key);
    }
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private getSessionState(sessionId: TerminalSessionId): ClarificationSessionState {
    const key = sessionId as string;
    const existing = this.sessionStates.get(key);
    if (existing) {
      return existing;
    }
    const state: ClarificationSessionState = { buffer: '' };
    this.sessionStates.set(key, state);
    return state;
  }

  private hasPendingQuestion(sessionId: TerminalSessionId, question: string): boolean {
    for (const request of this.requests.values()) {
      if (
        request.sessionId === sessionId &&
        request.status === 'pending' &&
        request.question === question
      ) {
        return true;
      }
    }
    return false;
  }

  private isWaitingState(output: string): boolean {
    for (const { pattern } of WAITING_PATTERNS) {
      if (pattern.test(output)) {
        return true;
      }
    }
    return false;
  }

  private extractQuestion(output: string): string | null {
    const questionLine = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .reverse()
      .find((line) => line.includes('?') && line.length > 1);
    if (questionLine) {
      const cleaned = cleanQuestionText(questionLine);
      if (isActionableQuestionText(cleaned)) {
        return cleaned;
      }
    }

    // Try each pattern
    for (const { pattern } of QUESTION_PATTERNS) {
      const match = output.match(pattern);
      if (match) {
        const question = match[1] || match[0];
        // Clean up the question
        const cleaned = cleanQuestionText(question);
        if (isActionableQuestionText(cleaned)) {
          return cleaned;
        }
      }
    }
    return null;
  }

  private extractContext(output: string): string {
    const lines = output.split('\n');
    // Get the last 10 lines for context
    const recentLines = lines.slice(-10);
    return recentLines.join('\n');
  }

  private generateSuggestions(question: string): string[] {
    const suggestions: string[] = [];
    const lowerQuestion = question.toLowerCase();

    // Yes/No questions
    if (
      lowerQuestion.includes('y/n') ||
      lowerQuestion.includes('yes/no') ||
      lowerQuestion.includes('continue')
    ) {
      suggestions.push('y', 'yes', 'n', 'no');
    }

    // Overwrite prompts
    if (lowerQuestion.includes('overwrite')) {
      suggestions.push('y', 'n', 'y to all', 'n to all');
    }

    // Auth/API prompts
    if (
      lowerQuestion.includes('api') ||
      lowerQuestion.includes('key') ||
      lowerQuestion.includes('token')
    ) {
      suggestions.push('[Enter API Key]', '[Skip]', '[Cancel]');
    }

    // Path prompts
    if (lowerQuestion.includes('path')) {
      suggestions.push('[Enter Path]', '[Current Directory]', '[Cancel]');
    }

    // Confirmation questions
    if (lowerQuestion.includes('correct') || lowerQuestion.includes('confirm')) {
      suggestions.push('yes', 'no', 'yes, continue');
    }

    // General fallback
    if (suggestions.length === 0) {
      suggestions.push('[Enter Response]', '[Skip]', '[Cancel]');
    }

    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }

  private setTimeout(requestId: string): void {
    const timeoutMs = this.config.timeoutMs ?? 300000;

    setTimeout(() => {
      const request = this.requests.get(requestId);
      if (request && request.status === 'pending') {
        request.status = 'timeout';
      }
    }, timeoutMs);
  }
}

function cleanQuestionText(question: string): string {
  let cleaned = question.replace(/^[>\s?]+/u, '').trim();
  // Strip leading user@host:~/dir$ prompts
  cleaned = cleaned.replace(/^[\w.-]+@[\w.-]+:[~\w./-]*[$#]\s*/, '');
  // Strip leading [user@host dir]$ prompts
  cleaned = cleaned.replace(/^\[[\w.-]+@[\w.-]+\s+[~\w./-]*\]\s*[$#]\s*/, '');
  return cleaned.trim();
}

function isActionableQuestionText(question: string): boolean {
  if (question.length === 0 || question.length >= 500) {
    return false;
  }
  // Exclude URLs
  if (/\bhttps?:\/\/\S+/i.test(question)) {
    return false;
  }
  // Exclude query parameters and paths (like /foo?bar=1)
  if (/\/\S*\?/u.test(question)) {
    return false;
  }
  // Exclude ternary operators or common code constructs containing ?
  if (/\?.*\b(true|false|null|undefined|const|let|var|function|return)\b/i.test(question)) {
    return false;
  }
  const withoutChoiceMarkers = question
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(?:y\/n|yes\/no)\b/gi, '')
    .trim();
  return /[A-Za-z0-9]/.test(withoutChoiceMarkers) && withoutChoiceMarkers.length >= 3;
}

function trimClarificationBuffer(output: string): string {
  return output.length > 8000 ? output.slice(-8000) : output;
}

// ============================================================================
// Factory
// ============================================================================

let globalClarificationHandler: ClarificationHandler | null = null;

export function getClarificationHandler(config?: ClarificationHandlerConfig): ClarificationHandler {
  if (!globalClarificationHandler) {
    globalClarificationHandler = new ClarificationHandler(config);
  }
  return globalClarificationHandler;
}

export function createClarificationHandler(
  config?: ClarificationHandlerConfig
): ClarificationHandler {
  return new ClarificationHandler(config);
}
