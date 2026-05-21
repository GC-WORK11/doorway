/**
 * Cursor Adapter
 *
 * Builds Cursor CLI launch specs. TerminalRuntime owns process execution.
 */

import type { AgentEvent, IAgentAdapter, LaunchContext, LaunchSpec } from './types.js';

export interface CursorConfig {
  /** Path to cursor CLI. */
  cliPath?: string;
  /** Additional CLI arguments. */
  extraArgs?: readonly string[];
}

export class CursorAdapter implements IAgentAdapter {
  readonly provider = 'cursor';
  readonly name = 'Cursor AI';

  readonly manifest = {
    id: 'cursor-cli',
    name: 'Cursor AI',
    provider: 'cursor',
    runtimeMode: 'Visible CLI' as const,
    executionSurface: 'visible_terminal' as const,
    credentialMode: 'provider_owned' as const,
  };

  private readonly config: Required<CursorConfig>;

  constructor(config: CursorConfig = {}) {
    this.config = {
      cliPath: config.cliPath ?? 'cursor',
      extraArgs: config.extraArgs ?? [],
    };
  }

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    const prompt = context.prompt ?? context.command ?? '';
    const model = context.env?.DOORWAY_MODEL_ID;

    return {
      command: this.config.cliPath,
      args: [...(model ? ['--model', model] : []), ...this.config.extraArgs, prompt],
      cwd: context.cwd,
      env: {
        ...context.env,
        CURSOR_SESSION_ID: `cursor_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      },
    };
  }

  onEvent(_callback: (event: AgentEvent) => void): () => void {
    return () => {
      return;
    };
  }
}
