/**
 * Scheduler - Cron-based automation execution with retry support
 */

import type Database from 'better-sqlite3';
import type { Automation, AutomationRun } from '@doorway/core';
import {
  appendTerminalChunk,
  attachAutomationRunEvidence,
  createAutomationRun,
  createThread,
  listAutomations,
  getAutomationRunById,
  getProject,
  recordEvent,
  recordTerminalInput,
  recordTerminalStarted,
  recordTerminalStopped,
  startAutomationRun,
  completeAutomationRun,
  failAutomationRun,
} from '@doorway/core';
import { createSessionManager } from '@doorway/terminal-runtime';
import type { ProjectId, TerminalSessionId, ThreadId, TerminalExitClassification } from '@doorway/protocol';
import { terminalSubmitLines } from '@doorway/protocol';
import type { AgentTerminalRuntime } from './index.js';
import { getNextRunTime } from './cron.js';
import { classifyTerminalExit } from '@doorway/terminal-runtime';

export {
  describeCronExpression,
  getNextRunTime,
  isValidCronExpression,
  parseCronExpression,
  type ParsedCronExpression,
} from './cron.js';

/**
 * Automation retry policy
 */
export interface AutomationRetryPolicy {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

export const DEFAULT_AUTOMATION_RETRY_POLICY: AutomationRetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 5000,
  maxDelayMs: 120000,
  backoffMultiplier: 2,
};

/**
 * SchedulerRuntime - Executes automations based on cron schedules
 */
export class SchedulerRuntime {
  private running = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs = 60000; // Check every minute
  private readonly terminalManager: AgentTerminalRuntime;
  private readonly retryPolicy: AutomationRetryPolicy;
  private readonly retryCounts: Map<string, number> = new Map();

  constructor(
    private readonly db: Database.Database,
    options: {
      readonly terminalManager?: AgentTerminalRuntime;
      readonly cwd?: string;
      readonly retryPolicy?: AutomationRetryPolicy;
    } = {}
  ) {
    this.terminalManager = options.terminalManager ?? createSessionManager();
    this.cwd = options.cwd ?? process.cwd();
    this.retryPolicy = options.retryPolicy ?? DEFAULT_AUTOMATION_RETRY_POLICY;
  }

