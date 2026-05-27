/**
 * Peer Orchestration Layer
 *
 * Implements O1-O3 for multi-agent mesh coordination:
 * - O1: Peer Orchestration Wiring - integrate PeerProtocolService into agent lifecycle
 * - O2: Agent Profile Discovery + Task Assignment - match tasks to agent capabilities
 * - O3: Task Division + Parallel Lanes - extract and assign independent parallel lanes
 */

import type { Database } from 'better-sqlite3';
import type { MeshAgentKind, MeshAgentStatus, ThreadId } from '@doorway/protocol';
import { PeerProtocolService, type PeerInfo } from './peer-protocol.js';

// ============================================================================
// Agent Profile Types
// ============================================================================

/**
 * Capability tags that define what an agent can do well.
 * Used for task-to-agent matching in O2.
 */
export type AgentCapabilityTag =
  | 'fast-boilerplate' // Codex-style: quick scaffolding, repetitive tasks
  | 'complex-reasoning' // Claude-style: deep analysis, architecture design
  | 'code-review' // Security, style, correctness focus
  | 'testing' // Test writing, verification
  | 'refactoring' // Code improvement, debt reduction
  | 'documentation' // Docs, comments, READMEs
  | 'debugging' // Investigation, problem solving
  | 'browser-automation'; // Web interactions, Playwright

/**
 * Agent profile with discovered capabilities and metadata.
 * Populated during agent registration and updated based on performance.
 */
export interface AgentProfile {
  readonly agentId: string;
  readonly displayName: string;
  readonly kind: MeshAgentKind;
  readonly provider: string;
  readonly role: string;
  readonly capabilities: readonly AgentCapabilityTag[];
  readonly strengthScore: number; // 0-100, historical success rate
  readonly taskCount: number; // Total tasks assigned
  readonly successCount: number; // Successful completions
  readonly averageDurationMs: number; // For workload estimation
  readonly lastSeen: Date;
}

/**
 * Result of matching a task to an agent profile.
 */
export interface TaskAssignment {
  readonly agentProfile: AgentProfile;
  readonly taskId: string;
  readonly taskLane: TaskLane;
  readonly confidence: number; // 0-1, match quality
  readonly reasoning: string;
}

/**
 * A task lane represents a unit of work that can run independently.
 * Lanes are extracted from a parent task for parallel execution (O3).
 */
export interface TaskLane {
  readonly laneId: string;
  readonly parentTaskId: string;
  readonly description: string;
  readonly capabilities: readonly AgentCapabilityTag[]; // Required for matching
  readonly estimatedComplexity: 'low' | 'medium' | 'high';
  readonly parentLinks: readonly string[]; // IDs of parent lanes
  readonly dependsOn: readonly string[]; // Lane IDs this depends on
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

/**
 * A synthesis card tracks completion of parallel lanes and synthesizes results.
 * Follows the fan-in pattern from the kanban orchestrator skill.
 */
export interface SynthesisCard {
  readonly synthesisId: string;
  readonly parentTaskId: string;
  readonly childLaneIds: readonly string[];
  readonly status: 'waiting' | 'synthesizing' | 'completed' | 'blocked';
  readonly blockedReason?: string;
  readonly result?: SynthesisResult;
  readonly createdAt: Date;
  readonly completedAt?: Date;
}

export interface SynthesisResult {
  readonly summary: string;
  readonly synthesizedFiles: readonly string[];
  readonly decisions: readonly string[];
  readonly remainingRisks: readonly string[];
  readonly nextSteps: readonly string[];
}

// ============================================================================
// Agent Profile Registry
// ============================================================================

/**
 * Discovers and maintains agent profiles based on registration and performance.
 * Provides task-to-agent matching for O2.
 */
export class AgentProfileRegistry {
  private profiles: Map<string, AgentProfile> = new Map();

  constructor(private db: Database) {}

