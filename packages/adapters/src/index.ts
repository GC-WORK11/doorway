/**
 * Doorway Agent Adapters
 *
 * Pluggable adapter system for different CLI agents.
 * Each adapter handles:
 * - Detection of whether the agent is installed
 * - Building launch commands
 * - Parsing terminal output
 * - Detecting completion/approval requests
 */

export * from './types.js';
export * from './base-adapter.js';
export { GenericCliAdapter, type GenericCliConfig } from './generic-cli-adapter.js';
export * from './fixture-agent-adapter.js';
export { ClaudeCodeAdapter, type ClaudeCodeConfig } from './claude-code-adapter.js';
export { CursorAdapter, type CursorConfig } from './cursor-adapter.js';
export { GeminiAdapter, type GeminiConfig } from './gemini-adapter.js';
export { CodexCliAdapter, type CodexCliConfig } from './codex-cli-adapter.js';
