/**
 * Fault Recovery Service
 *
 * Detects terminal/CLI failures and automatically recovers:
 * - Crash detection (SIGSEGV, SIGABRT, panic, OOM)
 * - Timeout detection
 * - Network failure detection
 * - Auto-retry with exponential backoff
 * - Re-prompt on clarification requests
 *
 * This is what makes Doorway feel like a human operator.
 */

import type { TerminalSessionId, AgentRunId, ThreadId } from '@doorway/protocol';
import type { ClarificationRequest } from './clarification-handler.js';

// ============================================================================
// Types
// ============================================================================

export type FaultType =
  | 'normal_exit'
  | 'crash'
  | 'oom'
  | 'panic'
  | 'timeout'
  | 'network'
  | 'permission'
  | 'auth'
  | 'rate_limit'
  | 'clarification_request';

export type FaultSeverity = 'recoverable' | 'permanent' | 'needs_human';

export interface FaultDetection {
  readonly faultType: FaultType;
  readonly severity: FaultSeverity;
  readonly reason: string;
  readonly rawOutput?: string;
  readonly exitCode?: number;
  readonly signal?: string;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableFaults: FaultType[];
}

export interface RecoveryAction {
  readonly type: 'retry' | 'reprompt' | 'switch_model' | 'ask_user' | 'halt';
  readonly delayMs?: number;
  readonly newPrompt?: string;
  readonly message?: string;
  readonly reason: string;
}

export interface FaultRecoveryConfig {
  readonly enabled: boolean;
  readonly defaultPolicy: RetryPolicy;
  readonly perModelPolicies?: Partial<Record<string, RetryPolicy>>;
  readonly onClarificationRequest?: (request: ClarificationRequest) => void;
  readonly onRecoveryAction?: (action: RecoveryAction) => void;
}

export interface RunningProcess {
  readonly sessionId: TerminalSessionId;
  readonly runId: AgentRunId;
  readonly threadId: ThreadId;
  readonly provider: string;
  readonly startedAt: Date;
  readonly lastHeartbeat: Date;
  readonly status: 'running' | 'waiting_input' | 'crashed' | 'completed';
  readonly exitCode?: number;
  readonly signal?: string;
}

// ============================================================================
// Default Policies
// ============================================================================

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableFaults: ['crash', 'timeout', 'network', 'rate_limit', 'oom'],
};

export const MODEL_SPECIFIC_POLICIES: Partial<Record<string, RetryPolicy>> = {
  claude: {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    retryableFaults: ['crash', 'timeout', 'network', 'rate_limit', 'oom', 'clarification_request'],
  },
  codex: {
    maxRetries: 2,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableFaults: ['crash', 'timeout', 'network', 'rate_limit'],
  },
  'claude-sonnet': {
    maxRetries: 3,
    baseDelayMs: 1500,
    maxDelayMs: 45000,
    backoffMultiplier: 2,
    retryableFaults: ['crash', 'timeout', 'network', 'rate_limit', 'oom', 'clarification_request'],
  },
  'claude-opus': {
    maxRetries: 5,
    baseDelayMs: 3000,
    maxDelayMs: 120000,
    backoffMultiplier: 1.5,
    retryableFaults: ['crash', 'timeout', 'network', 'rate_limit', 'oom', 'clarification_request'],
  },
};

// ============================================================================
// Crash Detection Patterns
// ============================================================================

