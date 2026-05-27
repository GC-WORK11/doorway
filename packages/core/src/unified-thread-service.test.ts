/**
 * Tests for Unified Thread Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseMultiAgentDirective,
  meshAgentKindFromProvider,
  UnifiedThreadService,
} from './unified-thread-service.js';

describe('parseMultiAgentDirective', () => {
  it('parses single agent directive', () => {
    const result = parseMultiAgentDirective('@claude implement auth');
    expect(result).not.toBeNull();
    expect(result!.agentTargets).toHaveLength(1);
    expect(result!.agentTargets[0].provider).toBe('claude');
    expect(result!.goal).toBe('implement auth');
  });

  it('parses multiple agent directive', () => {
    const result = parseMultiAgentDirective('@claude @codex implement auth');
    expect(result).not.toBeNull();
    expect(result!.agentTargets).toHaveLength(2);
    expect(result!.agentTargets[0].provider).toBe('claude');
    expect(result!.agentTargets[1].provider).toBe('codex');
    expect(result!.goal).toBe('implement auth');
  });

  it('parses agent with role override', () => {
    const result = parseMultiAgentDirective('@claude:backend @codex:frontend implement login');
    expect(result).not.toBeNull();
    expect(result!.agentTargets).toHaveLength(2);
    expect(result!.agentTargets[0].role).toBe('backend');
    expect(result!.agentTargets[1].role).toBe('frontend');
  });

  it('returns null for non-directive input', () => {
    const result = parseMultiAgentDirective('just some regular text');
    expect(result).toBeNull();
  });

  it('extracts goal correctly', () => {
    const result = parseMultiAgentDirective('@claude @codex implement auth');
    expect(result!.goal).toBe('implement auth');
  });
});

describe('meshAgentKindFromProvider', () => {
  it('maps review provider to reviewer kind', () => {
    expect(meshAgentKindFromProvider('review')).toBe('reviewer');
    expect(meshAgentKindFromProvider('reviewer')).toBe('reviewer');
  });

  it('maps pi provider to pi_agent kind', () => {
    expect(meshAgentKindFromProvider('pi')).toBe('pi_agent');
  });

  it('maps browser provider to browser_supervisor kind', () => {
    expect(meshAgentKindFromProvider('browser')).toBe('browser_supervisor');
  });

  it('maps doorway/brain to doorway_brain kind', () => {
    expect(meshAgentKindFromProvider('doorway')).toBe('doorway_brain');
    expect(meshAgentKindFromProvider('brain')).toBe('doorway_brain');
  });

  it('defaults to visible_cli for unknown providers', () => {
    expect(meshAgentKindFromProvider('claude')).toBe('visible_cli');
    expect(meshAgentKindFromProvider('codex')).toBe('visible_cli');
    expect(meshAgentKindFromProvider('custom')).toBe('visible_cli');
  });
});

describe('UnifiedThreadService', () => {
  let db: any;
  let service: UnifiedThreadService;

  beforeEach(() => {
    // Create in-memory database directly
    const Database = require('better-sqlite3');
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Initialize schema
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        goal TEXT NOT NULL,
        permission_mode TEXT NOT NULL DEFAULT 'open',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE sequences (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attachments TEXT NOT NULL DEFAULT '[]',
        provider TEXT,
        model TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO threads (id, project_id, title, status, goal, permission_mode, tags, created_at, updated_at)
      VALUES ('thread_test', 'proj_test', 'Test Thread', 'active', 'Test goal', 'open', '[]', datetime('now'), datetime('now'));

      INSERT INTO sequences (name, value) VALUES ('events', 0);
    `);
    service = new UnifiedThreadService(db);
  });

  it('creates a session', () => {
    const session = service.createSession('thread_test' as any, 'Test goal', 'parallel');
    expect(session).toBeDefined();
    expect(session.sessionId).toBeDefined();
    expect(session.threadId).toBe('thread_test');
    expect(session.goal).toBe('Test goal');
    expect(session.mode).toBe('parallel');
    expect(session.status).toBe('launching');
  });

  it('registers agents for a session', () => {
    const session = service.createSession('thread_test' as any, 'Test goal', 'parallel');
    service.registerAgents(session.sessionId, [
      {
        agentId: 'agent_1',
        displayName: 'Claude',
        provider: 'claude',
        role: 'backend',
        kind: 'visible_cli',
        prompt: 'implement auth',
        capabilities: ['complex-reasoning'],
      },
      {
        agentId: 'agent_2',
        displayName: 'Codex',
        provider: 'codex',
        role: 'frontend',
        kind: 'visible_cli',
        prompt: 'implement UI',
        capabilities: ['fast-boilerplate'],
      },
    ]);

    const updated = service.getSession(session.sessionId);
    expect(updated!.agentCount).toBe(2);
    expect(updated!.status).toBe('launching');
  });

  it('records agent start', () => {
    const session = service.createSession('thread_test' as any, 'Test goal', 'parallel');
    service.recordAgentStart(session.sessionId, 'agent_1', {
      agentId: 'agent_1',
      displayName: 'Claude',
      role: 'backend',
      status: 'running',
    });

    const results = service.getSessionResults(session.sessionId);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('running');
  });

  it('records agent completion and synthesizes', () => {
    const session = service.createSession('thread_test' as any, 'Test goal', 'parallel');
    service.registerAgents(session.sessionId, [
      {
        agentId: 'agent_1',
        displayName: 'Claude',
        provider: 'claude',
        role: 'backend',
        kind: 'visible_cli',
        prompt: 'implement auth',
        capabilities: ['complex-reasoning'],
      },
    ]);

    service.recordAgentStart(session.sessionId, 'agent_1', {
      agentId: 'agent_1',
      displayName: 'Claude',
      role: 'backend',
      status: 'running',
    });

    service.recordAgentResult(session.sessionId, 'agent_1', {
      agentId: 'agent_1',
      displayName: 'Claude',
      role: 'backend',
      status: 'completed',
      summary: 'Implemented JWT authentication with bcrypt password hashing',
      output: 'Created auth/middleware.ts, auth/routes.ts',
      changedFiles: ['auth/middleware.ts', 'auth/routes.ts'],
    });

    const updated = service.getSession(session.sessionId);
    expect(updated!.status).toBe('completed');
    expect(updated!.synthesis).toBeDefined();
    expect(updated!.synthesis!.summary).toContain('Claude');
  });

  it('handles partial completion', () => {
    const session = service.createSession('thread_test' as any, 'Test goal', 'parallel');
    service.registerAgents(session.sessionId, [
      {
        agentId: 'agent_1',
        displayName: 'Claude',
        provider: 'claude',
        role: 'backend',
        kind: 'visible_cli',
        prompt: 'implement auth',
        capabilities: ['complex-reasoning'],
      },
      {
        agentId: 'agent_2',
        displayName: 'Codex',
        provider: 'codex',
        role: 'frontend',
        kind: 'visible_cli',
        prompt: 'implement UI',
        capabilities: ['fast-boilerplate'],
      },
    ]);

    service.recordAgentStart(session.sessionId, 'agent_1', {
      agentId: 'agent_1',
      displayName: 'Claude',
      role: 'backend',
      status: 'running',
    });

    service.recordAgentResult(session.sessionId, 'agent_1', {
      agentId: 'agent_1',
      displayName: 'Claude',
      role: 'backend',
      status: 'failed',
      error: 'Build failed',
    });

    const updated = service.getSession(session.sessionId);
    expect(updated!.status).toBe('partial');
  });

  it('appends synthesis message to thread', () => {
    const session = service.createSession('thread_test' as any, 'Test goal', 'parallel');
    service.registerAgents(session.sessionId, [
      {
        agentId: 'agent_1',
        displayName: 'Claude',
        provider: 'claude',
        role: 'backend',
        kind: 'visible_cli',
        prompt: 'implement auth',
        capabilities: ['complex-reasoning'],
      },
    ]);

    service.recordAgentResult(session.sessionId, 'agent_1', {
      agentId: 'agent_1',
      displayName: 'Claude',
      role: 'backend',
      status: 'completed',
      summary: 'Implemented JWT auth',
    });

    const message = service.appendSynthesisMessage(session.sessionId);
    expect(message).toBeDefined();
    expect(message!.content).toContain('Unified Response');
  });

  it('disposes session', () => {
    const session = service.createSession('thread_test' as any, 'Test goal', 'parallel');
    service.disposeSession(session.sessionId);

    const found = service.getSession(session.sessionId);
    expect(found).toBeUndefined();
  });
});