  /**
   * Register a new agent and create its profile.
   */
  registerAgent(input: {
    agentId: string;
    displayName: string;
    kind: MeshAgentKind;
    provider: string;
    role: string;
  }): AgentProfile {
    const profile: AgentProfile = {
      agentId: input.agentId,
      displayName: input.displayName,
      kind: input.kind,
      provider: input.provider,
      role: input.role,
      capabilities: this.inferCapabilities(input.kind, input.provider, input.role),
      strengthScore: 50, // Start at neutral
      taskCount: 0,
      successCount: 0,
      averageDurationMs: 0,
      lastSeen: new Date(),
    };

    this.profiles.set(input.agentId, profile);
    return profile;
  }

  /**
   * Get a profile by agent ID.
   */
  getProfile(agentId: string): AgentProfile | undefined {
    return this.profiles.get(agentId);
  }

  /**
   * Get all registered profiles.
   */
  listProfiles(): readonly AgentProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get profiles filtered by capability.
   */
  findByCapability(capability: AgentCapabilityTag): readonly AgentProfile[] {
    return this.listProfiles().filter((p) => p.capabilities.includes(capability));
  }

  /**
   * Get profiles available for a thread (those that are running or waiting).
   */
  getAvailableProfiles(
    peerProtocol: PeerProtocolService,
    threadId: string,
    excludeAgentId?: string
  ): readonly AgentProfile[] {
    const runningPeers = peerProtocol.whoIsRunning(threadId, excludeAgentId);
    const runningIds = new Set<string>(runningPeers.map((p) => p.agentId));
    return this.listProfiles().filter((p) => runningIds.has(p.agentId));
  }

  /**
   * Update profile after task completion.
   */
  recordCompletion(
    agentId: string,
    success: boolean,
    durationMs: number,
    changedFiles: readonly string[]
  ): void {
    const profile = this.profiles.get(agentId);
    if (!profile) return;

    const newTaskCount = profile.taskCount + 1;
    const newSuccessCount = profile.successCount + (success ? 1 : 0);

    this.profiles.set(agentId, {
      ...profile,
      taskCount: newTaskCount,
      successCount: newSuccessCount,
      strengthScore: Math.round((newSuccessCount / newTaskCount) * 100),
      averageDurationMs:
        (profile.averageDurationMs * profile.taskCount + durationMs) / newTaskCount,
      lastSeen: new Date(),
    });
  }

  /**
   * Infer capabilities based on agent kind, provider, and role.
   */
  private inferCapabilities(
    kind: MeshAgentKind,
    provider: string,
    role: string
  ): readonly AgentCapabilityTag[] {
    const capabilities: AgentCapabilityTag[] = [];

    // Role-based capabilities
    if (role === 'reviewer') {
      capabilities.push('code-review', 'complex-reasoning');
    } else if (role === 'implementer') {
      capabilities.push('complex-reasoning');
    }

    // Provider-based inference
    const providerLower = provider.toLowerCase();
    if (providerLower.includes('codex') || providerLower.includes('openai')) {
      capabilities.push('fast-boilerplate', 'testing');
    } else if (providerLower.includes('claude') || providerLower.includes('anthropic')) {
      capabilities.push('complex-reasoning', 'documentation', 'refactoring');
    } else if (providerLower.includes('review')) {
      capabilities.push('code-review', 'debugging');
    } else if (providerLower.includes('browser')) {
      capabilities.push('browser-automation');
    }

    // Kind-based inference
    switch (kind) {
      case 'reviewer':
        capabilities.push('code-review');
        break;
      case 'browser_supervisor':
        capabilities.push('browser-automation');
        break;
      case 'pi_agent':
        capabilities.push('complex-reasoning', 'debugging');
        break;
      case 'visible_cli':
        capabilities.push('fast-boilerplate', 'testing');
        break;
    }

    // Deduplicate using Array.from
    return Array.from(new Set<string>(capabilities)) as unknown as readonly AgentCapabilityTag[];
  }
}

// ============================================================================
// Task Lane Extractor (O3)
// ============================================================================

/**
 * Extracts independent lanes from a task description.
 * Uses simple heuristics since V1 doesn't have full LLM decomposition.
 */
export class TaskLaneExtractor {
  constructor(private db: Database) {}

