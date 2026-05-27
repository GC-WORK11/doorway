/**
 * Claude Code Adapter
 *
 * Builds Claude Code CLI launch specs. TerminalRuntime owns process execution.
 */

import type { AgentEvent, IAgentAdapter, LaunchContext, LaunchSpec } from './types.js';

export interface ClaudeCodeConfig {
  /** Path to claude CLI. */
  cliPath?: string;
  /** Additional CLI arguments. */
  extraArgs?: readonly string[];
}

export class ClaudeCodeAdapter implements IAgentAdapter {
  readonly provider = 'claude';
  readonly name = 'Claude Code';

  readonly manifest = {
    id: 'claude-code-cli',
    name: 'Claude Code',
    provider: 'claude',
    runtimeMode: 'Visible CLI' as const,
    executionSurface: 'visible_terminal' as const,
    credentialMode: 'provider_owned' as const,
  };

  private readonly config: Required<ClaudeCodeConfig>;

  constructor(config: ClaudeCodeConfig = {}) {
    this.config = {
      cliPath: config.cliPath ?? 'claude',
      extraArgs: config.extraArgs ?? [],
    };
  }

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    const prompt = context.prompt ?? context.command ?? '';
    const model = context.env?.DOORWAY_MODEL_ID;

    return {
      command: this.config.cliPath,
      args: ['--resume', ...(model ? ['--model', model] : []), ...this.config.extraArgs],
      cwd: context.cwd,
      env: {
        ...context.env,
        CLAUDE_SESSION_ID: `claude_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
