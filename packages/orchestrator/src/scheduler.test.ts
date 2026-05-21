/**
 * Scheduler Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabase,
  generateId,
  createAutomation,
  getAutomationById,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  createAutomationRun,
  listAutomationRuns,
  getAutomationRunById,
} from '@doorway/core';
import {
  parseCronExpression,
  getNextRunTime,
  isValidCronExpression,
  describeCronExpression,
  SchedulerRuntime,
} from './scheduler.js';
import type Database from 'better-sqlite3';

describe('Cron Parser', () => {
  describe('parseCronExpression', () => {
    it('parses standard 5-field cron expression', () => {
      const result = parseCronExpression('30 14 * * *');
      expect(result).not.toBeNull();
      expect(result!.minute).toEqual([30]);
      expect(result!.hour).toEqual([14]);
    });

    it('parses wildcard fields', () => {
      const result = parseCronExpression('* * * * *');
      expect(result).not.toBeNull();
      expect(result!.minute).toHaveLength(60);
      expect(result!.hour).toHaveLength(24);
    });

    it('parses step expressions', () => {
      const result = parseCronExpression('*/5 * * * *');
      expect(result).not.toBeNull();
      expect(result!.minute).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    });

    it('parses range expressions', () => {
      const result = parseCronExpression('0 9-17 * * 1-5');
      expect(result).not.toBeNull();
      expect(result!.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
      expect(result!.weekday).toEqual([1, 2, 3, 4, 5]);
    });

    it('parses comma-separated values', () => {
      const result = parseCronExpression('0,30 9,12,18 * * *');
      expect(result).not.toBeNull();
      expect(result!.minute).toEqual([0, 30]);
      expect(result!.hour).toEqual([9, 12, 18]);
    });

    it('returns null for invalid expressions', () => {
      expect(parseCronExpression('invalid')).toBeNull();
      expect(parseCronExpression('')).toBeNull();
      expect(parseCronExpression('* * *')).toBeNull();
      expect(parseCronExpression('60 * * * *')).toBeNull(); // minute out of range
    });
  });

  describe('getNextRunTime', () => {
    it('calculates next run for daily cron', () => {
      const result = getNextRunTime('0 9 * * *', new Date('2026-05-21T10:00:00Z'));
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(9);
      // Should be tomorrow since 9am has passed
      expect(result!.getDate()).toBe(22);
    });

    it('calculates next run for weekday cron', () => {
      // Every Monday (weekday 1) at 9am
      const result = getNextRunTime('0 9 * * 1', new Date('2026-05-21T10:00:00Z')); // Thursday
      expect(result).not.toBeNull();
      expect(result!.getDay()).toBe(1); // Monday
    });

    it('returns null for invalid cron', () => {
      expect(getNextRunTime('invalid')).toBeNull();
    });
  });

  describe('isValidCronExpression', () => {
    it('validates correct expressions', () => {
      expect(isValidCronExpression('0 9 * * *')).toBe(true);
      expect(isValidCronExpression('*/15 * * * *')).toBe(true);
      expect(isValidCronExpression('0 9-17 * * 1-5')).toBe(true);
    });

    it('rejects invalid expressions', () => {
      expect(isValidCronExpression('invalid')).toBe(false);
      expect(isValidCronExpression('')).toBe(false);
      expect(isValidCronExpression('* * *')).toBe(false);
    });
  });

  describe('describeCronExpression', () => {
    it('describes simple cron', () => {
      const description = describeCronExpression('0 9 * * *');
      expect(description).toContain('hours: 9');
    });

    it('describes step cron', () => {
      const description = describeCronExpression('*/15 * * * *');
      expect(description).toContain('minutes:');
    });

    it('returns null for invalid cron', () => {
      expect(describeCronExpression('invalid')).toBeNull();
    });
  });
});