  /**
   * Extract independent lanes from a task goal.
   * Returns lanes that can run in parallel.
   */
  extractLanes(taskId: string, goal: string, mode: 'parallel' | 'sequential'): readonly TaskLane[] {
    if (mode === 'sequential') {
      return [this.createLane(taskId, goal, 'low', [])];
    }

    // For parallel mode, attempt to decompose into logical lanes
    const lanes = this.decomposeGoal(taskId, goal);
    return lanes.length > 0 ? lanes : [this.createLane(taskId, goal, 'medium', [])];
  }

  /**
   * Simple decomposition heuristic based on keywords.
   * V1 uses deterministic rules; Brain decomposition is a future enhancement.
   */
  private decomposeGoal(taskId: string, goal: string): readonly TaskLane[] {
    const goalLower = goal.toLowerCase();
    const lanes: TaskLane[] = [];

    // Check for test + implementation pattern
    if (
      (goalLower.includes('implement') ||
        goalLower.includes('add') ||
        goalLower.includes('create')) &&
      (goalLower.includes('test') || goalLower.includes('verify'))
    ) {
      lanes.push(
        this.createLane(taskId, `Implementation: ${goal}`, 'medium', ['complex-reasoning']),
        this.createLane(taskId, `Testing: ${goal}`, 'medium', ['testing', 'fast-boilerplate'])
      );
      return lanes;
    }

    // Check for review pattern
    if (goalLower.includes('review') || goalLower.includes('audit')) {
      lanes.push(this.createLane(taskId, `Review: ${goal}`, 'medium', ['code-review']));
      return lanes;
    }

    // Check for multiple file patterns (common in boilerplate tasks)
    const filePatterns = ['.tsx', '.ts', '.css', '.html', '.json'];
    const fileMentions = filePatterns.filter((ext) => {
      const regex = new RegExp(`${ext.replace('.', '\\.')}`, 'gi');
      return (goalLower.match(regex) || []).length > 1;
    });

    if (fileMentions.length >= 2) {
      // Split by file type
      const implLanes: string[] = [];
      const testLanes: string[] = [];

      for (const ext of fileMentions) {
        if (ext === '.test.ts' || ext === '.spec.ts') {
          testLanes.push(`Test file: ${ext}`);
        } else {
          implLanes.push(`Implementation file: ${ext}`);
        }
      }

      if (implLanes.length > 0) {
        lanes.push(this.createLane(taskId, implLanes.join(', '), 'medium', ['complex-reasoning']));
      }
      if (testLanes.length > 0) {
        lanes.push(this.createLane(taskId, testLanes.join(', '), 'low', ['testing']));
      }
    }

    return lanes;
  }