const CRASH_PATTERNS = [
  // Unix signals
  { pattern: /SIGSEGV|Segmentation fault/i, type: 'crash' as FaultType },
  { pattern: /SIGABRT|Abort trap/i, type: 'crash' as FaultType },
  { pattern: /SIGKILL|Killed/i, type: 'crash' as FaultType },
  { pattern: /SIGBUS|Bus error/i, type: 'crash' as FaultType },
  { pattern: /SIGFPE|Floating point exception/i, type: 'crash' as FaultType },

  // Rust panic
  { pattern: /thread '.*' panicked at /i, type: 'panic' as FaultType },
  { pattern: /panicked at /i, type: 'panic' as FaultType },

  // Go panic
  { pattern: /panic: /i, type: 'panic' as FaultType },
  { pattern: /goroutine \d+ panic/i, type: 'panic' as FaultType },

  // OOM
  { pattern: /out of memory|killed process|oom/i, type: 'oom' as FaultType },
  { pattern: /cannot allocate memory/i, type: 'oom' as FaultType },
  { pattern: /memory allocation failed/i, type: 'oom' as FaultType },

  // Timeout
  { pattern: /timeout|timed out/i, type: 'timeout' as FaultType },
  { pattern: /request timeout/i, type: 'timeout' as FaultType },
  { pattern: /operation timed out/i, type: 'timeout' as FaultType },

  // Network
  { pattern: /connection refused|connection reset/i, type: 'network' as FaultType },
  { pattern: /network error|no route to host/i, type: 'network' as FaultType },
  { pattern: /ECONNREFUSED|ECONNRESET|ENOTFOUND/i, type: 'network' as FaultType },
  { pattern: /ETIMEDOUT/i, type: 'network' as FaultType },

  // Permission
  { pattern: /permission denied|EACCES|EPERM/i, type: 'permission' as FaultType },

  // Auth
  {
    pattern: /authentication failed|auth.*failed|invalid.*token|unauthorized/i,
    type: 'auth' as FaultType,
  },
  { pattern: /401|403 forbidden/i, type: 'auth' as FaultType },

  // Rate limit
  { pattern: /rate limit|429|too many requests/i, type: 'rate_limit' as FaultType },
  { pattern: /retry after|please retry/i, type: 'rate_limit' as FaultType },
];

// ============================================================================
// Clarification Request Patterns
// ============================================================================

const CLARIFICATION_PATTERNS = [
  // Claude patterns
  { pattern: /\?$/m, type: 'clarification_request' as FaultType },
  {
    pattern: /please provide|provide me|i need to know/i,
    type: 'clarification_request' as FaultType,
  },
  {
    pattern: /could you (clarify|explain|tell me|confirm)/i,
    type: 'clarification_request' as FaultType,
  },
  { pattern: /is this correct\?|should i proceed\?/i, type: 'clarification_request' as FaultType },
  {
    pattern: /do you want me to|would you like me to/i,
    type: 'clarification_request' as FaultType,
  },
  {
    pattern: /waiting for your (input|response|confirmation)/i,
    type: 'clarification_request' as FaultType,
  },

  // Codex patterns
  { pattern: /need.*information|require.*input/i, type: 'clarification_request' as FaultType },
  { pattern: /please confirm|confirm this/i, type: 'clarification_request' as FaultType },
];

// ============================================================================
// Exit Code Classification
// ============================================================================

const EXIT_CODE_CLASSIFICATION: Record<number, FaultType> = {
  1: 'crash', // General error
  2: 'crash', // Misuse of shell command
  126: 'permission', // Command not executable
  127: 'crash', // Command not found
  128: 'crash', // Invalid exit argument
  130: 'crash', // Ctrl+C (SIGINT)
  137: 'oom', // SIGKILL (likely OOM killer)
  139: 'crash', // SIGSEGV
  143: 'crash', // SIGTERM
  255: 'crash', // Exit status out of range
};

const SIGNAL_CLASSIFICATION: Record<string, FaultType> = {
  SIGSEGV: 'crash',
  SIGABRT: 'crash',
  SIGBUS: 'crash',
  SIGFPE: 'crash',
  SIGKILL: 'crash',
  SIGTERM: 'crash',
  SIGXCPU: 'oom',
  SIGXFSZ: 'oom',
};

// ============================================================================
// Fault Recovery Service
// ============================================================================

export class FaultRecoveryService {
  private readonly processes = new Map<TerminalSessionId, RunningProcess>();
  private readonly retryCounts = new Map<AgentRunId, number>();
  private readonly config: FaultRecoveryConfig;

  constructor(config: Partial<FaultRecoveryConfig> = {}) {
    this.config = {
      enabled: true,
      defaultPolicy: DEFAULT_RETRY_POLICY,
      ...config,
    };
  }

  /**
   * Register a running process for monitoring
   */
  registerProcess(process: RunningProcess): void {
    this.processes.set(process.sessionId, process);
    console.log(
      `[FaultRecovery] Registered process ${process.runId} for session ${process.sessionId.slice(0, 8)}`
    );
  }

