/**
 * Gemini Adapter
 *
 * Builds Gemini CLI launch specs. TerminalRuntime owns process execution.
 */

import type { AgentEvent, IAgentAdapter, LaunchContext, LaunchSpec } from './types.js';

export interface GeminiConfig {
  /** Path to gemini CLI. */
  cliPath?: string;
  /** Additional CLI arguments. */
  extraArgs?: readonly string[];
}

export class GeminiAdapter implements IAgentAdapter {
  readonly provider = 'gemini';
  readonly name = 'Gemini CLI';

  readonly manifest = {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    provider: 'gemini',
    runtimeMode: 'Visible CLI' as const,
    executionSurface: 'visible_terminal' as const,
    credentialMode: 'provider_owned' as const,
  };

  private readonly config: Required<GeminiConfig>;

  constructor(config: GeminiConfig = {}) {
    this.config = {
      cliPath: config.cliPath ?? 'gemini',
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
        GEMINI_SESSION_ID: `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      },
    };
  }

  onEvent(_callback: (event: AgentEvent) => void): () => void {
    return () => {
      return;
    };
  }
}
