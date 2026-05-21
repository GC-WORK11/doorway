/**
 * Doorway Scheduler Module
 * 
 * Cron expression parsing and scheduling runtime for automations.
 */

import type Database from 'better-sqlite3';
import { spawn } from 'child_process';
import {
  type Automation,
  type AutomationRun,
  createAutomationRun,
  startAutomationRun,
  completeAutomationRun,
  failAutomationRun,
  getDueAutomations,
  setAutomationLastRun,
  setAutomationNextRun,
  getAutomationById,
} from '@doorway/core';
import { generateId } from '@doorway/core';

// ============================================================================
// Cron Parser
// ============================================================================

/**
 * Parse a cron expression and calculate the next run time.
 * Supports standard 5-field cron: minute hour day month weekday
 */
export function parseCronExpression(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minute, hour, day, month, weekday] = parts;

  const minuteField = parseCronField(minute, 0, 59);
  const hourField = parseCronField(hour, 0, 23);
  const dayField = parseCronField(day, 1, 31);
  const monthField = parseCronField(month, 1, 12);
  const weekdayField = parseCronField(weekday, 0, 6);

  // If any field is null (invalid), the whole expression is invalid
  if (minuteField === null || hourField === null || dayField === null || monthField === null || weekdayField === null) {
    return null;
  }

  return {
    minute: minuteField,
    hour: hourField,
    day: dayField,
    month: monthField,
    weekday: weekdayField,
  };
}

interface CronFields {
  minute: number[] | null;
  hour: number[] | null;
  day: number[] | null;
  month: number[] | null;
  weekday: number[] | null;
}

function parseCronField(value: string, min: number, max: number): number[] | null {
  if (value === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  const result: number[] = [];
  const parts = value.split(',');

  for (const part of parts) {
    // Handle step values (*/5, 0-30/5)
    const stepMatch = part.match(/^(\*|[\d-]+)\/(\d+)$/);
    if (stepMatch) {
      const range = stepMatch[1] === '*' ? `${min}-${max}` : stepMatch[1];
      const step = parseInt(stepMatch[2], 10);
      const rangeResult = parseRange(range, min, max);
      if (!rangeResult) return null;
      for (let i = rangeResult.min; i <= rangeResult.max; i += step) {
        if (!result.includes(i)) result.push(i);
      }
      continue;
    }

    // Handle range (1-5)
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const rangeResult = parseRange(part, min, max);
      if (!rangeResult) return null;
      for (let i = rangeResult.min; i <= rangeResult.max; i++) {
        if (!result.includes(i)) result.push(i);
      }
      continue;
    }

  // Handle single value
  const num = parseInt(part, 10);
  if (isNaN(num) || num < min || num > max) {
    return null;
  }
  if (!result.includes(num)) result.push(num);
  }

  return result.length > 0 ? result.sort((a, b) => a - b) : null;
}

function parseRange(value: string, min: number, max: number): { min: number; max: number } | null {
  if (value === '*') {
    return { min, max };
  }
  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < min || num > max) return null;
    return { min: num, max: num };
  }
  const minVal = parseInt(match[1], 10);
  const maxVal = parseInt(match[2], 10);
  if (minVal < min || maxVal > max || minVal > maxVal) return null;
  return { min: minVal, max: maxVal };
}

/**
 * Calculate the next occurrence time based on a cron expression.
 */
export function getNextRunTime(expression: string, from: Date = new Date()): Date | null {
  const fields = parseCronExpression(expression);
  if (!fields) return null;

  const result = new Date(from);
  result.setSeconds(0);
  result.setMilliseconds(0);

  // Advance minute by minute until we find a match (max 1 year of iterations)
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    result.setMinutes(result.getMinutes() + 1);

    if (matchesCronFields(result, fields)) {
      return result;
    }
  }

  return null;
}

function matchesCronFields(date: Date, fields: CronFields): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1; // JS months are 0-indexed
  const weekday = date.getDay();

  if (fields.minute !== null && !fields.minute.includes(minute)) return false;
  if (fields.hour !== null && !fields.hour.includes(hour)) return false;
  if (fields.month !== null && !fields.month.includes(month)) return false;

  // Day and weekday: if both are restricted, match either
  const dayRestricted = fields.day !== null && fields.day.length < 31;
  const weekdayRestricted = fields.weekday !== null && fields.weekday.length < 7;

  if (dayRestricted && weekdayRestricted) {
    return fields.day.includes(day) || fields.weekday.includes(weekday);
  }
  if (dayRestricted && !fields.day.includes(day)) return false;
  if (weekdayRestricted && !fields.weekday.includes(weekday)) return false;

  return true;
}

// ============================================================================
// Scheduler Runtime
// ============================================================================

