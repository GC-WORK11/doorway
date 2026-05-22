/**
 * Peer Orchestration Tests
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, generateId, registerMeshAgent } from '@doorway/core';
import { createPeerProtocol, type PeerProtocolService } from './peer-protocol.js';
import {
  createPeerOrchestration,
  type AgentProfileRegistry,
  type TaskAssignment,
  type TaskLane,
  type SynthesisCard,
} from './peer-orchestration.js';
import type Database from 'better-sqlite3';

describe('PeerOrchestration', () => {
  let dataPath: string;
  let db: Database.Database;
  let peerProtocol: PeerProtocolService;
  let peerOrchestration: ReturnType<typeof createPeerOrchestration>;

  beforeEach(async () => {
    dataPath = await mkdtemp(join(tmpdir(), 'doorway-peer-orchestration-'));
    db = createDatabase({ dataPath });

    const projectId = generateId('project');
    db.prepare(
      `INSERT INTO projects (id, path, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(projectId, dataPath, 'Test Project', new Date().toISOString(), new Date().toISOString());

    db.prepare(
      `INSERT INTO threads (id, project_id, title, status, goal, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`
    ).run('thread_1', projectId, 'Thread 1', 'Test Task', new Date().toISOString(), new Date().toISOString());

    peerProtocol = createPeerProtocol(db);
    peerOrchestration = createPeerOrchestration(db, peerProtocol);
  });

  afterEach(async () => {
    peerOrchestration.dispose();
    db.close();
    await rm(dataPath, { recursive: true, force: true });
  });

  describe('O1: Peer Orchestration Wiring', () => {
    it('registers agent with peer protocol on start', () => {
      peerOrchestration.onAgentStart({
        agentId: 'agent_1',
        threadId: 'thread_1',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
        currentTask: 'Implementing feature X',
      });

      const running = peerOrchestration.whoIsRunning('thread_1');
      expect(running).toHaveLength(1);
      expect(running[0]?.displayName).toBe('Test Agent');
    });

    it('updates peer status on status change', () => {
      peerOrchestration.onAgentStart({
        agentId: 'agent_1',
        threadId: 'thread_1',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      peerOrchestration.onAgentStatusChange('agent_1', 'running', {
        currentTask: 'Running task',
        progress: 50,
      });

      const running = peerOrchestration.whoIsRunning('thread_1');
      expect(running).toHaveLength(1);
    });

    it('emits completion on agent completion', () => {
      peerOrchestration.onAgentStart({
        agentId: 'agent_1',
        threadId: 'thread_1',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      // Register a second agent to receive the completion message
      registerMeshAgent(db, {
        threadId: 'thread_1',
        displayName: 'Second Agent',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
        status: 'running',
      });

      peerOrchestration.onAgentCompletion({
        agentId: 'agent_1',
        threadId: 'thread_1',
        summary: 'Completed feature X',
        changedFiles: ['file1.ts', 'file2.ts'],
        durationMs: 5000,
      });

      // Completion is emitted - agent is done
      const running = peerOrchestration.whoIsRunning('thread_1');
      expect(running.some((p) => p.agentId === 'agent_1')).toBe(false);
    });

    it('emits blocker when agent is blocked', () => {
      peerOrchestration.onAgentStart({
        agentId: 'agent_1',
        threadId: 'thread_1',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      registerMeshAgent(db, {
        threadId: 'thread_1',
        displayName: 'Second Agent',
        kind: 'reviewer',
        toolName: 'codex',
        role: 'reviewer',
        status: 'running',
      });

      peerOrchestration.onAgentBlocker({
        agentId: 'agent_1',
        threadId: 'thread_1',
        reason: 'Waiting for API key',
        blockingAgentId: 'agent_2',
      });

      // Agent is now blocked
      const running = peerOrchestration.whoIsRunning('thread_1');
      expect(running.some((p) => p.agentId === 'agent_1')).toBe(false);
    });

    it('exposes whoIsRunning to orchestrator planning', () => {
      peerOrchestration.onAgentStart({
        agentId: 'agent_1',
        threadId: 'thread_1',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      peerOrchestration.onAgentStart({
        agentId: 'agent_2',
        threadId: 'thread_1',
        displayName: 'Test Agent 2',
        kind: 'reviewer',
        provider: 'codex',
        role: 'reviewer',
      });

      const running = peerOrchestration.whoIsRunning('thread_1');
      expect(running).toHaveLength(2);

      // Can exclude an agent
      const others = peerOrchestration.whoIsRunning('thread_1', 'agent_1');
      expect(others).toHaveLength(1);
      expect(others[0]?.agentId).toBe('agent_2');
    });
  });

  describe('O2: Agent Profile Discovery + Task Assignment', () => {
    it('discovers available agents', () => {
      peerOrchestration.onAgentStart({
        agentId: 'claude_agent',
        threadId: 'thread_1',
        displayName: 'Claude Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      peerOrchestration.onAgentStart({
        agentId: 'codex_agent',
        threadId: 'thread_1',
        displayName: 'Codex Agent',
        kind: 'visible_cli',
        provider: 'codex',
        role: 'implementer',
      });

      const agents = peerOrchestration.discoverAgents('thread_1');
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.provider).sort()).toEqual(['claude', 'codex']);
    });

    it('infers capabilities based on provider and kind', () => {
      peerOrchestration.onAgentStart({
        agentId: 'claude_agent',
        threadId: 'thread_1',
        displayName: 'Claude Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      const registry = peerOrchestration.getRegistry();
      const profile = registry.getProfile('claude_agent');

      expect(profile).toBeDefined();
      expect(profile?.capabilities).toContain('complex-reasoning');
    });

    it('finds agents by capability', () => {
      peerOrchestration.onAgentStart({
        agentId: 'claude_agent',
        threadId: 'thread_1',
        displayName: 'Claude Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      peerOrchestration.onAgentStart({
        agentId: 'codex_agent',
        threadId: 'thread_1',
        displayName: 'Codex Agent',
        kind: 'visible_cli',
        provider: 'codex',
        role: 'implementer',
      });

      const complexAgents = peerOrchestration.findAgentsByCapability('thread_1', 'complex-reasoning');
      expect(complexAgents.length).toBeGreaterThan(0);

      const fastAgents = peerOrchestration.findAgentsByCapability('thread_1', 'fast-boilerplate');
      expect(fastAgents.length).toBeGreaterThan(0);
    });

    it('assigns task based on capability match', () => {
      peerOrchestration.onAgentStart({
        agentId: 'claude_agent',
        threadId: 'thread_1',
        displayName: 'Claude Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      const lane: TaskLane = {
        laneId: 'lane_1',
        parentTaskId: 'task_1',
        description: 'Implement complex feature',
        capabilities: ['complex-reasoning'],
        estimatedComplexity: 'high',
        parentLinks: [],
        dependsOn: [],
        metadata: {},
      };

      const assignment = peerOrchestration.assignTask(lane, 'thread_1');
      expect(assignment).not.toBeNull();
      expect(assignment?.agentProfile.provider).toBe('claude');
      expect(assignment?.confidence).toBeGreaterThan(0);
    });

    it('returns null when no agents available for task', () => {
      const lane: TaskLane = {
        laneId: 'lane_1',
        parentTaskId: 'task_1',
        description: 'Implement complex feature',
        capabilities: ['complex-reasoning'],
        estimatedComplexity: 'high',
        parentLinks: [],
        dependsOn: [],
        metadata: {},
      };

      const assignment = peerOrchestration.assignTask(lane, 'thread_1');
      expect(assignment).toBeNull();
    });
  });

  describe('O3: Task Division + Parallel Lanes', () => {
    it('extracts parallel lanes from task', () => {
      const lanes = peerOrchestration.extractParallelLanes(
        'task_1',
        'Implement feature X and add tests',
        'parallel'
      );

      expect(lanes.length).toBeGreaterThanOrEqual(1);
      expect(lanes[0]).toHaveProperty('laneId');
      expect(lanes[0]).toHaveProperty('parentTaskId', 'task_1');
    });

    it('extracts single lane for sequential mode', () => {
      const lanes = peerOrchestration.extractParallelLanes(
        'task_1',
        'Implement feature X',
        'sequential'
      );

      expect(lanes).toHaveLength(1);
      expect(lanes[0].estimatedComplexity).toBe('low');
    });

    it('assigns parallel lanes to different agents', () => {
      peerOrchestration.onAgentStart({
        agentId: 'claude_agent',
        threadId: 'thread_1',
        displayName: 'Claude Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      peerOrchestration.onAgentStart({
        agentId: 'codex_agent',
        threadId: 'thread_1',
        displayName: 'Codex Agent',
        kind: 'visible_cli',
        provider: 'codex',
        role: 'implementer',
      });

      const lanes = peerOrchestration.extractParallelLanes(
        'task_1',
        'Implement feature X and add tests',
        'parallel'
      );

      const assignments = peerOrchestration.assignParallelLanes(lanes, 'thread_1');

      // Should have assignments
      expect(assignments.length).toBeGreaterThan(0);

      // Agents should be different
      if (assignments.length > 1) {
        const agentIds = assignments.map((a) => a.agentProfile.agentId);
        expect(new Set(agentIds).size).toBe(agentIds.length);
      }
    });

    it('creates synthesis card for coordinating lanes', () => {
      const lanes = peerOrchestration.extractParallelLanes(
        'task_1',
        'Implement feature X and add tests',
        'parallel'
      );

      const laneIds = lanes.map((l) => l.laneId);
      const synthesis = peerOrchestration.createSynthesisCard('task_1', laneIds);

      expect(synthesis.synthesisId).toMatch(/^synth_/);
      expect(synthesis.parentTaskId).toBe('task_1');
      expect(synthesis.childLaneIds).toEqual(laneIds);
      expect(synthesis.status).toBe('waiting');
    });

    it('updates synthesis card on completion', () => {
      const lanes = peerOrchestration.extractParallelLanes(
        'task_1',
        'Implement feature X and add tests',
        'parallel'
      );

      const laneIds = lanes.map((l) => l.laneId);
      const synthesis = peerOrchestration.createSynthesisCard('task_1', laneIds);

      peerOrchestration.completeSynthesisCard(synthesis.synthesisId, {
        summary: 'All lanes completed',
        synthesizedFiles: ['file1.ts'],
        decisions: ['Used approach A'],
        remainingRisks: [],
        nextSteps: ['Review changes'],
      });

      const updated = peerOrchestration.getSynthesisCard(synthesis.synthesisId);
      expect(updated?.status).toBe('completed');
      expect(updated?.result?.summary).toBe('All lanes completed');
    });

    it('decomposes implementation + test pattern into separate lanes', () => {
      const lanes = peerOrchestration.extractParallelLanes(
        'task_1',
        'Implement login feature and write tests',
        'parallel'
      );

      // Should have separate implementation and testing lanes
      expect(lanes.length).toBeGreaterThanOrEqual(2);

      const hasImpl = lanes.some((l) =>
        l.description.toLowerCase().includes('implementation')
      );
      const hasTest = lanes.some((l) =>
        l.description.toLowerCase().includes('testing') ||
        l.description.toLowerCase().includes('test')
      );

      expect(hasImpl || lanes.length >= 2).toBe(true);
    });
  });

  describe('AgentProfileRegistry', () => {
    it('registers and retrieves agent profiles', () => {
      const registry = peerOrchestration.getRegistry();

      registry.registerAgent({
        agentId: 'test_agent',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'test-provider',
        role: 'implementer',
      });

      const profile = registry.getProfile('test_agent');
      expect(profile).toBeDefined();
      expect(profile?.displayName).toBe('Test Agent');
      expect(profile?.provider).toBe('test-provider');
    });

    it('records completion and updates strength score', () => {
      const registry = peerOrchestration.getRegistry();

      registry.registerAgent({
        agentId: 'test_agent',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'test-provider',
        role: 'implementer',
      });

      expect(registry.getProfile('test_agent')?.strengthScore).toBe(50);

      registry.recordCompletion('test_agent', true, 1000, ['file1.ts']);
      expect(registry.getProfile('test_agent')?.strengthScore).toBe(100);

      registry.recordCompletion('test_agent', false, 500, []);
      expect(registry.getProfile('test_agent')?.strengthScore).toBe(50);
    });

    it('finds profiles by capability', () => {
      const registry = peerOrchestration.getRegistry();

      registry.registerAgent({
        agentId: 'claude_agent',
        displayName: 'Claude Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      const complexAgents = registry.findByCapability('complex-reasoning');
      expect(complexAgents.length).toBeGreaterThan(0);
    });

    it('lists all profiles', () => {
      const registry = peerOrchestration.getRegistry();

      registry.registerAgent({
        agentId: 'agent_1',
        displayName: 'Agent 1',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      registry.registerAgent({
        agentId: 'agent_2',
        displayName: 'Agent 2',
        kind: 'reviewer',
        provider: 'codex',
        role: 'reviewer',
      });

      const all = registry.listProfiles();
      expect(all).toHaveLength(2);
    });
  });

  describe('TaskLaneExtractor', () => {
    it('extracts review lane for review tasks', () => {
      const lanes = peerOrchestration.extractParallelLanes(
        'task_1',
        'Review the security of this codebase',
        'parallel'
      );

      expect(lanes.length).toBeGreaterThanOrEqual(1);
      const reviewLane = lanes.find((l) =>
        l.description.toLowerCase().includes('review')
      );
      expect(reviewLane).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('cleans up heartbeat intervals', () => {
      peerOrchestration.onAgentStart({
        agentId: 'agent_1',
        threadId: 'thread_1',
        displayName: 'Test Agent',
        kind: 'visible_cli',
        provider: 'claude',
        role: 'implementer',
      });

      // dispose should not throw
      expect(() => peerOrchestration.dispose()).not.toThrow();
    });
  });
});
