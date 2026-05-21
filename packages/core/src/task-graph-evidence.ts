import type Database from 'better-sqlite3';
import type {
  AgentRunId,
  ProjectId,
  TaskGraphMode,
  TaskGraphProjection,
  TaskGraphStatus,
  TaskId,
  TaskNodeStatus,
} from '@doorway/protocol';
import { recordEvent } from './event-service.js';

interface TaskGraphRow {
  readonly id: string;
  readonly project_id: string;
  readonly goal: string;
  readonly mode: string;
  readonly status: string;
  readonly created_at: string;
}

interface TaskNodeRow {
  readonly id: string;
  readonly task_id: string;
  readonly role: string;
  readonly status: string;
  readonly agent_target: string | null;
  readonly worktree_policy: string;
  readonly acceptance_criteria: string | null;
  readonly assigned_run_id: string | null;
}

interface TaskEdgeRow {
  readonly id: string;
  readonly task_id: string;
  readonly from_node_id: string;
  readonly to_node_id: string;
}

interface MutableTaskNodeRow {
  readonly id: string;
  readonly task_id: string;
  readonly status: string;
  readonly assigned_run_id?: string | null;
}

interface ClaimableTaskNodeRow {
  readonly id: string;
  readonly task_id: string;
  readonly status: string;
  readonly role: string;
}

export function listTaskGraphsForThread(
  db: Database.Database,
  threadId: string
): readonly TaskGraphProjection[] {
  const taskRows = db
    .prepare(
      `
      SELECT DISTINCT tasks.id, tasks.project_id, tasks.goal, tasks.mode, tasks.status, tasks.created_at
      FROM tasks
      INNER JOIN agent_runs ON agent_runs.task_id = tasks.id
      WHERE agent_runs.thread_id = ?
      ORDER BY tasks.created_at DESC
    `
    )
    .all(threadId) as TaskGraphRow[];
  const taskIds = taskRows.map((task) => task.id);
  const nodesByTask = listTaskNodes(db, taskIds);
  const edgesByTask = listTaskEdges(db, taskIds);

  return taskRows.map((task) => ({
    id: task.id as TaskId,
    projectId: task.project_id as ProjectId,
    goal: task.goal,
    mode: task.mode as TaskGraphMode,
    status: task.status as TaskGraphStatus,
    createdAt: new Date(task.created_at),
    nodes: nodesByTask.get(task.id) ?? [],
    edges: edgesByTask.get(task.id) ?? [],
    evidence: [{ kind: 'event', id: task.id, label: 'Task graph' }],
  }));
}

export function updateTaskNodeStatus(
  db: Database.Database,
  threadId: string,
  nodeId: string,
  status: TaskNodeStatus
): TaskGraphProjection {
  const row = db
    .prepare(
      `
      SELECT task_nodes.id, task_nodes.task_id, task_nodes.status
      FROM task_nodes
      INNER JOIN agent_runs ON agent_runs.task_id = task_nodes.task_id
      WHERE agent_runs.thread_id = ? AND task_nodes.id = ?
      LIMIT 1
    `
    )
    .get(threadId, nodeId) as MutableTaskNodeRow | undefined;

  if (!row) {
    throw new Error(`Task node not found for thread: ${nodeId}`);
  }

  const previousStatus = row.status as TaskNodeStatus;
  const now = new Date().toISOString();
  db.prepare('UPDATE task_nodes SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    now,
    nodeId
  );

  recordEvent(db, threadId as any, 'task_graph.updated', {
    taskId: row.task_id as TaskId,
    nodeId,
    previousStatus,
    newStatus: status,
  });

  const graph = listTaskGraphsForThread(db, threadId).find((item) => item.id === row.task_id);
  if (!graph) {
    throw new Error(`Task graph not found after node update: ${row.task_id}`);
  }

  return graph;
}