  /**
   * Unregister a process when it completes
   */
  unregisterProcess(sessionId: TerminalSessionId): void {
    this.processes.delete(sessionId);
    console.log(`[FaultRecovery] Unregistered session ${sessionId.slice(0, 8)}`);
  }

  /**
   * Update process heartbeat (to detect hangs)
   */
  heartbeat(sessionId: TerminalSessionId, status?: RunningProcess['status']): void {
    const process = this.processes.get(sessionId);
    if (process) {
      this.processes.set(sessionId, {
        ...process,
        lastHeartbeat: new Date(),
        status: status ?? process.status,
      });
    }
  }

  updateStatus(sessionId: TerminalSessionId, status: RunningProcess['status']): void {
    const process = this.processes.get(sessionId);
    if (!process) return;
    this.processes.set(sessionId, {
      ...process,
      status,
      lastHeartbeat: new Date(),
    });
  }

  /**
   * Detect fault from exit code
   */
  detectFaultFromExit(exitCode: number, signal?: string): FaultDetection {
    // Check signal first
    if (signal && SIGNAL_CLASSIFICATION[signal]) {
      const type = SIGNAL_CLASSIFICATION[signal];
      return {
        faultType: type,
        severity: type === 'oom' ? 'recoverable' : 'recoverable',
        reason: `Process received ${signal}`,
        exitCode,
        signal,
      };
    }

    // Check exit code
    if (EXIT_CODE_CLASSIFICATION[exitCode]) {
      const type = EXIT_CODE_CLASSIFICATION[exitCode];
      return {
        faultType: type,
        severity: type === 'oom' ? 'recoverable' : 'recoverable',
        reason: `Process exited with code ${exitCode}`,
        exitCode,
      };
    }

    // Check for successful exit
    if (exitCode === 0) {
      return {
        faultType: 'normal_exit',
        severity: 'permanent',
        reason: 'Process exited successfully (no fault)',
        exitCode,
      };
    }

    // Unknown error
    return {
      faultType: 'crash',
      severity: 'recoverable',
      reason: `Process exited with unknown code ${exitCode}`,
      exitCode,
    };
  }

  /**
   * Detect fault from output stream
   */
  detectFaultFromOutput(output: string): FaultDetection | null {
    for (const { pattern, type } of CRASH_PATTERNS) {
      if (pattern.test(output)) {
        const severity = this.getSeverityForType(type);
        return {
          faultType: type,
          severity,
          reason: `Detected ${type} in output`,
          rawOutput: this.extractRelevantOutput(output, pattern),
        };
      }
    }
    return null;
  }

  /**
   * Detect clarification request from output
   */
  detectClarificationRequest(output: string): string | null {
    // Look for question patterns
    const lines = output.split('\n');
    const recentLines = lines.slice(-10);

    for (const line of recentLines) {
      for (const { pattern } of CLARIFICATION_PATTERNS) {
        if (pattern.test(line)) {
          return line.trim();
        }
      }
    }

    // Also check for interactive prompts
    if (/\?$/.test(output) && output.includes('\n')) {
      const lastLine = lines[lines.length - 1]?.trim();
      if (lastLine && lastLine.length > 0 && lastLine.length < 200) {
        return lastLine;
      }
    }

    return null;
  }

  /**
   * Get retry policy for a provider
   */
  getRetryPolicy(provider: string): RetryPolicy {
    return this.config.perModelPolicies?.[provider] ?? this.config.defaultPolicy;
  }

