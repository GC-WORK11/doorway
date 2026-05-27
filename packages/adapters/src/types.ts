/**
 * Adapter Types
 */

import type {
  AdapterId,
  AgentCapabilities,
  AgentRole,
  AgentRunId,
  TerminalSessionId,
  TerminalEvent,
  TranscriptChunk,
  ContextPacket,
  ProjectKnowledge,
  AdapterId as ProtocolAdapterId,
} from '@doorway/protocol';

export interface AdapterContext {
  projectPath: string;
  workingDirectory: string;
}

export interface DetectionResult {
  installed: boolean;
  version?: string;
  path?: string;
}

export interface LaunchSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Record<string, string>;
  /** Prompt to send via stdin instead of as command-line argument. */
  stdinPrompt?: string;
}

export interface ParseContext {
  chunk: TranscriptChunk;
  buffer: string;
}

export interface TerminalSnapshot {
  output: string;
  exitCode?: number;
}

export interface NeedInputResult {
  needsInput: boolean;
  prompt?: string;
}

export interface CompletionResult {
  isComplete: boolean;
  exitCode?: number;
  reason?: string;
}

export interface PromptContext {
  task: ContextPacket;
  role: AgentRole;
  knowledge: ProjectKnowledge;
  previousRuns?: readonly {
    runId: AgentRunId;
    role: AgentRole;
    status: string;
    exitCode?: number;
  }[];
}

export interface FollowupContext {
  task: ContextPacket;
  role: AgentRole;
  knowledge: ProjectKnowledge;
  transcript: readonly TranscriptChunk[];
  pendingApproval?: string;
}

export interface AgentAdapter {
  readonly id: AdapterId;
  readonly displayName: string;
  readonly capabilities: AgentCapabilities;

  detectInstalled(ctx: AdapterContext): Promise<DetectionResult>;
  buildLaunch(ctx: LaunchContext): Promise<LaunchSpec>;
  buildInitialPrompt(ctx: PromptContext): Promise<string>;
  buildFollowupPrompt(ctx: FollowupContext): Promise<string>;
  parseTerminalChunk(ctx: ParseContext): readonly TerminalEvent[];
  detectNeedsInput(ctx: TerminalSnapshot): NeedInputResult;
  detectCompletion(ctx: TerminalSnapshot): CompletionResult;
}

export interface LaunchContext {
  prompt?: string;
  command?: string;
  args?: readonly string[];
  cwd: string;
  env?: Record<string, string>;
}

// ============================================================================
// Orchestrator Agent Interface
// ============================================================================

export interface LaunchResult {
  readonly success: boolean;
  readonly sessionId: string;
}

export interface AgentEvent {
  readonly type: 'stdout' | 'stderr' | 'exit' | 'tool_use' | 'thinking' | 'error';
  readonly data: string;
  readonly timestamp: Date;
}

export type RuntimeMode =
  | 'Visible CLI'
  | 'Local CLI'
  | 'API Mode'
  | 'Local Agent'
  | 'User-Controlled';

export interface AdapterManifest {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly runtimeMode: RuntimeMode;
  readonly executionSurface: 'visible_terminal' | 'embedded_pty' | 'api' | 'cloud';
  readonly credentialMode: 'provider_owned' | 'user_api_key' | 'local_only';
}

/**
 * Lightweight agent adapter interface for the orchestrator.
 * This is simpler than the full AgentAdapter interface above.
 */
export interface IAgentAdapter {
  readonly provider: string;
  readonly name: string;
  readonly manifest: AdapterManifest;

  buildLaunch(context: LaunchContext): Promise<LaunchSpec>;
  onEvent(callback: (event: AgentEvent) => void): () => void;
}
