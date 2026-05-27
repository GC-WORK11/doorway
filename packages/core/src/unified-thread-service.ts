/**
 * Unified Thread Service
 *
 * Implements the Unified Thread feature (Feature 3 from SPEC.md):
 * - Multi-Agent Thread: Claude, Codex, and custom agents in ONE thread
 * - Agent Orchestration: Parallel execution with unified output
 * - Thread Synthesis: Merging multiple agent outputs into coherent response
 *
 * This service builds on top of:
 * - PeerOrchestrationService: For agent profiles and synthesis coordination
 * - PeerProtocolService: For peer-to-peer agent communication
 * - EventService: For event sourcing and state reconstruction
 */

import type Database from 'better-sqlite3';
import type {
  ThreadId,
  AgentRunId,
  TaskId,
  WorktreeId,
  TerminalSessionId,
  AgentRole,
  MeshAgentKind,
  DoorwayMessage,
  MessageRole,
} from '@doorway/protocol';
import { generateId, toISOString } from './id-gen.js';
import { recordEvent } from './event-service.js';
import { ValidationError, NotFoundError } from './errors.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent specification for unified thread launch.
 * Describes an agent to be launched as part of a unified thread.
 */
export interface UnifiedThreadAgentSpec {
  readonly agentId: string;
  readonly displayName: string;
  readonly provider: string;
  readonly role: AgentRole;
  readonly kind: MeshAgentKind;
  readonly prompt: string;
  readonly capabilities: readonly string[];
  readonly worktreePath?: string;
}

/**
 * Result from a single agent in a unified thread.
 */
export interface UnifiedThreadAgentResult {
  readonly agentId: string;
  readonly displayName: string;
  readonly role: AgentRole;
  readonly status: 'running' | 'completed' | 'failed' | 'blocked';
  readonly output?: string;
  readonly summary?: string;
  readonly changedFiles?: readonly string[];
  readonly exitCode?: number;
  readonly durationMs?: number;
  readonly error?: string;
}

/**
 * Unified thread launch request.
 */
export interface UnifiedThreadLaunchRequest {
  readonly threadId: ThreadId;
  readonly goal: string;
  readonly agents: readonly UnifiedThreadAgentSpec[];
  readonly mode: 'parallel' | 'sequential';
}

/**
 * Unified thread session tracking state.
 */
export interface UnifiedThreadSession {
  readonly sessionId: string;
  readonly threadId: ThreadId;
  readonly goal: string;
  readonly mode: 'parallel' | 'sequential';
  readonly agentCount: number;
  readonly status: UnifiedThreadStatus;
  readonly createdAt: Date;
  readonly completedAt?: Date;
  readonly results: readonly UnifiedThreadAgentResult[];
  readonly synthesis?: UnifiedThreadSynthesis;
}

/**
 * Status of a unified thread session.
 */
export type UnifiedThreadStatus =
  | 'launching'
  | 'running'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'partial';

/**
 * Synthesized result from multiple agent outputs.
 */
export interface UnifiedThreadSynthesis {
  readonly summary: string;
  readonly unifiedResponse: string;
  readonly decisions: readonly string[];
  readonly remainingRisks: readonly string[];
  readonly nextSteps: readonly string[];
  readonly agentContributions: readonly AgentContribution[];
  readonly createdAt: Date;
}

/**
 * How each agent contributed to the unified result.
 */
export interface AgentContribution {
  readonly agentId: string;
  readonly displayName: string;
  readonly role: AgentRole;
  readonly summary: string;
  readonly keyOutputs: readonly string[];
  readonly filesChanged: readonly string[];
}

/**
 * Parsed directive from user input to launch multiple agents.
 * e.g., "@claude @codex implement auth" -> [claudeSpec, codexSpec]
 */
export interface ParsedMultiAgentDirective {
  readonly rawInput: string;
  readonly goal: string;
  readonly agentTargets: readonly AgentTarget[];
}

/**
 * A single agent target parsed from directive.
 */
export interface AgentTarget {
  readonly provider: string;
  readonly task: string;
  readonly role: AgentRole;
}

// ============================================================================
// Multi-Agent Directive Parser
// ============================================================================