  private createLane(
    parentTaskId: string,
    description: string,
    complexity: 'low' | 'medium' | 'high',
    capabilities: readonly AgentCapabilityTag[]
  ): TaskLane {
    return {
      laneId: `lane_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      parentTaskId,
      description,
      capabilities,
      estimatedComplexity: complexity,
      parentLinks: [],
      dependsOn: [],
      metadata: {
        createdAt: Date.now(),
      },
    };
  }
}

// ============================================================================
// Task Assignment Engine (O2)
// ============================================================================

/**
 * Matches tasks to agent profiles based on capabilities and availability.
 * Implements Best-of-N with agent awareness: different tasks on different models.
 */
export class TaskAssignmentEngine {
  constructor(private registry: AgentProfileRegistry) {}

  /**
   * Assign a task lane to the best available agent.
   */
  assignLane(
    lane: TaskLane,
    availableProfiles: readonly AgentProfile[],
    peerProtocol: PeerProtocolService,
    threadId: string
  ): TaskAssignment | null {
    if (availableProfiles.length === 0) {
      return null;
    }

    // Score each profile for this lane
    const scored = availableProfiles.map((profile) => ({
      profile,
      score: this.scoreAssignment(lane, profile),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score.total - a.score.total);

    const best = scored[0];
    if (best.score.total === 0) {
      // No suitable agent found
      return null;
    }

    return {
      agentProfile: best.profile,
      taskId: lane.laneId,
      taskLane: lane,
      confidence: best.score.total / 100,
      reasoning: best.score.reasons.join('; '),
    };
  }

  /**
   * Assign multiple lanes to different agents (fan-out pattern).
   * Ensures no agent is assigned the same task twice.
   */
  assignLanes(
    lanes: readonly TaskLane[],
    availableProfiles: readonly AgentProfile[],
    peerProtocol: PeerProtocolService,
    threadId: string
  ): readonly TaskAssignment[] {
    const assignments: TaskAssignment[] = [];
    const usedAgents = new Set<string>();
    const remainingLanes = Array.from(lanes);

    // Sort lanes by complexity (high first) to assign best agents first
    remainingLanes.sort((a, b) => {
      const complexityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return complexityOrder[a.estimatedComplexity] - complexityOrder[b.estimatedComplexity];
    });

    for (const lane of remainingLanes) {
      // Filter out already-used agents
      const eligibleProfiles = availableProfiles.filter((p) => !usedAgents.has(p.agentId));

      const assignment = this.assignLane(lane, eligibleProfiles, peerProtocol, threadId);
      if (assignment) {
        assignments.push(assignment);
        usedAgents.add(assignment.agentProfile.agentId);
      }
    }

    return assignments;
  }

  /**
   * Create a synthesis card for coordinating lane results (fan-in pattern).
   */
  createSynthesisCard(parentTaskId: string, childLaneIds: readonly string[]): SynthesisCard {
    return {
      synthesisId: `synth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      parentTaskId,
      childLaneIds,
      status: 'waiting',
      createdAt: new Date(),
    };
  }

  private scoreAssignment(
    lane: TaskLane,
    profile: AgentProfile
  ): { total: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Capability match (primary factor)
    const capabilityMatches = lane.capabilities.filter((cap) =>
      profile.capabilities.includes(cap)
    ).length;

    if (capabilityMatches > 0) {
      const matchRatio = capabilityMatches / Math.max(lane.capabilities.length, 1);
      score += matchRatio * 50;
      reasons.push(`${capabilityMatches}/${lane.capabilities.length} capabilities matched`);
    }

    // Strength score (secondary factor)
    score += profile.strengthScore * 0.3;
    if (profile.strengthScore >= 70) {
      reasons.push(`High success rate (${profile.strengthScore}%)`);
    }

    // Workload (prefer agents with lower task counts if similar strength)
    const allProfiles = this.registry.listProfiles();
    const maxTasks = Math.max(...allProfiles.map((p) => p.taskCount), 1);
    const workloadScore = 1 - profile.taskCount / maxTasks;
    score += workloadScore * 20;

    return { total: Math.min(100, score), reasons };
  }
}

// ============================================================================
// Peer Orchestration Service (O1)
// ============================================================================

/**
 * Main service integrating peer protocol into orchestrator lifecycle.
 * Implements O1: Peer Orchestration Wiring.
 */
export class PeerOrchestrationService {
  private registry: AgentProfileRegistry;
  private extractor: TaskLaneExtractor;
  private assignmentEngine: TaskAssignmentEngine;
  private synthesisCards: Map<string, SynthesisCard> = new Map();
  private activeLanes: Map<string, TaskLane> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Heartbeat interval in milliseconds (every 2 minutes)
  private static readonly HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

  constructor(
    private db: Database,
    private peerProtocol: PeerProtocolService
  ) {
    this.registry = new AgentProfileRegistry(db);
    this.extractor = new TaskLaneExtractor(db);
    this.assignmentEngine = new TaskAssignmentEngine(this.registry);
  }

