/**
 * Codex CLI Adapter
 *
 * Builds OpenAI Codex CLI launch specs. TerminalRuntime owns process execution.
 */

import type { AgentEvent, IAgentAdapter, LaunchContext, LaunchSpec } from './types.js';

export interface CodexCliConfig {
  /** Path to codex CLI. */
  cliPath?: string;
  /** Additional CLI arguments. */
  extraArgs?: readonly string[];
}

export class CodexCliAdapter implements IAgentAdapter {
  readonly provider = 'codex';
  readonly name = 'Codex CLI';

  readonly manifest = {
    id: 'codex-cli',
    name: 'Codex CLI',
    provider: 'codex',
    runtimeMode: 'Visible CLI' as const,
    executionSurface: 'visible_terminal' as const,
    credentialMode: 'provider_owned' as const,
  };

  private readonly config: Required<CodexCliConfig>;

  constructor(config: CodexCliConfig = {}) {
    this.config = {
      cliPath: config.cliPath ?? 'codex',
      extraArgs: config.extraArgs ?? [],
    };
  }

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    const prompt = context.prompt ?? context.command ?? '';
    const model = context.env?.DOORWAY_MODEL_ID;

    return {
      command: this.config.cliPath,
      args: [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '-C',
        context.cwd,
        ...(model ? ['--model', model] : []),
        ...this.config.extraArgs,
      ],
      cwd: context.cwd,
      env: {
        ...context.env,
      },
      stdinPrompt: prompt,
    };
  }

  onEvent(_callback: (event: AgentEvent) => void): () => void {
    return () => {
      return;
    };
  }
}
