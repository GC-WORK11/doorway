import type { Database } from 'better-sqlite3';
import { generateId } from '@doorway/core';
import type { BrainService } from './brain/brain-service.js';

export interface TaskGraph {
  id: string;
  projectId: string;
  goal: string;
  nodes: TaskNode[];
  edges: TaskEdge[];
}

export interface TaskNode {
  id: string;
  taskId: string;
  role: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  agentTarget?: string;
  worktreePolicy: 'isolated' | 'shared';
  acceptanceCriteria?: string;
  assignedRunId?: string;
}

export interface TaskEdge {
  id: string;
  taskId: string;
  fromNodeId: string;
  toNodeId: string;
}

/**
 * TaskGraphService
 *
 * Decomposes a user prompt into a graph of tasks.
 */
export class TaskGraphService {
  constructor(private db: Database) {}

  /**
   * Create a new task graph based on a goal.
   * V1 uses deterministic rules for decomposition by default.
   */
  async createTaskGraph(
    projectId: string,
    goal: string,
    mode: 'parallel' | 'sequential' = 'parallel',
    brain?: BrainService
  ): Promise<TaskGraph> {
    const taskId = generateId('task');
    const now = new Date().toISOString();

    // 1. Create the Task record
    this.db
      .prepare(
        `
      INSERT INTO tasks (id, project_id, goal, mode, status, created_at)
      VALUES (?, ?, ?, ?, 'planned', ?)
    `
      )
      .run(taskId, projectId, goal, mode, now);

    const nodes: TaskNode[] = [];
    const edges: TaskEdge[] = [];

    if (brain && mode === 'parallel') {
      try {
        // Use Brain for decomposition
        const response = await brain.executeRole(
          'planner',
          {
            messages: [
              {
                role: 'system',
                content:
                  'You are the Doorway Planner. Decompose the user task into a JSON graph of steps: implementer, tester, reviewer. Return valid JSON only.',
              },
              {
                role: 'user',
                content: goal,
              },
            ],
            responseFormat: 'json',
          },
          taskId
        );
        const plan = JSON.parse(response);
        // V1 maps provider plans onto the deterministic graph shape persisted today.
      } catch (err) {
        console.warn('[TaskGraph] Brain decomposition failed, falling back to deterministic:', err);
      }
    }

    if (nodes.length === 0) {
      if (mode === 'parallel') {
        // Decompose into Implementer -> Reviewer
        const implementerNode = this.createNode(
          taskId,
          'implementer',
          'claude',
          'isolated',
          'Code implemented and verified by agent.'
        );
        const reviewerNode = this.createNode(
          taskId,
          'reviewer',
          'claude',
          'isolated',
          'Code reviewed for security, style, and correctness.'
        );

        nodes.push(implementerNode);
        nodes.push(reviewerNode);

        // Reviewer depends on Implementer
        edges.push(this.createEdge(taskId, implementerNode.id, reviewerNode.id));
      } else {
        // Basic implementation node
        nodes.push(this.createNode(taskId, 'implementer', 'claude', 'isolated', 'Goal achieved.'));
      }
    }

    // Persist nodes and edges
    const insertNode = this.db.prepare(`
      INSERT INTO task_nodes (id, task_id, role, status, agent_target, worktree_policy, acceptance_criteria, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdge = this.db.prepare(`
      INSERT INTO task_edges (id, task_id, from_node_id, to_node_id)
      VALUES (?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      for (const node of nodes) {
        insertNode.run(
          node.id,
          node.taskId,
          node.role,
          node.status,
          node.agentTarget,
          node.worktreePolicy,
          node.acceptanceCriteria,
          now,
          now
        );
      }
      for (const edge of edges) {
        insertEdge.run(edge.id, edge.taskId, edge.fromNodeId, edge.toNodeId);
      }
    })();

    return { id: taskId, projectId, goal, nodes, edges };
  }

  private createNode(
    taskId: string,
    role: string,
    agentTarget: string,
    worktreePolicy: 'isolated' | 'shared',
    acceptanceCriteria: string
  ): TaskNode {
    return {
      id: generateId('node'),
      taskId,
      role,
      status: 'pending',
      agentTarget,
      worktreePolicy,
      acceptanceCriteria,
    };
  }

  private createEdge(taskId: string, fromNodeId: string, toNodeId: string): TaskEdge {
    return {
      id: generateId('edge'),
      taskId,
      fromNodeId,
      toNodeId,
    };
  }

  async getTaskGraph(taskId: string): Promise<TaskGraph | null> {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (!task) return null;

    const nodes = this.db
      .prepare('SELECT * FROM task_nodes WHERE task_id = ?')
      .all(taskId) as any[];
    const edges = this.db
      .prepare('SELECT * FROM task_edges WHERE task_id = ?')
      .all(taskId) as any[];

    return {
      id: task.id,
      projectId: task.project_id,
      goal: task.goal,
      nodes: nodes.map((n) => ({
        id: n.id,
        taskId: n.task_id,
        role: n.role,
        status: n.status,
        agentTarget: n.agent_target,
        worktreePolicy: n.worktree_policy,
        acceptanceCriteria: n.acceptance_criteria,
        assignedRunId: n.assigned_run_id,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        taskId: e.task_id,
        fromNodeId: e.from_node_id,
        toNodeId: e.to_node_id,
      })),
    };
  }
}
