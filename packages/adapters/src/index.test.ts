import { describe, it, expect } from 'vitest';
import { GenericCliAdapter, createGenericCliAdapter } from './generic-cli-adapter.js';
import { FixtureAgentAdapter, createFixtureAgentAdapter } from './fixture-agent-adapter.js';
import { CodexCliAdapter } from './codex-cli-adapter.js';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { BaseAdapter } from './base-adapter.js';

describe('GenericCliAdapter', () => {
  it('creates a lightweight runtime adapter from config', () => {
    const adapter = new GenericCliAdapter({ command: 'test-cmd' });

    expect(adapter.provider).toBe('test-cmd');
    expect(adapter.name).toBe('CLI (test-cmd)');
    expect(adapter.manifest.executionSurface).toBe('visible_terminal');
  });

  it('builds the configured launch spec without starting a process', async () => {
    const adapter = new GenericCliAdapter({
      command: process.execPath,
      defaultArgs: ['-e', 'process.exit(0)'],
      checkPath: false,
    });

    const spec = await adapter.buildLaunch({ cwd: process.cwd() });

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual(['-e', 'process.exit(0)']);
    expect(spec.cwd).toBe(process.cwd());
  });

  it('creates adapter instances through the factory', () => {
    const adapter = createGenericCliAdapter({ command: 'my-cmd' });

    expect(adapter).toBeInstanceOf(GenericCliAdapter);
    expect(adapter.provider).toBe('my-cmd');
  });
});

describe('FixtureAgentAdapter', () => {
  it('exposes the deterministic local adapter manifest', () => {
    const adapter = new FixtureAgentAdapter();

    expect(adapter.provider).toBe('fixture-agent');
    expect(adapter.name).toBe('Fixture Agent');
    expect(adapter.manifest.credentialMode).toBe('local_only');
  });

  it('creates adapter instances through the factory', () => {
    const adapter = createFixtureAgentAdapter();

    expect(adapter).toBeInstanceOf(FixtureAgentAdapter);
  });
});

describe('CodexCliAdapter', () => {
  it('builds a non-interactive Codex exec launch spec', async () => {
    const adapter = new CodexCliAdapter({ cliPath: 'codex-test' });
    const spec = await adapter.buildLaunch({
      cwd: '/repo',
      prompt: 'Review the task',
      env: { DOORWAY_MODEL_ID: 'gpt-5.2' },
    });

    expect(adapter.provider).toBe('codex');
    expect(adapter.manifest.id).toBe('codex-cli');
    expect(spec.command).toBe('codex-test');
    expect(spec.args).toEqual([
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-C',
      '/repo',
      '--model',
      'gpt-5.2',
      '--',
      'Review the task',
    ]);
    expect(spec.cwd).toBe('/repo');
  });
});

describe('ClaudeCodeAdapter', () => {
  it('builds an interactive Claude Code launch spec for a Doorway-owned PTY', async () => {
    const adapter = new ClaudeCodeAdapter({ cliPath: 'claude-test' });
    const spec = await adapter.buildLaunch({
      cwd: '/repo',
      prompt: 'Implement the task',
      env: { DOORWAY_MODEL_ID: 'claude-sonnet-4-6' },
    });

    expect(adapter.provider).toBe('claude');
    expect(adapter.manifest.id).toBe('claude-code-cli');
    expect(spec.command).toBe('claude-test');
    expect(spec.args).toEqual(['--model', 'claude-sonnet-4-6', 'Implement the task']);
    expect(spec.args).not.toContain('--print');
    expect(spec.args).not.toContain('--no-input');
    expect(spec.cwd).toBe('/repo');
  });
});

describe('BaseAdapter', () => {
  class TestAdapter extends BaseAdapter {
    readonly id = 'test' as import('@doorway/protocol').AdapterId;
    readonly displayName = 'Test';
    readonly capabilities = {
      supportsImages: false,
      supportsFilePaths: false,
      supportsStructuredOutput: false,
      supportsResume: false,
      supportsApprovalPrompts: false,
    };

    detectInstalled() {
      return Promise.resolve({ installed: true });
    }

    buildLaunch() {
      return Promise.resolve({ command: 'test', args: [], cwd: '/', env: {} });
    }

    buildInitialPrompt() {
      return Promise.resolve('');
    }

    buildFollowupPrompt() {
      return Promise.resolve('');
    }
  }

  it('detects exit-code completion', () => {
    const adapter = new TestAdapter();
    const result = adapter.detectCompletion({ output: '', exitCode: 0 });

    expect(result.isComplete).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toContain('Exit code 0');
  });

  it('detects completion patterns', () => {
    const adapter = new TestAdapter();
    const result = adapter.detectCompletion({ output: 'All tests passed. Done.' });

    expect(result.isComplete).toBe(true);
  });

  it('returns incomplete for a running process', () => {
    const adapter = new TestAdapter();
    const result = adapter.detectCompletion({ output: 'Still running...' });

    expect(result.isComplete).toBe(false);
  });

  it('returns no input needed by default', () => {
    const adapter = new TestAdapter();
    const result = adapter.detectNeedsInput({ output: 'Running...' });

    expect(result.needsInput).toBe(false);
  });
});
