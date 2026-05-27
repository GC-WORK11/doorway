/**
 * Event Trigger System
 *
 * Reactive automation triggers based on file changes, git hooks, and patterns.
 * Part of the automation system for Doorway.
 */

import type Database from 'better-sqlite3';
import type { ProjectId, TerminalSessionId, ThreadId } from '@doorway/protocol';
import { terminalSubmitLines } from '@doorway/protocol';
import type { FileDeltaWatcher } from '@doorway/terminal-runtime';
import {
  attachAutomationRunEvidence,
  createAutomationRun,
  getAutomationById,
  listAutomations,
  startAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getAutomationRunById,
} from '@doorway/core';
import { getNextRunTime } from './cron.js';
import type { AgentTerminalRuntime } from './index.js';

export {
  describeCronExpression,
  getNextRunTime,
  isValidCronExpression,
  parseCronExpression,
  type ParsedCronExpression,
} from './cron.js';

/**
 * Event trigger types for reactive automations
 */
export type EventTriggerType =
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'git_commit'
  | 'git_push'
  | 'git_pull'
  | 'git_branch'
  | 'pattern_match';

export interface EventTrigger {
  readonly id: string;
  readonly automationId: string;
  readonly triggerType: EventTriggerType;
  readonly pattern?: string;
  readonly pathFilter?: string;
  readonly enabled: boolean;
}

/**
 * Event that can trigger an automation
 */
export interface AutomationEvent {
  readonly type: EventTriggerType;
  readonly projectId: ProjectId;
  readonly path?: string;
  readonly metadata?: Record<string, string>;
  readonly timestamp: Date;
}

/**
 * Event trigger configuration
 */
export interface EventTriggerConfig {
  readonly projectId: ProjectId;
  readonly triggerType: EventTriggerType;
  readonly pattern?: string;
  readonly pathFilter?: string;
  readonly automationId: string;
}

/**
 * EventTriggerRuntime - Manages event-based automation triggers
 */
export class EventTriggerRuntime {
  private readonly db: Database.Database;
  private readonly terminalManager: AgentTerminalRuntime;
  private readonly cwd: string;
  private activeWatchers: Map<string, FileWatcherHandle> = new Map();

  constructor(
    db: Database.Database,
    options: {
      readonly terminalManager?: AgentTerminalRuntime;
      readonly cwd?: string;
    } = {}
  ) {
    this.db = db;
    this.terminalManager = options.terminalManager ?? createSessionManager();
    this.cwd = options.cwd ?? process.cwd();
  }

