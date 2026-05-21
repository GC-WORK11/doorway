/**
 * Generic CLI Adapter
 *
 * A flexible adapter that can launch any CLI command.
 * Useful for custom agents, scripts, or tools not natively supported.
 */

import type { AgentEvent, IAgentAdapter, LaunchContext, LaunchSpec } from './types.js';

export interface GenericCliConfig {
  /** The CLI command to run (e.g., 'claude', 'opencode', 'my-script') */
  command: string;

  /** Default working directory */
  defaultCwd?: string;

  /** Default environment variables */
  defaultEnv?: Record<string, string>;

  /** Whether the command exists on PATH */
  checkPath?: boolean;

  /** Additional arguments to always include */
  defaultArgs?: readonly string[];
}

export class GenericCliAdapter implements IAgentAdapter {
  readonly provider: string;
  readonly name: string;

  readonly manifest = {
    id: 'generic-cli-custom',
    name: 'Generic CLI',
    provider: 'custom',
    runtimeMode: 'Visible CLI' as const,
    executionSurface: 'visible_terminal' as const,
    credentialMode: 'user_api_key' as const,
  };

  private readonly config: Required<GenericCliConfig>;

  constructor(config: GenericCliConfig) {
    this.config = {
      command: config.command,
      defaultCwd: config.defaultCwd ?? process.cwd(),
      defaultEnv: config.defaultEnv ?? {},
      checkPath: config.checkPath ?? true,
      defaultArgs: config.defaultArgs ?? [],
    };

    this.provider = config.command;
    this.name = `CLI (${config.command})`;
  }

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    const cwd = context.cwd || this.config.defaultCwd;
    const args = [...this.config.defaultArgs, ...(context.args ?? [])];

    return {
      command: this.config.command,
      args,
      cwd,
      env: { ...this.config.defaultEnv, ...context.env },
    };
  }

  onEvent(_callback: (event: AgentEvent) => void): () => void {
    return () => {
      return;
    };
  }
}

/**
 * Create a generic CLI adapter for a specific command.
 */
export function createGenericCliAdapter(config: GenericCliConfig): GenericCliAdapter {
  return new GenericCliAdapter(config);
}