  // --------------------------------------------------------------------------
  // O1: Peer Orchestration Wiring
  // --------------------------------------------------------------------------

  // Mapping from caller's agent ID to mesh agent ID
  private agentIdMap: Map<string, string> = new Map();

  /**
   * Called when an agent starts - register peer with mesh.
   * Returns the registered mesh agent ID.
   */
  onAgentStart(input: {
    agentId: string;
    threadId: string;
    displayName: string;
    kind: MeshAgentKind;
    provider: string;
    role: string;
    currentTask?: string;
  }): string {
    if (this.tryStartExistingAgent(input)) {
      return input.agentId;
    }

    // Register with peer protocol
    const meshAgent = this.peerProtocol.registerPeer({
      threadId: input.threadId,
      displayName: input.displayName,
      kind: input.kind,
      toolName: input.provider,
      role: input.role,
    });

    // Map caller's agent ID to mesh agent ID
    this.agentIdMap.set(input.agentId, meshAgent.id);

    // Create agent profile
    this.registry.registerAgent({
      agentId: meshAgent.id,
      displayName: input.displayName,
      kind: input.kind,
      provider: input.provider,
      role: input.role,
    });

    // Update peer status to running
    this.peerProtocol.updatePeerStatus(meshAgent.id, 'running', {
      currentTask: input.currentTask,
      progress: 0,
    });

    // Start heartbeat for long-running tasks
    this.startHeartbeat(meshAgent.id, input.threadId);

    // Check if this unblocks any synthesis cards
    this.checkSynthesisUnblock(input.threadId);

    return meshAgent.id;
  }

  private tryStartExistingAgent(input: {
    agentId: string;
    threadId: string;
    displayName: string;
    kind: MeshAgentKind;
    provider: string;
    role: string;
    currentTask?: string;
  }): boolean {
    try {
      this.agentIdMap.set(input.agentId, input.agentId);
      this.registry.registerAgent({
        agentId: input.agentId,
        displayName: input.displayName,
        kind: input.kind,
        provider: input.provider,
        role: input.role,
      });
      this.peerProtocol.updatePeerStatus(input.agentId, 'running', {
        currentTask: input.currentTask,
        progress: 0,
      });
      this.startHeartbeat(input.agentId, input.threadId);
      this.checkSynthesisUnblock(input.threadId);
      return true;
    } catch {
      this.agentIdMap.delete(input.agentId);
      return false;
    }
  }

  /**
   * Get the mesh agent ID for a caller's agent ID.
   */
  getMeshAgentId(callerAgentId: string): string | undefined {
    return this.agentIdMap.get(callerAgentId);
  }

  /**
   * Called when agent status changes - update peer status.
   */
  onAgentStatusChange(
    agentId: string,
    status: MeshAgentStatus,
    metadata?: {
      currentTask?: string;
      blocker?: string;
      progress?: number;
    }
  ): void {
    const meshAgentId = this.agentIdMap.get(agentId);
    if (!meshAgentId) return;

    this.peerProtocol.updatePeerStatus(meshAgentId, status, metadata);
  }

  /**
   * Called when agent completes successfully.
   */
  onAgentCompletion(input: {
    agentId: string;
    threadId: string;
    summary: string;
    changedFiles?: readonly string[];
    durationMs?: number;
  }): void {
    const meshAgentId = this.agentIdMap.get(input.agentId);
    if (!meshAgentId) return;

    const profile = this.registry.getProfile(meshAgentId);
    const durationMs = input.durationMs ?? 0;

    // Record completion in profile
    if (profile) {
      this.registry.recordCompletion(meshAgentId, true, durationMs, input.changedFiles ?? []);
    }

    // Emit completion to mesh
    this.peerProtocol.emitCompletion({
      agentId: meshAgentId,
      threadId: input.threadId,
      summary: input.summary,
      changedFiles: input.changedFiles,
    });

    // Update status
    this.peerProtocol.updatePeerStatus(meshAgentId, 'done');

    // Stop heartbeat
    this.stopHeartbeat(meshAgentId);

    // Check synthesis cards
    this.checkSynthesisCompletion(meshAgentId, input.threadId);
  }