  /**
   * Register an event trigger for an automation
   */
  registerTrigger(config: EventTriggerConfig): EventTrigger {
    const id = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const trigger: EventTrigger = {
      id,
      automationId: config.automationId,
      triggerType: config.triggerType,
      pattern: config.pattern,
      pathFilter: config.pathFilter,
      enabled: true,
    };

    // Store trigger in database
    this.db
      .prepare(
        `INSERT INTO automation_event_triggers (id, automation_id, trigger_type, pattern, path_filter, enabled)
     VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(id, config.automationId, config.triggerType, config.pattern ?? null, config.pathFilter ?? null);

    // Start watching if this is a file-based trigger
    if (this.isFileTrigger(config.triggerType)) {
      this.startFileWatcher(trigger);
    }

    return trigger;
  }

  /**
   * Unregister an event trigger
   */
  unregisterTrigger(triggerId: string): void {
    const watcher = this.activeWatchers.get(triggerId);
    if (watcher) {
      watcher.close();
      this.activeWatchers.delete(triggerId);
    }

    this.db.prepare('DELETE FROM automation_event_triggers WHERE id = ?').run(triggerId);
  }

  /**
   * Get all event triggers for a project
   */
  getTriggers(projectId?: ProjectId): readonly EventTrigger[] {
    let sql = 'SELECT * FROM automation_event_triggers WHERE enabled = 1';
    const params: unknown[] = [];

    if (projectId) {
      sql = `SELECT e.* FROM automation_event_triggers e
             JOIN automations a ON e.automation_id = a.id
             WHERE e.enabled = 1 AND a.project_id = ?`;
      params.push(projectId);
    }

    const rows = this.db.prepare(sql).all(...params) as EventTriggerRow[];
    return rows.map(this.rowToTrigger);
  }

  /**
   * Get event triggers for a specific automation
   */
  getTriggersForAutomation(automationId: string): readonly EventTrigger[] {
    const rows = this.db
      .prepare('SELECT * FROM automation_event_triggers WHERE automation_id = ?')
      .all(automationId) as EventTriggerRow[];
    return rows.map(this.rowToTrigger);
  }

  /**
   * Handle an incoming automation event and trigger matching automations
   */
  async handleEvent(event: AutomationEvent): Promise<void> {
    const triggers = this.getTriggers(event.projectId);

    for (const trigger of triggers) {
      if (!this.matchesTrigger(event, trigger)) {
        continue;
      }

      const automation = getAutomationById(this.db, trigger.automationId);
      if (!automation || !automation.enabled) {
        continue;
      }

      // Check if automation is already running
      const runningRuns = this.db
        .prepare("SELECT id FROM automation_runs WHERE automation_id = ? AND status = 'running'")
        .all(trigger.automationId);

      if (runningRuns.length > 0) {
        console.log(
          `[EventTrigger] Skipping trigger ${trigger.id}: automation ${automation.id} is already running`
        );
        continue;
      }

      console.log(
        `[EventTrigger] Trigger ${trigger.id} matched for automation ${automation.id}`
      );
      await this.triggerAutomation(automation.id, event);
    }
  }

  /**
   * Trigger an automation with event context
   */
  private async triggerAutomation(
    automationId: string,
    event: AutomationEvent
  ): Promise<void> {
    const automation = getAutomationById(this.db, automationId);
    if (!automation) return;

    const run = createAutomationRun(this.db, automationId);
    startAutomationRun(this.db, run.id);

    try {
      const result = await this.runInTerminal(automation, run.id, event);

      if (result.exitCode !== 0) {
        failAutomationRun(this.db, run.id, result.output, result.exitCode);
      } else {
        completeAutomationRun(this.db, run.id, {
          exitCode: result.exitCode,
          output: result.output,
        });
      }
    } catch (error) {
      failAutomationRun(this.db, run.id, String(error));
    }
  }

  private async runInTerminal(
    automation: { id: string; command: string; projectId: string | null },
    runId: string,
    event: AutomationEvent
  ): Promise<{ readonly exitCode: number; readonly output: string }> {
    const output: string[] = [];
    const cwd = automation.projectId
      ? this.getProjectPath(automation.projectId)
      : this.cwd;

    const terminal = await this.terminalManager.launch({ cwd });
    const sessionId = terminal.sessionId as TerminalSessionId;

    attachAutomationRunEvidence(this.db, runId, { terminalSessionId: sessionId });

    const unsubscribeData = this.terminalManager.onData((emittedSessionId, data) => {
      if (emittedSessionId !== terminal.sessionId) return;
      output.push(data);
    });

    const exitCode = await new Promise<number>((resolve) => {
      const unsubscribeExit = this.terminalManager.onExit((emittedSessionId, code) => {
        if (emittedSessionId !== terminal.sessionId) return;
        unsubscribeExit();
        unsubscribeData();
        resolve(code ?? -1);
      });

      // Build the command with event context
      const eventContext = this.buildEventContext(event);
      const fullCommand = terminalSubmitLines([...eventContext, automation.command, 'exit $?']);
      this.terminalManager.sendInput(terminal.sessionId, fullCommand);
    });

    return { exitCode, output: output.join('') };
  }

  private buildEventContext(event: AutomationEvent): readonly string[] {
    const lines: string[] = [];

    lines.push(`# Automation triggered by: ${event.type}`);
    lines.push(`# Time: ${event.timestamp.toISOString()}`);

    if (event.path) {
      lines.push(`# Path: ${event.path}`);
    }

    if (event.metadata) {
      for (const [key, value] of Object.entries(event.metadata)) {
        lines.push(`# ${key}: ${value}`);
      }
    }

    return lines;
  }

  private getProjectPath(projectId: string): string {
    const row = this.db
      .prepare('SELECT path FROM projects WHERE id = ?')
      .get(projectId) as { path: string } | undefined;
    return row?.path ?? this.cwd;
  }

  private matchesTrigger(event: AutomationEvent, trigger: EventTrigger): boolean {
    if (event.type !== trigger.triggerType) {
      return false;
    }

    // Check path filter
    if (trigger.pathFilter && event.path) {
      if (!this.matchesPattern(event.path, trigger.pathFilter)) {
        return false;
      }
    }

    // Check pattern match
    if (trigger.pattern && event.path) {
      if (!this.matchesPattern(event.path, trigger.pattern)) {
        return false;
      }
    }

    return true;
  }

  private matchesPattern(value: string, pattern: string): boolean {
    // Support simple glob-like patterns
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      return regex.test(value);
    }

    // Support prefix matching
    if (pattern.endsWith('/')) {
      return value.startsWith(pattern);
    }

    // Default: exact or substring match
    return value.includes(pattern) || value === pattern;
  }

