/**
 * Fixture Agent Adapter
 *
 * Adapter for the deterministic fixture agent used in testing.
 * This adapter launches the @doorway/fixture-agent package.
 */

import { join } from 'node:path';
import type { AgentEvent, IAgentAdapter, LaunchContext, LaunchSpec } from './types.js';

export class FixtureAgentAdapter implements IAgentAdapter {
  readonly provider = 'fixture-agent';
  readonly name = 'Fixture Agent';

  readonly manifest = {
    id: 'fixture-agent-local',
    name: 'Fixture Agent',
    provider: 'fixture-agent',
    runtimeMode: 'Local Agent' as const,
    executionSurface: 'embedded_pty' as const,
    credentialMode: 'local_only' as const,
  };

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    const scriptPath = join(process.cwd(), '../../examples/fixture-agent/dist/index.js');
    const prompt =
      context.args?.find((a) => a.startsWith('--prompt='))?.split('=')[1] ?? 'default task';

    return {
      command: 'node',
      args: [scriptPath, '--prompt', prompt],
      cwd: context.cwd,
      env: context.env ?? {},
    };
  }

  onEvent(_callback: (event: AgentEvent) => void): () => void {
    return () => {
      return;
    };
  }
}

/**
 * Create the fixture agent adapter.
 */
export function createFixtureAgentAdapter(): FixtureAgentAdapter {
  return new FixtureAgentAdapter();
}