describe('SchedulerRuntime', () => {
  let dataPath: string;
  let db: Database.Database;

  beforeEach(async () => {
    dataPath = await mkdtemp(join(tmpdir(), 'doorway-scheduler-'));
    db = createDatabase({ dataPath });
  });

  afterEach(async () => {
    db.close();
    await rm(dataPath, { recursive: true, force: true });
  });

  describe('triggerAutomation', () => {
    it('executes an automation and records the run', async () => {
      const scheduler = new SchedulerRuntime(db);

      const automation = createAutomation(db, {
        name: 'Test Automation',
        cronExpression: '0 9 * * *',
        command: 'echo "hello world"',
      });

      const run = await scheduler.triggerAutomation(automation.id);
      expect(run).not.toBeNull();
      expect(run!.status).toBe('completed');
      expect(run!.exitCode).toBe(0);
      expect(run!.output).toContain('hello world');
    });

    it('returns null for non-existent automation', async () => {
      const scheduler = new SchedulerRuntime(db);
      const run = await scheduler.triggerAutomation('non-existent-id');
      expect(run).toBeNull();
    });

    it('handles command failures gracefully', async () => {
      const scheduler = new SchedulerRuntime(db);

      const automation = createAutomation(db, {
        name: 'Failing Automation',
        cronExpression: '0 9 * * *',
        command: 'false', // 'false' always exits with code 1
      });

      const run = await scheduler.triggerAutomation(automation.id);
      expect(run).not.toBeNull();
      expect(run!.status).toBe('failed');
      expect(run!.exitCode).toBe(1);
    });
  });

  describe('start/stop', () => {
    it('starts and stops the scheduler', () => {
      const scheduler = new SchedulerRuntime(db);
      expect(scheduler.isRunning()).toBe(false);
      
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('does not start twice', () => {
      const scheduler = new SchedulerRuntime(db);
      scheduler.start();
      scheduler.start(); // Should be idempotent
      
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop();
    });
  });
});

describe('Automation CRUD', () => {
  let dataPath: string;
  let db: Database.Database;

  beforeEach(async () => {
    dataPath = await mkdtemp(join(tmpdir(), 'doorway-automation-crud-'));
    db = createDatabase({ dataPath });
  });

  afterEach(async () => {
    db.close();
    await rm(dataPath, { recursive: true, force: true });
  });

  describe('createAutomation', () => {
    it('creates an automation with all fields', () => {
      const automation = createAutomation(db, {
        name: 'Test Automation',
        description: 'A test automation',
        cronExpression: '0 9 * * *',
        command: 'echo test',
        enabled: true,
      });

      expect(automation.id).toMatch(/^automation_/);
      expect(automation.name).toBe('Test Automation');
      expect(automation.description).toBe('A test automation');
      expect(automation.cronExpression).toBe('0 9 * * *');
      expect(automation.command).toBe('echo test');
      expect(automation.enabled).toBe(true);
      expect(automation.lastRunAt).toBeNull();
      expect(automation.nextRunAt).toBeNull();
    });

    it('creates a disabled automation when enabled is false', () => {
      const automation = createAutomation(db, {
        name: 'Disabled Automation',
        cronExpression: '0 9 * * *',
        command: 'echo test',
        enabled: false,
      });

      expect(automation.enabled).toBe(false);
    });
  });

  describe('getAutomationById', () => {
    it('retrieves an existing automation', () => {
      const created = createAutomation(db, {
        name: 'Find Me',
        cronExpression: '0 9 * * *',
        command: 'echo test',
      });

      const found = getAutomationById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Find Me');
    });

    it('returns null for non-existent id', () => {
      const found = getAutomationById(db, 'non-existent');
      expect(found).toBeNull();
    });
  });

  describe('listAutomations', () => {
    it('lists all automations', () => {
      createAutomation(db, { name: 'Auto 1', cronExpression: '0 9 * * *', command: 'echo 1' });
      createAutomation(db, { name: 'Auto 2', cronExpression: '0 10 * * *', command: 'echo 2' });

      const automations = listAutomations(db);
      expect(automations).toHaveLength(2);
    });

    it('filters by enabled status', () => {
      createAutomation(db, { name: 'Enabled', cronExpression: '0 9 * * *', command: 'echo 1', enabled: true });
      createAutomation(db, { name: 'Disabled', cronExpression: '0 10 * * *', command: 'echo 2', enabled: false });

      const enabled = listAutomations(db, { enabled: true });
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('Enabled');
    });
  });

  describe('updateAutomation', () => {
    it('updates automation fields', () => {
      const original = createAutomation(db, {
        name: 'Original Name',
        cronExpression: '0 9 * * *',
        command: 'echo original',
      });

      const updated = updateAutomation(db, {
        id: original.id,
        name: 'Updated Name',
        command: 'echo updated',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.command).toBe('echo updated');
      expect(updated!.cronExpression).toBe('0 9 * * *'); // Unchanged
    });

    it('returns null for non-existent automation', () => {
      const updated = updateAutomation(db, {
        id: 'non-existent',
        name: 'New Name',
      });
      expect(updated).toBeNull();
    });
  });

  describe('deleteAutomation', () => {
    it('deletes an existing automation', () => {
      const automation = createAutomation(db, {
        name: 'To Delete',
        cronExpression: '0 9 * * *',
        command: 'echo test',
      });

      const deleted = deleteAutomation(db, automation.id);
      expect(deleted).toBe(true);

      const found = getAutomationById(db, automation.id);
      expect(found).toBeNull();
    });

    it('returns false for non-existent automation', () => {
      const deleted = deleteAutomation(db, 'non-existent');
      expect(deleted).toBe(false);
    });
  });
});

describe('Automation Runs CRUD', () => {
  let dataPath: string;
  let db: Database.Database;
  let automationId: string;

  beforeEach(async () => {
    dataPath = await mkdtemp(join(tmpdir(), 'doorway-run-crud-'));
    db = createDatabase({ dataPath });

    const automation = createAutomation(db, {
      name: 'Test Automation',
      cronExpression: '0 9 * * *',
      command: 'echo test',
    });
    automationId = automation.id;
  });

  afterEach(async () => {
    db.close();
    await rm(dataPath, { recursive: true, force: true });
  });

  describe('createAutomationRun', () => {
    it('creates an automation run', () => {
      const run = createAutomationRun(db, automationId);

      expect(run.id).toMatch(/^automation_run_/);
      expect(run.automationId).toBe(automationId);
      expect(run.status).toBe('pending');
      expect(run.exitCode).toBeNull();
      expect(run.output).toBeNull();
    });
  });

  describe('listAutomationRuns', () => {
    it('lists runs for an automation', () => {
      createAutomationRun(db, automationId);
      createAutomationRun(db, automationId);

      const runs = listAutomationRuns(db, automationId);
      expect(runs).toHaveLength(2);
    });

    it('limits results', () => {
      for (let i = 0; i < 5; i++) {
        createAutomationRun(db, automationId);
      }

      const runs = listAutomationRuns(db, automationId, { limit: 3 });
      expect(runs).toHaveLength(3);
    });
  });

  describe('getAutomationRunById', () => {
    it('retrieves an existing run', () => {
      const created = createAutomationRun(db, automationId);
      const found = getAutomationRunById(db, created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null for non-existent run', () => {
      const found = getAutomationRunById(db, 'non-existent');
      expect(found).toBeNull();
    });
  });
});