export interface SchedulerConfig {
  readonly checkIntervalMs?: number;
  readonly maxConcurrentRuns?: number;
}

export class SchedulerRuntime {
  private readonly db: Database.Database;
  private readonly config: Required<SchedulerConfig>;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private activeRuns = new Set<string>();

  constructor(db: Database.Database, config: SchedulerConfig = {}) {
    this.db = db;
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60000, // Default: check every minute
      maxConcurrentRuns: config.maxConcurrentRuns ?? 3,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Initial check
    this.tick();

    // Schedule periodic checks
    this.intervalId = setInterval(() => this.tick(), this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      const dueAutomations = getDueAutomations(this.db);

      for (const automation of dueAutomations) {
        if (this.activeRuns.size >= this.config.maxConcurrentRuns) {
          break;
        }

        if (this.activeRuns.has(automation.id)) {
          continue;
        }

        this.executeAutomation(automation);
      }
    } catch (error) {
      console.error('[Scheduler] Error checking due automations:', error);
    }
  }

  private async executeAutomation(automation: Automation): Promise<void> {
    this.activeRuns.add(automation.id);
    const run = createAutomationRun(this.db, automation.id);

    try {
      startAutomationRun(this.db, run.id);

      // Execute the command
      const result = await this.executeCommand(automation.command);

      completeAutomationRun(this.db, run.id, {
        exitCode: result.exitCode,
        output: result.output,
      });

      setAutomationLastRun(this.db, automation.id, new Date().toISOString());

      // Calculate next run time
      const nextRun = getNextRunTime(automation.cronExpression);
      if (nextRun) {
        setAutomationNextRun(this.db, automation.id, nextRun.toISOString());
      }
    } catch (error) {
      failAutomationRun(this.db, run.id, error instanceof Error ? error.message : String(error));
    } finally {
      this.activeRuns.delete(automation.id);
    }
  }

  private executeCommand(command: string): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, [], {
        shell: true,
        env: { ...process.env },
      });

      let output = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code ?? 0,
          output: output.slice(0, 10000), // Limit output to 10KB
        });
      });

      child.on('error', (error) => {
        resolve({
          exitCode: 1,
          output: `Error: ${error.message}`,
        });
      });
    });
  }

  /**
   * Manually trigger an automation to run now.
   */
  async triggerAutomation(automationId: string): Promise<AutomationRun | null> {
    const automation = getAutomationById(this.db, automationId);
    if (!automation) return null;

    const run = createAutomationRun(this.db, automationId);
    startAutomationRun(this.db, run.id);

    try {
      const result = await this.executeCommand(automation.command);

      // Use failAutomationRun for non-zero exit codes
      if (result.exitCode !== 0) {
        const failed = failAutomationRun(this.db, run.id, `Command exited with code ${result.exitCode}`, result.exitCode);
        setAutomationLastRun(this.db, automationId, new Date().toISOString());
        const nextRun = getNextRunTime(automation.cronExpression);
        if (nextRun) {
          setAutomationNextRun(this.db, automationId, nextRun.toISOString());
        }
        return failed;
      }

      const completed = completeAutomationRun(this.db, run.id, {
        exitCode: result.exitCode,
        output: result.output,
      });

      setAutomationLastRun(this.db, automationId, new Date().toISOString());

      const nextRun = getNextRunTime(automation.cronExpression);
      if (nextRun) {
        setAutomationNextRun(this.db, automationId, nextRun.toISOString());
      }

      return completed;
    } catch (error) {
      return failAutomationRun(this.db, run.id, error instanceof Error ? error.message : String(error));
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// Validation Utility
// ============================================================================

export function isValidCronExpression(expression: string): boolean {
  return parseCronExpression(expression) !== null;
}

export function describeCronExpression(expression: string): string | null {
  const fields = parseCronExpression(expression);
  if (!fields) return null;

  const parts: string[] = [];

  if (fields.minute) {
    parts.push(`minutes: ${describeField(fields.minute)}`);
  }
  if (fields.hour) {
    parts.push(`hours: ${describeField(fields.hour)}`);
  }
  if (fields.day) {
    parts.push(`days: ${describeField(fields.day)}`);
  }
  if (fields.month) {
    parts.push(`months: ${describeField(fields.month)}`);
  }
  if (fields.weekday !== null) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = fields.weekday.map(d => dayNames[d]).join(', ');
    parts.push(`weekdays: ${days}`);
  }

  return parts.join(', ');
}

function describeField(values: number[]): string {
  if (values.length === 0) return 'none';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === values.length - 1 && values.every((v, i) => v === min + i)) {
    return `${min}-${max}`;
  }

  if (values.length <= 5) {
    return values.join(', ');
  }

  return `${values.length} values`;
}