  /**
   * Called when agent fails or is blocked.
   */
  onAgentBlocker(input: {
    agentId: string;
    threadId: string;
    reason: string;
    blockingAgentId?: string;
  }): void {
    const meshAgentId = this.agentIdMap.get(input.agentId);
    if (!meshAgentId) return;

    const profile = this.registry.getProfile(meshAgentId);

    // Record failure in profile
    if (profile) {
      this.registry.recordCompletion(meshAgentId, false, 0, []);
    }

    // Emit blocker to mesh
    this.peerProtocol.emitBlocker({
      agentId: meshAgentId,
      threadId: input.threadId,
      reason: input.reason,
      blockingAgentId: input.blockingAgentId,
    });

    // Update status
    this.peerProtocol.updatePeerStatus(meshAgentId, 'blocked', {
      blocker: input.reason,
    });

    // Stop heartbeat
    this.stopHeartbeat(meshAgentId);
  }

  whoIsRunning(threadId: string, excludeAgentId?: string): readonly PeerInfo[] {
    const resolvedExclude = excludeAgentId
      ? (this.agentIdMap.get(excludeAgentId) ?? excludeAgentId)
      : undefined;
    const peers = this.peerProtocol.whoIsRunning(threadId, resolvedExclude);
    return peers.map((peer) => {
      let callerId = peer.agentId;
      for (const [cId, mId] of this.agentIdMap.entries()) {
        if (mId === peer.agentId) {
          callerId = cId;
          break;
        }
      }
      return {
        ...peer,
        agentId: callerId,
      };
    });
  }

  // --------------------------------------------------------------------------
  // O2: Agent Profile Discovery + Task Assignment
  // --------------------------------------------------------------------------

  discoverAgents(threadId: string): readonly AgentProfile[] {
    const runningPeers = this.whoIsRunning(threadId);
    return runningPeers
      .map((peer) => {
        const meshId = this.agentIdMap.get(peer.agentId) ?? peer.agentId;
        const profile = this.registry.getProfile(meshId);
        if (!profile) return undefined;
        return {
          ...profile,
          agentId: peer.agentId,
        };
      })
      .filter((p): p is AgentProfile => p !== undefined);
  }

  /**
   * Find agents matching specific capabilities.
   */
  findAgentsByCapability(
    _threadId: string,
    capability: AgentCapabilityTag
  ): readonly AgentProfile[] {
    return this.registry.findByCapability(capability);
  }

  /**
   * Assign a task to an agent based on capabilities.
   */
  assignTask(lane: TaskLane, threadId: string, excludeAgentId?: string): TaskAssignment | null {
    const available = this.discoverAgents(threadId).filter((p) => p.agentId !== excludeAgentId);

    if (available.length === 0) {
      return null;
    }

    return this.assignmentEngine.assignLane(lane, available, this.peerProtocol, threadId);
  }

  /**
   * Get agent registry for external inspection.
   */
  getRegistry(): AgentProfileRegistry {
    return this.registry;
  }

  // --------------------------------------------------------------------------
  // O3: Task Division + Parallel Lanes
  // --------------------------------------------------------------------------

  /**
   * Extract independent lanes from a task.
   */
  extractParallelLanes(
    taskId: string,
    goal: string,
    mode: 'parallel' | 'sequential'
  ): readonly TaskLane[] {
    const lanes = this.extractor.extractLanes(taskId, goal, mode);

    // Track active lanes
    for (const lane of lanes) {
      this.activeLanes.set(lane.laneId, lane);
    }

    return lanes;
  }

  /**
   * Assign all lanes to available agents (fan-out).
   */
  assignParallelLanes(lanes: readonly TaskLane[], threadId: string): readonly TaskAssignment[] {
    const available = this.discoverAgents(threadId);
    return this.assignmentEngine.assignLanes(lanes, available, this.peerProtocol, threadId);
  }

