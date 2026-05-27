/**
 * Peer Protocol Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createPeerProtocol, type PeerQuery } from './peer-protocol.js';

// Mock the @doorway/core imports
vi.mock('@doorway/core', () => ({
  generateId: vi.fn(() => 'test-id-' + Math.random().toString(36).slice(2)),
  toISOString: vi.fn((d: Date) => d.toISOString()),
  listMeshAgents: vi.fn(),
  registerMeshAgent: vi.fn(),
  sendPeerMessage: vi.fn(),
  pullPeerMessages: vi.fn(),
  markPeerMessageHandled: vi.fn(),
  listThreadPeerMessages: vi.fn(),
  listMeshLoopMetrics: vi.fn(),
}));

import {
  listMeshAgents,
  registerMeshAgent,
  sendPeerMessage,
  pullPeerMessages,
  markPeerMessageHandled,
} from '@doorway/core';

describe('PeerProtocolService', () => {
  let db: Database.Database;
  let peerProtocol: ReturnType<typeof createPeerProtocol>;

  const mockAgents = [
    {
      id: 'agent-1',
      threadId: 'thread-1',
      displayName: 'Agent Alpha',
      kind: 'visible_cli' as const,
      toolName: 'bash',
      role: 'primary',
      status: 'running' as const,
      mailboxId: 'mailbox-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'agent-2',
      threadId: 'thread-1',
      displayName: 'Agent Beta',
      kind: 'reviewer' as const,
      toolName: 'review',
      role: 'reviewer',
      status: 'waiting' as const,
      mailboxId: 'mailbox-2',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    db = new Database(':memory:');

    // Create the agent_mesh_agents table
    db.exec(`
      CREATE TABLE agent_mesh_agents (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        terminal_session_id TEXT,
        worktree_id TEXT,
        run_id TEXT,
        mailbox_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Insert mock agents
    const insert = db.prepare(`
      INSERT INTO agent_mesh_agents (id, thread_id, display_name, kind, tool_name, role, status, mailbox_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const agent of mockAgents) {
      insert.run(
        agent.id,
        agent.threadId,
        agent.displayName,
        agent.kind,
        agent.toolName,
        agent.role,
        agent.status,
        agent.mailboxId,
        agent.createdAt.toISOString(),
        agent.updatedAt.toISOString()
      );
    }

    peerProtocol = createPeerProtocol(db);

    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  // ========================================================================
  // registerPeer
  // ========================================================================

  describe('registerPeer', () => {
    it('should register a new peer with the mesh', () => {
      const mockAgent = {
        id: 'new-agent',
        threadId: 'thread-1',
        displayName: 'New Agent',
        kind: 'visible_cli' as const,
        toolName: 'bash',
        role: 'helper',
        status: 'starting' as const,
        mailboxId: 'mailbox-new',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (registerMeshAgent as any).mockReturnValue(mockAgent);

      const result = peerProtocol.registerPeer({
        threadId: 'thread-1',
        displayName: 'New Agent',
        kind: 'visible_cli',
        toolName: 'bash',
        role: 'helper',
      });

      expect(registerMeshAgent).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          threadId: 'thread-1',
          displayName: 'New Agent',
          kind: 'visible_cli',
          toolName: 'bash',
          role: 'helper',
          status: 'starting',
        })
      );
    });
  });

  // ========================================================================
  // updatePeerStatus
  // ========================================================================

  describe('updatePeerStatus', () => {
    it('should update peer status in database', () => {
      peerProtocol.updatePeerStatus('agent-1', 'done');

      const row = db
        .prepare('SELECT status FROM agent_mesh_agents WHERE id = ?')
        .get('agent-1') as any;
      expect(row.status).toBe('done');
    });

    it('should emit blocked_notice when blocker is provided', () => {
      (listMeshAgents as any).mockReturnValue([mockAgents[1]]);

      peerProtocol.updatePeerStatus('agent-1', 'blocked', { blocker: 'waiting for user input' });

      expect(sendPeerMessage).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          kind: 'blocked_notice',
          content: 'BLOCKED: waiting for user input',
        })
      );
    });
  });

  // ========================================================================
  // queryPeers
  // ========================================================================

  describe('queryPeers', () => {
    beforeEach(() => {
      (listMeshAgents as any).mockReturnValue(mockAgents);
    });

    it('should return running peers for who_is_running query', () => {
      const query: PeerQuery = {
        threadId: 'thread-1',
        requestingAgentId: 'agent-1',
        queryType: 'who_is_running',
      };

      const result = peerProtocol.queryPeers(query);

      expect(result.type).toBe('peer_list');
      expect(result.peers).toHaveLength(1);
      expect(result.peers[0].peerStatus).toBe('running');
    });

    it('should return mesh summary for mesh_summary query', () => {
      const query: PeerQuery = {
        threadId: 'thread-1',
        requestingAgentId: 'agent-1',
        queryType: 'mesh_summary',
      };

      const result = peerProtocol.queryPeers(query);

      expect(result.type).toBe('mesh_summary');
      expect(result.peers).toHaveLength(2);
      expect(result.tasks).toHaveLength(2);
    });

    it('should return task status for task_status query', () => {
      const query: PeerQuery = {
        threadId: 'thread-1',
        requestingAgentId: 'agent-1',
        queryType: 'task_status',
      };

      const result = peerProtocol.queryPeers(query);

      expect(result.type).toBe('task_status');
      expect(result.tasks).toHaveLength(2);
    });
  });

  // ========================================================================
  // sendToPeer
  // ========================================================================

  describe('sendToPeer', () => {
    it('should send a message to a peer', () => {
      const mockMessage = {
        id: 'msg-1',
        threadId: 'thread-1',
        fromAgentId: 'agent-1',
        toAgentId: 'agent-2',
        kind: 'question' as const,
        content: 'What is the status?',
        evidenceRefs: [],
        status: 'unhandled' as const,
        requiresHumanApproval: false,
        createdAt: new Date(),
        evidence: [],
      };

      (sendPeerMessage as any).mockReturnValue(mockMessage);

      const result = peerProtocol.sendToPeer({
        fromAgentId: 'agent-1',
        toAgentId: 'agent-2',
        threadId: 'thread-1',
        kind: 'question',
        content: 'What is the status?',
      });

      expect(sendPeerMessage).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          fromAgentId: 'agent-1',
          toAgentId: 'agent-2',
          kind: 'question',
          content: 'What is the status?',
          requiresHumanApproval: false,
        })
      );
    });
  });

  // ========================================================================
  // receiveMessages
  // ========================================================================

  describe('receiveMessages', () => {
    it('should pull pending messages for an agent', () => {
      const mockMessages = [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          fromAgentId: 'agent-2',
          toAgentId: 'agent-1',
          kind: 'answer' as const,
          content: 'Status is good',
          evidenceRefs: [],
          status: 'unhandled' as const,
          requiresHumanApproval: false,
          createdAt: new Date(),
          evidence: [],
        },
      ];

      (pullPeerMessages as any).mockReturnValue(mockMessages);

      const result = peerProtocol.receiveMessages('agent-1');

      expect(pullPeerMessages).toHaveBeenCalledWith(db, 'agent-1', { includeHandled: false });
      expect(result).toHaveLength(1);
    });
  });

  // ========================================================================
  // acknowledgeMessage
  // ========================================================================

  describe('acknowledgeMessage', () => {
    it('should mark a message as handled', () => {
      peerProtocol.acknowledgeMessage('msg-1');

      expect(markPeerMessageHandled).toHaveBeenCalledWith(db, 'msg-1');
    });
  });

  // ========================================================================
  // emitCompletion
  // ========================================================================

  describe('emitCompletion', () => {
    it('should emit completion to all other agents', () => {
      (listMeshAgents as any).mockReturnValue([mockAgents[1]]);

      peerProtocol.emitCompletion({
        agentId: 'agent-1',
        threadId: 'thread-1',
        summary: 'Completed feature X',
        changedFiles: ['file1.ts', 'file2.ts'],
      });

      expect(sendPeerMessage).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          kind: 'handoff',
          content: 'Completed: Completed feature X',
          evidenceRefs: ['file1.ts', 'file2.ts'],
        })
      );
    });

    it('should not send to self', () => {
      (listMeshAgents as any).mockReturnValue([mockAgents[0]]);

      peerProtocol.emitCompletion({
        agentId: 'agent-1',
        threadId: 'thread-1',
        summary: 'Done',
      });

      expect(sendPeerMessage).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // emitBlocker
  // ========================================================================

  describe('emitBlocker', () => {
    it('should emit blocker to all other agents', () => {
      (listMeshAgents as any).mockReturnValue([mockAgents[1]]);

      peerProtocol.emitBlocker({
        agentId: 'agent-1',
        threadId: 'thread-1',
        reason: 'waiting for API key',
      });

      expect(sendPeerMessage).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          kind: 'blocked_notice',
          content: 'BLOCKED: waiting for API key',
        })
      );
    });
  });

  // ========================================================================
  // whoIsRunning
  // ========================================================================

  describe('whoIsRunning', () => {
    it('should return all running agents except excluded', () => {
      (listMeshAgents as any).mockReturnValue(mockAgents);

      const result = peerProtocol.whoIsRunning('thread-1', 'agent-1');

      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('agent-2');
    });

    it('should return empty when no agents running', () => {
      (listMeshAgents as any).mockReturnValue([
        { ...mockAgents[0], status: 'done' },
        { ...mockAgents[1], status: 'done' },
      ]);

      const result = peerProtocol.whoIsRunning('thread-1');

      expect(result).toHaveLength(0);
    });
  });

  // ========================================================================
  // Status Mapping
  // ========================================================================

  describe('status mapping', () => {
    it('should map running statuses correctly', () => {
      (listMeshAgents as any).mockReturnValue([{ ...mockAgents[0], status: 'starting' }]);

      let result = peerProtocol.whoIsRunning('thread-1');
      expect(result[0].peerStatus).toBe('running');

      (listMeshAgents as any).mockReturnValue([{ ...mockAgents[0], status: 'running' }]);
      result = peerProtocol.whoIsRunning('thread-1');
      expect(result[0].peerStatus).toBe('running');
    });

    it('should map waiting statuses correctly', () => {
      (listMeshAgents as any).mockReturnValue([{ ...mockAgents[0], status: 'waiting' }]);

      const result = peerProtocol.queryPeers({
        threadId: 'thread-1',
        requestingAgentId: 'agent-1',
        queryType: 'who_is_running',
      });

      expect(result.peers).toHaveLength(0);
    });

    it('should map done to completed', () => {
      (listMeshAgents as any).mockReturnValue([{ ...mockAgents[0], status: 'done' }]);

      const result = peerProtocol.queryPeers({
        threadId: 'thread-1',
        requestingAgentId: 'agent-1',
        queryType: 'mesh_summary',
      });

      expect(result.peers[0].peerStatus).toBe('completed');
    });

    it('should map failed correctly', () => {
      (listMeshAgents as any).mockReturnValue([{ ...mockAgents[0], status: 'failed' }]);

      const result = peerProtocol.queryPeers({
        threadId: 'thread-1',
        requestingAgentId: 'agent-1',
        queryType: 'mesh_summary',
      });

      expect(result.peers[0].peerStatus).toBe('failed');
    });
  });
});
