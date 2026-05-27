/**
 * Agy CLI Adapter
 *
 * Builds Agy CLI launch specs. TerminalRuntime owns process execution.
 */

import type { AgentEvent, IAgentAdapter, LaunchContext, LaunchSpec } from './types.js';

export interface AgyConfig {
  /** Path to agy CLI. */
  cliPath?: string;
  /** Additional CLI arguments. */
  extraArgs?: readonly string[];
}

export class AgyAdapter implements IAgentAdapter {
  readonly provider = 'agy';
  readonly name = 'Agy CLI';

  readonly manifest = {
    id: 'agy-cli',
    name: 'Agy CLI',
    provider: 'agy',
    runtimeMode: 'Visible CLI' as const,
    executionSurface: 'visible_terminal' as const,
    credentialMode: 'provider_owned' as const,
  };

  private readonly config: Required<AgyConfig>;

  constructor(config: AgyConfig = {}) {
    this.config = {
      cliPath: config.cliPath ?? '/home/govinda/.local/bin/agy',
      extraArgs: config.extraArgs ?? [],
    };
  }

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    const prompt = context.prompt ?? context.command ?? '';
    
    // YC Demo Flow: When the prompt starts with or mentions a snake game, we run non-interactively or interactively.
    // Let's pass the prompt to the CLI using --prompt-interactive or --print depending on context,
    // or run interactively with the pre-filled prompt.
    // Let's map it to the CLI arguments for agy:
    // agy -i --prompt-interactive "create a 3js and html game..."
    const args = ['-i', prompt, ...this.config.extraArgs];

    return {
      command: this.config.cliPath,
      args,
      cwd: context.cwd,
      env: {
        ...context.env,
        AGY_SESSION_ID: `agy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      },
    };
  }

  onEvent(_callback: (event: AgentEvent) => void): () => void {
    return () => {
      return;
    };
  }
}
