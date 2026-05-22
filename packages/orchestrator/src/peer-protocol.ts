/**
 * Peer Protocol
 * Agent awareness protocol for multi-agent mesh communication.
 * Agents register with mesh, query "who else is running?", emit status/blockers/completions.
 */

import type Database from 'better-sqlite3';
import { generateId, toISOString } from '@doorway/core';
import {
  listMeshAgents,
  registerMeshAgent,
  sendPeerMessage,
  pullPeerMessages,
  markPeerMessageHandled,
  listThreadPeerMessages,
  listMeshLoopMetrics,
  type RegisteredMeshAgent,
  type MeshMessage,
} from '@doorway/core';
import type { MeshAgentKind, MeshAgentStatus, MeshMessageKind } from '@doorway/protocol';

export type { MeshAgentKind, MeshAgentStatus, MeshMessageKind };

// ============================================================================
// Peer Status Types
// ============================================================================

export type PeerStatus = 'idle' | 'running' | 'waiting' | 'blocked' | 'completed' | 'failed';

export interface PeerInfo {
  readonly agentId: string;
  readonly threadId: string;
  readonly displayName: string;
  readonly kind: MeshAgentKind;
  readonly role: string;
  readonly status: MeshAgentStatus;
  readonly peerStatus: PeerStatus;
  readonly currentTask?: string;
  readonly blocker?: string;
  readonly progress?: number;
  readonly lastActivity: Date;
}

export interface PeerQuery {
  readonly threadId: string;
  readonly requestingAgentId: string;
  readonly queryType: 'who_is_running' | 'what_blocked_me' | 'task_status' | 'mesh_summary';
}

export interface PeerResponse {
  readonly type: 'peer_list' | 'blocker_info' | 'task_status' | 'mesh_summary';
  readonly peers: readonly PeerInfo[];
  readonly blockers: readonly PeerBlocker[];
  readonly tasks: readonly PeerTask[];
  readonly timestamp: Date;
}

export interface PeerBlocker {
  readonly blockedAgentId: string;
  readonly blockedAgentName: string;
  readonly blockingAgentId?: string;
  readonly blockingAgentName?: string;
  readonly reason: string;
  readonly since: Date;
}

export interface PeerTask {
  readonly agentId: string;
  readonly agentName: string;
  readonly task: string;
  readonly status: PeerStatus;
  readonly progress?: number;
  readonly startedAt?: Date;
}

// ============================================================================
// Peer Protocol Service
// ============================================================================

export class PeerProtocolService {
  constructor(private db: Database.Database) {}

  /**
   * Register a new agent with the peer mesh.
   */
  registerPeer(input: {
    threadId: string;
    displayName: string;
    kind: MeshAgentKind;
    toolName: string;
    role: string;
    terminalSessionId?: string;
    worktreeId?: string;
    runId?: string;
  }): RegisteredMeshAgent {
    return registerMeshAgent(this.db, {
      ...input,
      status: 'starting',
    });
  }