  private readonly cwd: string;

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.intervalMs);

    // Also run immediately on start
    this.tick();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check if the scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run a single tick - check for automations to execute
   */
  private tick(): void {
    const automations = listAutomations(this.db);
    const now = new Date();

    for (const automation of automations) {
      if (!automation.enabled) continue;

      const nextRun = getNextRunTime(automation.cronExpression, now);
      if (nextRun && nextRun.getTime() <= now.getTime() + this.intervalMs) {
        // Execute the automation
        void this.triggerAutomation(automation.id);
      }
    }
  }

  /**
   * Trigger an automation immediately with retry support
   */
  async triggerAutomation(
    automationId: string,
    options?: { readonly retryCount?: number }
  ): Promise<AutomationRun | null> {
    const automations = listAutomations(this.db);
    const automation = automations.find((a) => a.id === automationId);
    if (!automation) return null;

    const run = createAutomationRun(this.db, automationId);
    const execution = this.createExecutionContext(automation);
    const retryCount = options?.retryCount ?? 0;

    try {
      startAutomationRun(this.db, run.id);
      if (execution.threadId) {
        attachAutomationRunEvidence(this.db, run.id, { threadId: execution.threadId });
      }

      const result = await this.runInTerminal(automation, run.id, execution);
      const exitClassification = classifyTerminalExit({ exitCode: result.exitCode });

      // Check if the failure is retryable
      if (result.exitCode !== 0 && this.isRetryableFailure(exitClassification)) {
        const currentRetryCount = this.retryCounts.get(automationId) ?? 0;
        const maxRetries = this.retryPolicy.maxRetries;

        if (currentRetryCount < maxRetries) {
          // Schedule a retry with exponential backoff
          const delayMs = this.calculateBackoffDelay(currentRetryCount);
          console.log(
            `[Scheduler] Automation ${automationId} failed (retry ${currentRetryCount + 1}/${maxRetries}), scheduling retry in ${delayMs}ms`
          );

          this.retryCounts.set(automationId, currentRetryCount + 1);
          failAutomationRun(this.db, run.id, result.output, result.exitCode);

          // Schedule retry
          setTimeout(() => {
            void this.triggerAutomation(automationId, { retryCount: currentRetryCount + 1 });
          }, delayMs);

          return getAutomationRunById(this.db, run.id);
        } else {
          // Max retries exceeded
          console.log(
            `[Scheduler] Automation ${automationId} exceeded max retries (${maxRetries})`
          );
          this.retryCounts.delete(automationId);
          failAutomationRun(
            this.db,
            run.id,
            `Max retries (${maxRetries}) exceeded: ${result.output}`,
            result.exitCode
          );
          return getAutomationRunById(this.db, run.id);
        }
      }

      // Success or non-retryable failure
      this.retryCounts.delete(automationId);

      if (result.exitCode !== 0) {
        failAutomationRun(this.db, run.id, result.output, result.exitCode);
      } else {
        completeAutomationRun(this.db, run.id, {
          exitCode: result.exitCode,
          output: result.output,
        });
      }
      return getAutomationRunById(this.db, run.id);
    } catch (error) {
      failAutomationRun(this.db, run.id, String(error));
      return getAutomationRunById(this.db, run.id);
    }
  }

  private isRetryableFailure(classification: TerminalExitClassification): boolean {
    const retryableKinds = [
      'killed',
      'segmentation_fault',
      'general_error',
      'signal',
    ];
    return retryableKinds.includes(classification.kind);
  }

  private calculateBackoffDelay(retryCount: number): number {
    const delay =
      this.retryPolicy.baseDelayMs *
      Math.pow(this.retryPolicy.backoffMultiplier, retryCount);
    return Math.min(delay, this.retryPolicy.maxDelayMs);
  }

  private createExecutionContext(automation: Automation): {
    readonly cwd: string;
    readonly threadId?: ThreadId;
  } {
    if (!automation.projectId) {
      return { cwd: this.cwd };
    }

    const project = getProject(this.db, automation.projectId as ProjectId);
    const thread = createThread(
      this.db,
      project.id,
      `Automation: ${automation.name}`,
      automation.command,
      { tags: ['automation'] }
    );
    recordEvent(this.db, thread.id, 'thread.created', {
      threadId: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      goal: thread.metadata.goal,
    });
    return { cwd: project.path, threadId: thread.id };
  }

  private async runInTerminal(
    automation: Automation,
    runId: string,
    execution: { readonly cwd: string; readonly threadId?: ThreadId }
  ): Promise<{ readonly exitCode: number; readonly output: string }> {
    const output: string[] = [];
    const terminal = await this.terminalManager.launch({ cwd: execution.cwd });
    const sessionId = terminal.sessionId as TerminalSessionId;

    if (execution.threadId) {
      recordTerminalStarted(this.db, execution.threadId, {
        sessionId,
        runtime: 'pty',
        workingDirectory: execution.cwd,
        command: automation.command,
        pid: terminal.pid,
      });
      attachAutomationRunEvidence(this.db, runId, { terminalSessionId: sessionId });
    }

    const unsubscribeData = this.terminalManager.onData((emittedSessionId, data, decodedChunk) => {
      if (emittedSessionId !== terminal.sessionId) return;
      output.push(data);
      if (execution.threadId) {
        appendTerminalChunk(this.db, execution.threadId, {
          sessionId,
          text: data,
          cleanText: decodedChunk?.text,
          controlEvents: decodedChunk?.controlEvents,
          screenSnapshot: decodedChunk?.screenSnapshot,
          stateDetection: decodedChunk?.stateDetection,
        });
      }
    });

    const exitCode = await new Promise<number>((resolve) => {
      const unsubscribeExit = this.terminalManager.onExit((emittedSessionId, code, signal) => {
        if (emittedSessionId !== terminal.sessionId) return;
        unsubscribeExit();
        unsubscribeData();
        if (execution.threadId) {
          recordTerminalStopped(this.db, execution.threadId, {
            sessionId,
            exitCode: code,
            ...(signal ? { signal } : {}),
          });
        }
        resolve(code);
      });

      const input = automationTerminalInput(automation.command);
      if (execution.threadId) {
        recordTerminalInput(this.db, execution.threadId, {
          sessionId,
          text: input,
          source: 'doorway',
        });
      }
      this.terminalManager.sendInput(terminal.sessionId, input);
    });

    return { exitCode, output: output.join('') };
  }
}

export function automationTerminalInput(command: string): string {
  const exitCommand = process.platform === 'win32' ? 'exit $LASTEXITCODE' : 'exit $?';
  return terminalSubmitLines([command, exitCommand]);
}