export function claimTaskGraphNodeForRun(
  db: Database.Database,
  threadId: string,
  options: {
    readonly taskId: TaskId;
    readonly runId: AgentRunId;
    readonly role?: string;
  }
): TaskGraphProjection {
  const row = findClaimableNode(db, options.taskId, options.role);
  if (!row) {
    throw new Error(`No runnable task node found for task: ${options.taskId}`);
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('running', options.taskId);
  db.prepare(
    'UPDATE task_nodes SET status = ?, assigned_run_id = ?, updated_at = ? WHERE id = ?'
  ).run('running', options.runId, now, row.id);

  recordEvent(db, threadId as any, 'task_graph.updated', {
    taskId: options.taskId,
    nodeId: row.id,
    previousStatus: row.status as TaskNodeStatus,
    newStatus: 'running',
    assignedRunId: options.runId,
    graphStatus: 'running',
  });

  const graph = listTaskGraphsForThread(db, threadId).find((item) => item.id === options.taskId);
  if (!graph) {
    throw new Error(`Task graph not found after node claim: ${options.taskId}`);
  }
  return graph;
}

export function completeTaskGraphNodeForRun(
  db: Database.Database,
  threadId: string,
  options: {
    readonly runId: AgentRunId;
    readonly exitCode?: number;
  }
): TaskGraphProjection | undefined {
  const row = db
    .prepare(
      `
      SELECT id, task_id, status, assigned_run_id
      FROM task_nodes
      WHERE assigned_run_id = ?
      LIMIT 1
    `
    )
    .get(options.runId) as MutableTaskNodeRow | undefined;

  if (!row) {
    return undefined;
  }

  const previousStatus = row.status as TaskNodeStatus;
  const newStatus: TaskNodeStatus = options.exitCode === 0 ? 'completed' : 'failed';
  const now = new Date().toISOString();
  db.prepare('UPDATE task_nodes SET status = ?, updated_at = ? WHERE id = ?').run(
    newStatus,
    now,
    row.id
  );
  const graphStatus = updateTaskStatusFromNodes(db, row.task_id);

  recordEvent(db, threadId as any, 'task_graph.updated', {
    taskId: row.task_id as TaskId,
    nodeId: row.id,
    previousStatus,
    newStatus,
    assignedRunId: options.runId,
    graphStatus,
  });

  return listTaskGraphsForThread(db, threadId).find((item) => item.id === row.task_id);
}

function findClaimableNode(
  db: Database.Database,
  taskId: TaskId,
  role?: string
): ClaimableTaskNodeRow | undefined {
  const rows = db
    .prepare(
      `
      SELECT id, task_id, status, role
      FROM task_nodes
      WHERE task_id = ? AND status = 'pending' AND assigned_run_id IS NULL
      ORDER BY created_at ASC
    `
    )
    .all(taskId) as ClaimableTaskNodeRow[];
  const runnable = rows.filter((row) => dependenciesComplete(db, row.id));
  return (
    runnable.find((row) => row.role === role) ??
    runnable[0] ??
    rows.find((row) => row.role === role) ??
    rows[0]
  );
}

function dependenciesComplete(db: Database.Database, nodeId: string): boolean {
  const blocking = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM task_edges
      INNER JOIN task_nodes ON task_nodes.id = task_edges.from_node_id
      WHERE task_edges.to_node_id = ? AND task_nodes.status != 'completed'
    `
    )
    .get(nodeId) as { readonly count: number };
  return blocking.count === 0;
}

function updateTaskStatusFromNodes(db: Database.Database, taskId: string): TaskGraphStatus {
  const rows = db.prepare('SELECT status FROM task_nodes WHERE task_id = ?').all(taskId) as {
    readonly status: TaskNodeStatus;
  }[];
  const graphStatus: TaskGraphStatus = rows.some((row) => row.status === 'failed')
    ? 'failed'
    : rows.length > 0 && rows.every((row) => row.status === 'completed')
      ? 'completed'
      : 'running';
  db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(
    graphStatus,
    graphStatus === 'completed' || graphStatus === 'failed' ? new Date().toISOString() : null,
    taskId
  );
  return graphStatus;
}

function listTaskNodes(
  db: Database.Database,
  taskIds: readonly string[]
): ReadonlyMap<string, TaskGraphProjection['nodes']> {
  if (taskIds.length === 0) {
    return new Map();
  }

  const rows = db
    .prepare(
      `
      SELECT id, task_id, role, status, agent_target, worktree_policy, acceptance_criteria, assigned_run_id
      FROM task_nodes
      WHERE task_id IN (${taskIds.map(() => '?').join(',')})
      ORDER BY created_at ASC
    `
    )
    .all(...taskIds) as TaskNodeRow[];

  return rows.reduce<Map<string, TaskGraphProjection['nodes']>>((acc, row) => {
    const nodes = acc.get(row.task_id) ?? [];
    acc.set(row.task_id, [
      ...nodes,
      {
        id: row.id,
        taskId: row.task_id as TaskId,
        role: row.role,
        status: row.status as TaskNodeStatus,
        ...(row.agent_target ? { agentTarget: row.agent_target } : {}),
        worktreePolicy: row.worktree_policy as 'isolated' | 'shared',
        ...(row.acceptance_criteria ? { acceptanceCriteria: row.acceptance_criteria } : {}),
        ...(row.assigned_run_id ? { assignedRunId: row.assigned_run_id as AgentRunId } : {}),
      },
    ]);
    return acc;
  }, new Map());
}

function listTaskEdges(
  db: Database.Database,
  taskIds: readonly string[]
): ReadonlyMap<string, TaskGraphProjection['edges']> {
  if (taskIds.length === 0) {
    return new Map();
  }

  const rows = db
    .prepare(
      `
      SELECT id, task_id, from_node_id, to_node_id
      FROM task_edges
      WHERE task_id IN (${taskIds.map(() => '?').join(',')})
    `
    )
    .all(...taskIds) as TaskEdgeRow[];

  return rows.reduce<Map<string, TaskGraphProjection['edges']>>((acc, row) => {
    const edges = acc.get(row.task_id) ?? [];
    acc.set(row.task_id, [
      ...edges,
      {
        id: row.id,
        taskId: row.task_id as TaskId,
        fromNodeId: row.from_node_id,
        toNodeId: row.to_node_id,
      },
    ]);
    return acc;
  }, new Map());
}