/**
 * Parse a multi-agent directive string into agent targets.
 * Supports formats like:
 * - "@claude implement auth" -> targets Claude for "implement auth"
 * - "@claude @codex implement auth" -> targets both for the same task
 * - "@claude:backend @codex:frontend implement login" -> targets with specific roles
 */
export function parseMultiAgentDirective(
  input: string
): ParsedMultiAgentDirective | null {
  // Match @provider patterns at the start
  const agentPattern = /@(\w+)(?::(\w+))?/g;
  const targets: AgentTarget[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let extractedGoal = input;

  while ((match = agentPattern.exec(input)) !== null) {
    const provider = match[1].toLowerCase();
    const roleOverride = match[2]?.toLowerCase() as AgentRole | undefined;

    // Determine role based on provider and optional override
    const role = roleOverride ?? inferRoleFromProvider(provider);

    targets.push({
      provider,
      task: '', // Task will be extracted from remaining input
      role,
    });

    // Track where the directive ends
    lastIndex = match.index + match[0].length;
  }

  if (targets.length === 0) {
    return null;
  }

  // Extract the goal/task from remaining text after all @mentions
  const remainingText = input.slice(lastIndex).trim();

  // If no remaining text, use the whole input minus mentions as goal
  if (!remainingText) {
    // Remove all @mentions to get the goal
    extractedGoal = input.replace(/@\w+(?::\w+)?/g, '').trim();
  } else {
    extractedGoal = remainingText;
  }

  // Update tasks with the goal
  const goal = extractedGoal || 'Process and coordinate task';
  for (const target of targets) {
    (target as AgentTarget & { task: string }).task = goal;
  }

  return {
    rawInput: input,
    goal,
    agentTargets: targets,
  };
}

/**
 * Infer agent role from provider name.
 */
function inferRoleFromProvider(provider: string): AgentRole {
  const p = provider.toLowerCase();
  if (p.includes('review')) return 'reviewer';
  if (p.includes('test')) return 'tester';
  if (p.includes('frontend') || p.includes('ui')) return 'frontend';
  if (p.includes('backend') || p.includes('api')) return 'backend';
  if (p.includes('debug')) return 'debugger';
  return 'custom';
}

/**
 * Get the mesh agent kind from provider name.
 */
export function meshAgentKindFromProvider(provider: string): MeshAgentKind {
  const p = provider.toLowerCase();
  if (p.includes('review')) return 'reviewer';
  if (p.includes('pi')) return 'pi_agent';
  if (p.includes('browser')) return 'browser_supervisor';
  if (p.includes('doorway') || p.includes('brain')) return 'doorway_brain';
  return 'visible_cli';
}

// ============================================================================
// Unified Thread Service
// ============================================================================

/**
 * Service for managing unified threads with multiple agents.
 * Coordinates parallel agent execution and synthesizes results.
 */
export class UnifiedThreadService {
  private sessions: Map<string, UnifiedThreadSession> = new Map();
  private agentResults: Map<string, UnifiedThreadAgentResult[]> = new Map();
  private pendingLaunches: Map<string, Set<string>> = new Map();

  constructor(private db: Database.Database) {}

  /**
   * Create a new unified thread session.
   */
  createSession(
    threadId: ThreadId,
    goal: string,
    mode: 'parallel' | 'sequential' = 'parallel'
  ): UnifiedThreadSession {
    const sessionId = generateId('ut_session') as string;

    const session: UnifiedThreadSession = {
      sessionId,
      threadId,
      goal,
      mode,
      agentCount: 0,
      status: 'launching',
      createdAt: new Date(),
      results: [],
    };

    this.sessions.set(sessionId, session);
    this.agentResults.set(sessionId, []);
    this.pendingLaunches.set(sessionId, new Set());

    recordEvent(this.db, threadId, 'unified_thread.session_created', {
      sessionId,
      threadId,
      goal,
      mode,
    });

    return session;
  }

  /**
   * Register agents for a unified thread session.
   */
  registerAgents(
    sessionId: string,
    agents: readonly UnifiedThreadAgentSpec[]
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError('UnifiedThreadSession', sessionId);
    }

    const pending = this.pendingLaunches.get(sessionId);
    if (!pending) {
      throw new ValidationError('Session is not properly initialized');
    }

    for (const agent of agents) {
      pending.add(agent.agentId);
    }

    // Update session with agent count
    this.sessions.set(sessionId, {
      ...session,
      agentCount: pending.size,
      status: pending.size > 0 ? 'launching' : session.status,
    });

    recordEvent(this.db, session.threadId, 'unified_thread.agents_registered', {
      sessionId,
      agentIds: agents.map((a) => a.agentId),
      agentCount: agents.length,
    });
  }

  /**
   * Record that an agent has started execution.
   */
  recordAgentStart(
    sessionId: string,
    agentId: string,
    agentResult: UnifiedThreadAgentResult
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError('UnifiedThreadSession', sessionId);
    }

    const pending = this.pendingLaunches.get(sessionId);
    if (pending) {
      pending.delete(agentId);
    }

    const results = this.agentResults.get(sessionId) ?? [];
    results.push(agentResult);
    this.agentResults.set(sessionId, results);

    // Update session status if all agents are running
    const allRunning = pending !== undefined && pending.size === 0;
    if (allRunning) {
      this.sessions.set(sessionId, {
        ...session,
        status: 'running',
        results,
      });
    }

    recordEvent(this.db, session.threadId, 'unified_thread.agent_started', {
      sessionId,
      agentId,
      displayName: agentResult.displayName,
    });
  }

  /**
   * Record an agent completion result.
   */
  recordAgentResult(
    sessionId: string,
    agentId: string,
    result: Partial<UnifiedThreadAgentResult>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError('UnifiedThreadSession', sessionId);
    }

    const results = this.agentResults.get(sessionId) ?? [];
    const existingIndex = results.findIndex((r) => r.agentId === agentId);

    const updatedResult: UnifiedThreadAgentResult = existingIndex >= 0
      ? { ...results[existingIndex], ...result }
      : {
          agentId,
          displayName: result.displayName ?? 'Unknown',
          role: result.role ?? 'custom',
          status: result.status ?? 'completed',
          ...result,
        };

    if (existingIndex >= 0) {
      results[existingIndex] = updatedResult;
    } else {
      results.push(updatedResult);
    }

    this.agentResults.set(sessionId, results);

    // Check if all agents are done and trigger synthesis
    const allDone = results.every(
      (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'blocked'
    );

    if (allDone) {
      const synthesis = this.synthesizeResults(sessionId);
      this.sessions.set(sessionId, {
        ...session,
        status: synthesis ? 'completed' : 'partial',
        results,
        synthesis,
        completedAt: new Date(),
      });

      recordEvent(this.db, session.threadId, 'unified_thread.completed', {
        sessionId,
        status: synthesis ? 'completed' : 'partial',
        synthesisCreated: !!synthesis,
      });
    } else {
      this.sessions.set(sessionId, {
        ...session,
        results,
      });
    }
  }

  /**
   * Get session by ID.
   */
  getSession(sessionId: string): UnifiedThreadSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session for a thread.
   */
  getSessionForThread(threadId: ThreadId): UnifiedThreadSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.threadId === threadId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Get results for a session.
   */
  getSessionResults(sessionId: string): readonly UnifiedThreadAgentResult[] {
    return this.agentResults.get(sessionId) ?? [];
  }

  /**
   * Get pending agent count for a session.
   */
  getPendingCount(sessionId: string): number {
    return this.pendingLaunches.get(sessionId)?.size ?? 0;
  }

  /**
   * Synthesize results from multiple agents into a unified response.
   */
  synthesizeResults(sessionId: string): UnifiedThreadSynthesis | undefined {
    const session = this.sessions.get(sessionId);
    const results = this.agentResults.get(sessionId) ?? [];

    if (results.length === 0) {
      return undefined;
    }

    const successfulResults = results.filter(
      (r) => r.status === 'completed' && r.summary
    );

    if (successfulResults.length === 0) {
      // No successful results to synthesize
      return undefined;
    }

    const decisions = this.extractDecisions(successfulResults);
    const remainingRisks = this.identifyRisks(successfulResults, results);
    const nextSteps = this.generateNextSteps(successfulResults, results);

    // Build unified response
    const unifiedResponse = this.buildUnifiedResponse(session.goal, successfulResults);

    // Build agent contributions
    const agentContributions: AgentContribution[] = successfulResults.map((r) => ({
      agentId: r.agentId,
      displayName: r.displayName,
      role: r.role,
      summary: r.summary ?? '',
      keyOutputs: r.output ? this.extractKeyOutputs(r.output) : [],
      filesChanged: r.changedFiles ?? [],
    }));

    const synthesis: UnifiedThreadSynthesis = {
      summary: this.generateSummary(session.goal, successfulResults),
      unifiedResponse,
      decisions,
      remainingRisks,
      nextSteps,
      agentContributions,
      createdAt: new Date(),
    };

    recordEvent(this.db, session.threadId, 'unified_thread.synthesis_created', {
      sessionId,
      summary: synthesis.summary,
      agentCount: successfulResults.length,
    });

    return synthesis;
  }

  /**
   * Extract key decisions made by agents.
   */
  private extractDecisions(results: readonly UnifiedThreadAgentResult[]): readonly string[] {
    const decisions: string[] = [];

    for (const result of results) {
      if (result.summary) {
        // Extract sentences that look like decisions
        const sentences = result.summary.split(/[.!?]+/).filter((s) => s.trim());
        for (const sentence of sentences) {
          const lower = sentence.toLowerCase();
          if (
            lower.includes('decided') ||
            lower.includes('chose') ||
            lower.includes('selected') ||
            lower.includes('opted') ||
            lower.includes('using') ||
            lower.includes('implemented')
          ) {
            const trimmed = sentence.trim();
            if (trimmed.length > 10 && trimmed.length < 200) {
              decisions.push(trimmed);
            }
          }
        }
      }
    }

    // Deduplicate
    return Array.from(new Set(decisions)).slice(0, 10);
  }

  /**
   * Identify potential risks from agent results.
   */
  private identifyRisks(
    successful: readonly UnifiedThreadAgentResult[],
    all: readonly UnifiedThreadAgentResult[]
  ): readonly string[] {
    const risks: string[] = [];

    // Check for failed agents
    const failed = all.filter((r) => r.status === 'failed');
    if (failed.length > 0) {
      risks.push(`${failed.length} agent(s) failed to complete: ${failed.map((f) => f.displayName).join(', ')}`);
    }

    // Check for blocked agents
    const blocked = all.filter((r) => r.status === 'blocked');
    if (blocked.length > 0) {
      risks.push(`${blocked.length} agent(s) were blocked: ${blocked.map((b) => b.displayName).join(', ')}`);
    }

    // Check for errors in outputs
    for (const result of successful) {
      if (result.output) {
        const errorPatterns = [
          /error:/i,
          /failed:/i,
          /warning:/i,
          /could not/i,
          /unable to/i,
        ];
        for (const pattern of errorPatterns) {
          if (pattern.test(result.output)) {
            risks.push(`Potential issue in ${result.displayName}: detected error pattern`);
            break;
          }
        }
      }
    }

    return Array.from(new Set(risks)).slice(0, 5);
  }

  /**
   * Generate next steps based on agent results.
   */
  private generateNextSteps(
    successful: readonly UnifiedThreadAgentResult[],
    all: readonly UnifiedThreadAgentResult[]
  ): readonly string[] {
    const nextSteps: string[] = [];

    // If any agent failed, suggest review
    const hasFailures = all.some((r) => r.status === 'failed');
    if (hasFailures) {
      nextSteps.push('Review failed agent outputs and address errors');
    }

    // Collect suggested next steps from agent summaries
    for (const result of successful) {
      if (result.summary) {
        const sentences = result.summary.split(/[.!?]+/).filter((s) => s.trim());
        for (const sentence of sentences) {
          const lower = sentence.toLowerCase();
          if (
            (lower.includes('next') && lower.includes('step')) ||
            lower.includes('should') ||
            lower.includes('need to') ||
            lower.includes('recommend')
          ) {
            const trimmed = sentence.trim();
            if (trimmed.length > 10 && trimmed.length < 150) {
              nextSteps.push(trimmed);
            }
          }
        }
      }
    }

    // If no next steps found, suggest testing
    if (nextSteps.length === 0 && successful.length > 0) {
      nextSteps.push('Test the implemented changes');
      nextSteps.push('Review code for any edge cases');
    }

    return Array.from(new Set(nextSteps)).slice(0, 5);
  }

  /**
   * Extract key outputs from agent output text.
   */
  private extractKeyOutputs(output: string): readonly string[] {
    const lines = output.split('\n').filter((l) => l.trim());
    const keyLines: string[] = [];

    // Look for significant lines (file changes, completions, summaries)
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes('created') ||
        lower.includes('modified') ||
        lower.includes('wrote') ||
        lower.includes('completed') ||
        lower.includes('finished')
      ) {
        keyLines.push(line.trim());
      }
    }

    return keyLines.slice(0, 10);
  }

  /**
   * Build a unified response from multiple agent results.
   */
  private buildUnifiedResponse(
    goal: string,
    results: readonly UnifiedThreadAgentResult[]
  ): string {
    if (results.length === 1) {
      return results[0].summary ?? results[0].output ?? 'Completed.';
    }

    const parts: string[] = [];
    parts.push(`## Unified Result for: ${goal}\n`);

    for (const result of results) {
      const prefix = result.role ? `[${result.role}]` : '';
      parts.push(`\n### ${prefix} ${result.displayName}:\n`);
      parts.push(result.summary ?? result.output ?? 'No output');
    }

    return parts.join('\n');
  }

  /**
   * Generate a summary of the unified thread execution.
   */
  private generateSummary(
    goal: string,
    results: readonly UnifiedThreadAgentResult[]
  ): string {
    const roles = results.map((r) => r.role);
    const uniqueRoles = Array.from(new Set(roles));
    const agentNames = results.map((r) => r.displayName).join(', ');

    return `Unified thread completed: ${uniqueRoles.join(', ')} agents (${agentNames}) worked on "${goal}"`;
  }

  /**
   * Append a synthesized message to the thread.
   */
  appendSynthesisMessage(
    sessionId: string,
    role: MessageRole = 'assistant'
  ): DoorwayMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || !session.synthesis) {
      return undefined;
    }

    const messageId = generateId('msg') as import('@doorway/protocol').MessageId;
    const now = toISOString(new Date());
    const content = this.formatSynthesisMessage(session.synthesis, session.goal);

    this.db.prepare(
      `
      INSERT INTO messages (id, thread_id, role, content, attachments, created_at)
      VALUES (?, ?, ?, ?, '[]', ?)
    `
    ).run(messageId, session.threadId, role, content, now);

    recordEvent(this.db, session.threadId, 'message.appended', {
      messageId,
      threadId: session.threadId,
      role,
      content,
    });

    return {
      id: messageId,
      threadId: session.threadId,
      role,
      content,
      attachments: [],
      createdAt: new Date(now),
    };
  }

  /**
   * Format synthesis for display in a message.
   */
  private formatSynthesisMessage(
    synthesis: UnifiedThreadSynthesis,
    goal: string
  ): string {
    const lines: string[] = [];
    lines.push(`## Unified Response\n`);
    lines.push(`**Goal:** ${goal}\n`);
    lines.push(`**Summary:** ${synthesis.summary}\n`);

    if (synthesis.decisions.length > 0) {
      lines.push(`\n### Key Decisions\n`);
      for (const decision of synthesis.decisions) {
        lines.push(`- ${decision}`);
      }
    }

    if (synthesis.nextSteps.length > 0) {
      lines.push(`\n### Next Steps\n`);
      for (const step of synthesis.nextSteps) {
        lines.push(`- ${step}`);
      }
    }

    if (synthesis.remainingRisks.length > 0) {
      lines.push(`\n### Potential Risks\n`);
      for (const risk of synthesis.remainingRisks) {
        lines.push(`- ${risk}`);
      }
    }

    lines.push(`\n### Agent Contributions\n`);
    for (const contrib of synthesis.agentContributions) {
      lines.push(`- **${contrib.displayName}** (${contrib.role}): ${contrib.summary}`);
      if (contrib.filesChanged.length > 0) {
        lines.push(`  - Files: ${contrib.filesChanged.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Clean up a session.
   */
  disposeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.agentResults.delete(sessionId);
    this.pendingLaunches.delete(sessionId);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createUnifiedThreadService(db: Database.Database): UnifiedThreadService {
  return new UnifiedThreadService(db);
}