  private isFileTrigger(triggerType: EventTriggerType): boolean {
    return (
      triggerType === 'file_created' ||
      triggerType === 'file_modified' ||
      triggerType === 'file_deleted'
    );
  }

  private startFileWatcher(trigger: EventTrigger): void {
    const automation = getAutomationById(this.db, trigger.automationId);
    if (!automation || !automation.projectId) return;

    const projectPath = this.getProjectPath(automation.projectId);
    const pathFilter = trigger.pathFilter;
    const projectId = automation.projectId as ProjectId;

    // Import file watcher lazily to avoid circular dependencies
    import('@doorway/terminal-runtime').then(async ({ startFileDeltaWatcher }) => {
      const watcher = await startFileDeltaWatcher({
        rootPath: projectPath,
        debounceMs: 500,
        onDelta: (delta) => {
          for (const change of delta.changes) {
            if (pathFilter && !this.matchesPattern(change.path, pathFilter)) {
              continue;
            }

            const eventType =
              change.changeType === 'created'
                ? 'file_created'
                : change.changeType === 'modified'
                  ? 'file_modified'
                  : 'file_deleted';

            void this.handleEvent({
              type: eventType,
              projectId,
              path: change.path,
              timestamp: new Date(),
            });
          }
        },
        onError: (error) => {
          console.error(`[EventTrigger] File watcher error for ${trigger.id}:`, error);
        },
      });

      const fileWatcher: FileDeltaWatcher = watcher;
      this.activeWatchers.set(trigger.id, {
        close: () => fileWatcher.close(),
      });
    });
  }

  private rowToTrigger(row: EventTriggerRow): EventTrigger {
    return {
      id: row.id,
      automationId: row.automation_id,
      triggerType: row.trigger_type as EventTriggerType,
      pattern: row.pattern ?? undefined,
      pathFilter: row.path_filter ?? undefined,
      enabled: Boolean(row.enabled),
    };
  }

  /**
   * Stop all active watchers
   */
  shutdown(): void {
    for (const watcher of this.activeWatchers.values()) {
      watcher.close();
    }
    this.activeWatchers.clear();
  }
}

interface EventTriggerRow {
  readonly id: string;
  readonly automation_id: string;
  readonly trigger_type: string;
  readonly pattern: string | null;
  readonly path_filter: string | null;
  readonly enabled: number;
}

interface FileWatcherHandle {
  close(): void;
}

// Lazy import to avoid circular dependency
function createSessionManager(): AgentTerminalRuntime {
  const { createSessionManager: createManager } = require('@doorway/terminal-runtime');
  return createManager();
}