  /**
   * Create a synthesis card for coordinating lane results (fan-in).
   */
  createSynthesisCard(parentTaskId: string, childLaneIds: readonly string[]): SynthesisCard {
    const card = this.assignmentEngine.createSynthesisCard(parentTaskId, childLaneIds);
    this.synthesisCards.set(card.synthesisId, card);
    return card;
  }

  /**
   * Get synthesis card status.
   */
  getSynthesisCard(synthesisId: string): SynthesisCard | undefined {
    return this.synthesisCards.get(synthesisId);
  }

  /**
   * Update synthesis card with result.
   */
  completeSynthesisCard(synthesisId: string, result: SynthesisResult): void {
    const card = this.synthesisCards.get(synthesisId);
    if (!card) return;

    this.synthesisCards.set(synthesisId, {
      ...card,
      status: 'completed',
      result,
      completedAt: new Date(),
    });
  }

  /**
   * Check if synthesis card is blocked (not all lanes complete).
   */
  private checkSynthesisUnblock(threadId: string): void {
    const cards = Array.from(this.synthesisCards.values());
    for (const card of cards) {
      if (card.status !== 'waiting') continue;

      // Check if any blocking agents have completed
      const runningAgents = this.whoIsRunning(threadId);
      const hasBlocker = runningAgents.some(
        (peer) => peer.peerStatus === 'running' || peer.peerStatus === 'waiting'
      );

      if (!hasBlocker && card.childLaneIds.length > 0) {
        // All agents done, can synthesize
        this.synthesisCards.set(card.synthesisId, {
          ...card,
          status: 'synthesizing',
        });
      }
    }
  }

  /**
   * Check if a lane completion triggers synthesis.
   */
  private checkSynthesisCompletion(_agentId: string, threadId: string): void {
    // Find synthesis cards that have this agent's lane
    const cards = Array.from(this.synthesisCards.values());
    for (const card of cards) {
      if (card.status !== 'waiting' && card.status !== 'synthesizing') continue;

      // Check if all child lanes are complete
      const allComplete = card.childLaneIds.every((laneId) => {
        return !this.activeLanes.has(laneId); // Lane is complete if not in active map
      });

      if (allComplete) {
        this.synthesisCards.set(card.synthesisId, {
          ...card,
          status: 'synthesizing',
        });
      }
    }

    // Check for unblock
    this.checkSynthesisUnblock(threadId);
  }

  // --------------------------------------------------------------------------
  // Heartbeat
  // --------------------------------------------------------------------------

  private startHeartbeat(agentId: string, threadId: string): void {
    // Don't start duplicate heartbeat
    if (this.heartbeatIntervals.has(agentId)) {
      return;
    }

    const interval = setInterval(() => {
      const profile = this.registry.getProfile(agentId);
      if (!profile) {
        this.stopHeartbeat(agentId);
        return;
      }

      // Update peer status to show still alive
      const runningPeers = this.whoIsRunning(threadId);
      const isStillRunning = runningPeers.some((p) => p.agentId === agentId);

      if (!isStillRunning) {
        this.stopHeartbeat(agentId);
      }
    }, PeerOrchestrationService.HEARTBEAT_INTERVAL_MS);

    this.heartbeatIntervals.set(agentId, interval);
  }

  private stopHeartbeat(agentId: string): void {
    const interval = this.heartbeatIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(agentId);
    }
  }

  /**
   * Clean up all heartbeats (call on shutdown).
   */
  dispose(): void {
    const intervals = Array.from(this.heartbeatIntervals.values());
    for (const interval of intervals) {
      clearInterval(interval);
    }
    this.heartbeatIntervals.clear();
    this.synthesisCards.clear();
    this.activeLanes.clear();
    this.agentIdMap.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPeerOrchestration(
  db: Database,
  peerProtocol: PeerProtocolService
): PeerOrchestrationService {
  return new PeerOrchestrationService(db, peerProtocol);
}
