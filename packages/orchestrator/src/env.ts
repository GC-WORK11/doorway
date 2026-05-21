export interface EnvOverride {
  PORT: string;
  VITE_PORT: string;
  NEXT_PORT: string;
  DOORWAY_TASK_ID: string;
  DOORWAY_WORKTREE_ID: string;
}

export class EnvironmentOverrider {
  private basePort = 3101;
  private integrationPort = 3199;

  // Assign a port for a standard agent run
  allocateWorktreeEnv(taskId: string, worktreeId: string): EnvOverride {
    const port = String(this.basePort++);
    return {
      PORT: port,
      VITE_PORT: port,
      NEXT_PORT: port,
      DOORWAY_TASK_ID: taskId,
      DOORWAY_WORKTREE_ID: worktreeId,
    };
  }

  // Assign a port for the integration run
  allocateIntegrationEnv(taskId: string, worktreeId: string): EnvOverride {
    const port = String(this.integrationPort++);
    return {
      PORT: port,
      VITE_PORT: port,
      NEXT_PORT: port,
      DOORWAY_TASK_ID: taskId,
      DOORWAY_WORKTREE_ID: worktreeId,
    };
  }
}