  /**
   * Determine recovery action based on fault
   */
  determineRecoveryAction(fault: FaultDetection, process: RunningProcess): RecoveryAction {
    const policy = this.getRetryPolicy(process.provider);
    const currentRetryCount = this.retryCounts.get(process.runId) ?? 0;

    if (fault.faultType === 'normal_exit') {
      return {
        type: 'halt',
        reason: 'Process exited successfully; no recovery needed',
        message: 'No recovery needed.',
      };
    }

    // Check if fault is retryable
    if (!policy.retryableFaults.includes(fault.faultType)) {
      return {
        type: fault.faultType === 'clarification_request' ? 'ask_user' : 'halt',
        reason: `Fault type ${fault.faultType} is not retryable`,
        message: `Irrecoverable error: ${fault.reason}`,
      };
    }

    // Check if we've exceeded max retries
    if (currentRetryCount >= policy.maxRetries) {
      return {
        type: 'ask_user',
        reason: `Exceeded maximum retry count (${policy.maxRetries})`,
        message: `Max retries exceeded. Manual intervention required.`,
      };
    }

    // Calculate backoff delay
    const delayMs = Math.min(
      policy.baseDelayMs * Math.pow(policy.backoffMultiplier, currentRetryCount),
      policy.maxDelayMs
    );

    // Return retry action
    return {
      type: 'retry',
      delayMs,
      reason: `${fault.faultType} detected, scheduling retry ${currentRetryCount + 1}/${policy.maxRetries}`,
      message: `Retrying in ${Math.round(delayMs / 1000)}s...`,
    };
  }

  /**
   * Execute recovery action
   */
  async executeRecovery(action: RecoveryAction, process: RunningProcess): Promise<boolean> {
    console.log(`[FaultRecovery] Executing ${action.type} for ${process.runId}: ${action.reason}`);

    switch (action.type) {
      case 'retry': {
        // Increment retry count
        const currentCount = this.retryCounts.get(process.runId) ?? 0;
        this.retryCounts.set(process.runId, currentCount + 1);

        // Wait for backoff
        if (action.delayMs) {
          await this.sleep(action.delayMs);
        }

        // Notify listener
        this.config.onRecoveryAction?.(action);
        return true;
      }

      case 'ask_user':
        this.config.onRecoveryAction?.(action);
        return false;

      case 'halt':
        this.config.onRecoveryAction?.(action);
        return false;

      case 'reprompt':
        this.config.onRecoveryAction?.(action);
        return true;

      case 'switch_model':
        this.config.onRecoveryAction?.(action);
        return true;

      default:
        return false;
    }
  }

  /**
   * Check for hanging processes (no heartbeat)
   */
  detectHangedProcesses(timeoutMs: number = 60000): RunningProcess[] {
    const now = Date.now();
    const hanged: RunningProcess[] = [];

    for (const [sessionId, process] of this.processes) {
      if (process.status !== 'running') continue;

      const lastHeartbeatAge = now - process.lastHeartbeat.getTime();
      if (lastHeartbeatAge > timeoutMs) {
        hanged.push(process);
      }
    }

    return hanged;
  }

  /**
   * Get process info
   */
  getProcess(sessionId: TerminalSessionId): RunningProcess | undefined {
    return this.processes.get(sessionId);
  }

  /**
   * Get all active processes
   */
  getActiveProcesses(): RunningProcess[] {
    return Array.from(this.processes.values()).filter((p) => p.status === 'running');
  }

  /**
   * Get retry count for a run
   */
  getRetryCount(runId: AgentRunId): number {
    return this.retryCounts.get(runId) ?? 0;
  }

  /**
   * Reset retry count for a run
   */
  resetRetryCount(runId: AgentRunId): void {
    this.retryCounts.delete(runId);
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private getSeverityForType(type: FaultType): FaultSeverity {
    switch (type) {
      case 'normal_exit':
        return 'permanent';
      case 'oom':
      case 'timeout':
      case 'network':
      case 'rate_limit':
        return 'recoverable';
      case 'clarification_request':
        return 'needs_human';
      case 'crash':
      case 'panic':
        return 'recoverable';
      case 'permission':
      case 'auth':
        return 'permanent';
      default:
        return 'recoverable';
    }
  }

  private extractRelevantOutput(output: string, pattern: RegExp): string {
    const lines = output.split('\n');
    const relevantLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        // Include a few lines before and after
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        relevantLines.push(...lines.slice(start, end));
      }
    }

    return relevantLines.join('\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalFaultRecoveryService: FaultRecoveryService | null = null;

export function getFaultRecoveryService(
  config?: Partial<FaultRecoveryConfig>
): FaultRecoveryService {
  if (!globalFaultRecoveryService) {
    globalFaultRecoveryService = new FaultRecoveryService(config);
  }
  return globalFaultRecoveryService;
}

export function createFaultRecoveryService(
  config?: Partial<FaultRecoveryConfig>
): FaultRecoveryService {
  return new FaultRecoveryService(config);
}