  /**
   * Update peer status.
   */
  updatePeerStatus(
    agentId: string,
    status: MeshAgentStatus,
    metadata?: {
      currentTask?: string;
      blocker?: string;
      progress?: number;
    }
  ): void {
    const agent = this.getPeerAgent(agentId);

    // Map Doorway status to peer status
    const peerStatus = mapToPeerStatus(status);

    // If there's a blocker, send a blocked_notice to the mesh
    if (metadata?.blocker && peerStatus === 'blocked') {
      const agents = listMeshAgents(this.db, agent.threadId);
      for (const otherAgent of agents) {
        if (otherAgent.id !== agentId) {
          sendPeerMessage(this.db, {
            threadId: agent.threadId,
            fromAgentId: agentId,
            toAgentId: otherAgent.id,
            kind: 'blocked_notice',
            content: `BLOCKED: ${metadata.blocker}`,
          });
        }
      }
    }

    this.db
      .prepare(
        `
      UPDATE agent_mesh_agents
      SET status = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(status, toISOString(new Date()), agentId);
  }

  /**
   * Query peers in the mesh.
   */
  queryPeers(query: PeerQuery): PeerResponse {
    const agents = listMeshAgents(this.db, query.threadId);

    const peers: PeerInfo[] = agents.map((agent) => ({
      agentId: agent.id,
      threadId: agent.threadId,
      displayName: agent.displayName,
      kind: agent.kind,
      role: agent.role,
      status: agent.status,
      peerStatus: mapToPeerStatus(agent.status),
      lastActivity: agent.updatedAt,
    }));

    switch (query.queryType) {
      case 'who_is_running':
        return {
          type: 'peer_list',
          peers: peers.filter((p) => p.peerStatus === 'running'),
          blockers: [],
          tasks: [],
          timestamp: new Date(),
        };

      case 'what_blocked_me':
        return {
          type: 'blocker_info',
          peers: [],
          blockers: this.findBlockers(query.threadId, query.requestingAgentId),
          tasks: [],
          timestamp: new Date(),
        };

      case 'task_status':
        return {
          type: 'task_status',
          peers: [],
          blockers: [],
          tasks: peers.map((p) => ({
            agentId: p.agentId,
            agentName: p.displayName,
            task: p.currentTask ?? 'Unknown task',
            status: p.peerStatus,
            startedAt: p.lastActivity,
          })),
          timestamp: new Date(),
        };

      case 'mesh_summary':
        return {
          type: 'mesh_summary',
          peers,
          blockers: this.findBlockers(query.threadId, query.requestingAgentId),
          tasks: peers.map((p) => ({
            agentId: p.agentId,
            agentName: p.displayName,
            task: p.currentTask ?? 'Unknown task',
            status: p.peerStatus,
            progress: p.progress,
            startedAt: p.lastActivity,
          })),
          timestamp: new Date(),
        };
    }
  }

  /**
   * Send a message to a peer.
   */
  sendToPeer(input: {
    fromAgentId: string;
    toAgentId: string;
    threadId: string;
    kind: MeshMessageKind;
    content: string;
    evidenceRefs?: readonly string[];
  }): MeshMessage {
    return sendPeerMessage(this.db, {
      ...input,
      requiresHumanApproval: false,
    });
  }

  /**
   * Receive pending messages for an agent.
   */
  receiveMessages(agentId: string, includeHandled = false): readonly MeshMessage[] {
    return pullPeerMessages(this.db, agentId, { includeHandled });
  }

  /**
   * Mark a message as handled.
   */
  acknowledgeMessage(messageId: string): void {
    markPeerMessageHandled(this.db, messageId);
  }

  /**
   * Get all peer messages for a thread (for UI display).
   */
  getThreadPeerMessages(threadId: string) {
    return listThreadPeerMessages(this.db, threadId);
  }

  /**
   * Get mesh loop metrics for a thread.
   */
  getMeshLoopMetrics(threadId: string) {
    return listMeshLoopMetrics(this.db, threadId);
  }

  /**
   * Emit a completion event to the mesh via handoff message.
   */
  emitCompletion(input: {
    agentId: string;
    threadId: string;
    summary: string;
    changedFiles?: readonly string[];
  }): void {
    const agents = listMeshAgents(this.db, input.threadId);

    for (const agent of agents) {
      if (agent.id !== input.agentId) {
        sendPeerMessage(this.db, {
          threadId: input.threadId,
          fromAgentId: input.agentId,
          toAgentId: agent.id,
          kind: 'handoff',
          content: `Completed: ${input.summary}`,
          evidenceRefs: input.changedFiles,
        });
      }
    }
  }

  /**
   * Emit a blocker event to the mesh via blocked_notice.
   */
  emitBlocker(input: {
    agentId: string;
    threadId: string;
    reason: string;
    blockingAgentId?: string;
  }): void {
    const agents = listMeshAgents(this.db, input.threadId);

    for (const agent of agents) {
      if (agent.id !== input.agentId) {
        const content = input.blockingAgentId
          ? `BLOCKED by ${agent.displayName}: ${input.reason}`
          : `BLOCKED: ${input.reason}`;

        sendPeerMessage(this.db, {
          threadId: input.threadId,
          fromAgentId: input.agentId,
          toAgentId: agent.id,
          kind: 'blocked_notice',
          content,
        });
      }
    }
  }

  /**
   * Query who else is running in the mesh.
   */
  whoIsRunning(threadId: string, excludeAgentId?: string): readonly PeerInfo[] {
    const agents = listMeshAgents(this.db, threadId);

    return agents
      .filter((a) => {
        if (a.id === excludeAgentId) return false;
        const peerStatus = mapToPeerStatus(a.status);
        // Include both 'running' and 'waiting' — waiting agents are still active participants
        return peerStatus === 'running' || peerStatus === 'waiting';
      })
      .map((a) => ({
        agentId: a.id,
        threadId: a.threadId,
        displayName: a.displayName,
        kind: a.kind,
        role: a.role,
        status: a.status,
        peerStatus: 'running' as PeerStatus,
        lastActivity: a.updatedAt,
      }));
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private getPeerAgent(agentId: string): RegisteredMeshAgent {
    const row = this.db
      .prepare('SELECT * FROM agent_mesh_agents WHERE id = ?')
      .get(agentId) as any;

    if (!row) {
      throw new Error(`Peer agent not found: ${agentId}`);
    }

    return {
      id: row.id,
      threadId: row.thread_id,
      displayName: row.display_name,
      kind: row.kind,
      toolName: row.tool_name,
      role: row.role,
      status: row.status,
      terminalSessionId: row.terminal_session_id,
      worktreeId: row.worktree_id,
      runId: row.run_id,
      mailboxId: row.mailbox_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private findBlockers(threadId: string, requestingAgentId: string): readonly PeerBlocker[] {
    const agents = listMeshAgents(this.db, threadId);
    const blockers: PeerBlocker[] = [];

    const requestingAgent = agents.find((a) => a.id === requestingAgentId);
    if (!requestingAgent) return blockers;

    for (const agent of agents) {
      if (agent.id === requestingAgentId) continue;

      // Check if this agent might be blocking others
      if (agent.status === 'waiting' || agent.status === 'needs_approval') {
        blockers.push({
          blockedAgentId: requestingAgentId,
          blockedAgentName: requestingAgent.displayName,
          blockingAgentId: agent.id,
          blockingAgentName: agent.displayName,
          reason: `Agent is ${agent.status.replace('_', ' ')}`,
          since: agent.updatedAt,
        });
      }
    }

    return blockers;
  }
}

// ============================================================================
// Status Mapping
// ============================================================================

function mapToPeerStatus(status: MeshAgentStatus): PeerStatus {
  switch (status) {
    case 'starting':
    case 'running':
      return 'running';
    case 'waiting':
    case 'needs_approval':
      return 'waiting';
    case 'blocked':
      return 'blocked';
    case 'done':
      return 'completed';
    case 'failed':
      return 'failed';
    default: {
      // exhaustive check
      const _exhaustive: never = status;
      return 'idle';
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPeerProtocol(db: Database.Database): PeerProtocolService {
  return new PeerProtocolService(db);
}
