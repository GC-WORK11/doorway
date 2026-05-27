/**
 * Doorway Protocol Types
 * Core type definitions for Doorway thread model, agent runs, terminal sessions, worktrees, events, and handoffs.
 * These types are the source of truth for the Doorway-owned thread model.
 */

// ============================================================================
// Core Identifiers
// ============================================================================

export type ThreadId = string & { readonly brand: unique symbol };
export type MessageId = string & { readonly brand: unique symbol };
export type AgentRunId = string & { readonly brand: unique symbol };
export type TerminalSessionId = string & { readonly brand: unique symbol };
export type WorktreeId = string & { readonly brand: unique symbol };
export type EventId = string & { readonly brand: unique symbol };
export type FileChangeId = string & { readonly brand: unique symbol };
export type HandoffCapsuleId = string & { readonly brand: unique symbol };
export type ProjectId = string & { readonly brand: unique symbol };
export type TaskId = string & { readonly brand: unique symbol };

// ============================================================================
// Thread Model
// ============================================================================

export type ThreadStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface DoorwayThread {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly status: ThreadStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly messages: readonly DoorwayMessage[];
  readonly events: readonly DoorwayEvent[];
  readonly agentRuns: readonly AgentRun[];
  readonly metadata: ThreadMetadata;
}

export interface ThreadMetadata {
  readonly goal: string;
  readonly initialContext?: ContextPacket;
  readonly tags: readonly string[];
  readonly permissionMode: PermissionMode;
}

export interface DoorwayMessage {
  readonly id: MessageId;
  readonly threadId: ThreadId;
  readonly role: MessageRole;
  readonly content: string;
  readonly attachments: readonly Attachment[];
  readonly createdAt: Date;
  readonly provider?: ProviderId;
  readonly model?: string;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'agent';

export interface Attachment {
  readonly type: 'image' | 'file' | 'diff' | 'test-result';
  readonly path?: string;
  readonly url?: string;
  readonly content?: string;
  readonly mimeType?: string;
}

// ============================================================================
// Agent Runs
// ============================================================================

export type AgentRunStatus =
  | 'created'
  | 'worktree_ready'
  | 'terminal_launched'
  | 'prompt_sent'
  | 'running'
  | 'waiting_for_user'
  | 'approval_required'
  | 'command_running'
  | 'files_changed'
  | 'tests_running'
  | 'needs_retry'
  | 'done'
  | 'review_ready'
  | 'merged'
  | 'discarded'
  | 'archived'
  | 'failed'
  | 'crashed'
  | 'cancelled';

export type AgentRole =
  | 'architect'
  | 'backend'
  | 'frontend'
  | 'tester'
  | 'reviewer'
  | 'integration'
  | 'debugger'
  | 'custom';

export type AgentLaunchMode = '/plan' | '/debug' | '/build' | '/review' | '/test';
export type AgentPermissionProfile = 'ask-writes' | 'worktree-only' | 'review-first';
export type AgentWorktreeStrategy = 'auto-worktree' | 'fork-current' | 'selected-worktree';
export type AgentPtyMode = 'doorway-pty' | 'external-pty' | 'protocol';

export interface AgentLaunchOptions {
  readonly mode: AgentLaunchMode;
  readonly permissionProfile: AgentPermissionProfile;
  readonly worktreeStrategy: AgentWorktreeStrategy;
  readonly ptyMode: AgentPtyMode;
  readonly modelId?: string;
}

export interface AgentRun {
  readonly id: AgentRunId;
  readonly threadId: ThreadId;
  readonly taskId: TaskId;
  readonly role: AgentRole;
  readonly adapterId: AdapterId;
  readonly worktreeId?: WorktreeId;
  readonly terminalSessionId?: TerminalSessionId;
  readonly status: AgentRunStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly exitCode?: number;
  readonly summary?: string;
  readonly fileChanges: readonly FileChange[];
  readonly transcript: readonly TranscriptChunk[];
}

export interface AgentCapabilities {
  readonly supportsImages: boolean;
  readonly supportsFilePaths: boolean;
  readonly supportsStructuredOutput: boolean;
  readonly supportsResume: boolean;
  readonly supportsApprovalPrompts: boolean;
}

export type AdapterId = string & { readonly brand: unique symbol };

// ============================================================================
// Terminal Sessions
// ============================================================================

export type TerminalSessionStatus =
  | 'created'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'stopped'
  | 'detached'
  | 'crashed';

export type TerminalRuntime = 'pty' | 'tmux' | 'conpty' | 'external';

export interface TerminalSession {
  readonly id: TerminalSessionId;
  readonly agentRunId: AgentRunId;
  readonly runtime: TerminalRuntime;
  readonly status: TerminalSessionStatus;
  readonly workingDirectory: string;
  readonly command?: string;
  readonly pid?: number;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly stoppedAt?: Date;
}

export interface TranscriptChunk {
  readonly sessionId: TerminalSessionId;
  readonly sequence: number;
  readonly timestamp: Date;
  readonly text: string;
  readonly rawText?: string;
  readonly cleanText?: string;
  readonly controlEvents?: readonly TerminalControlEvent[];
  readonly screenSnapshot?: TerminalScreenSnapshot;
  readonly stateDetection?: TerminalStateDetection;
  readonly isStdout: boolean;
  readonly isStderr: boolean;
}

export type TerminalControlEvent =
  | { readonly type: 'csi'; readonly sequence: string; readonly final: string }
  | { readonly type: 'osc'; readonly sequence: string }
  | { readonly type: 'dcs'; readonly sequence: string }
  | { readonly type: 'escape'; readonly sequence: string }
  | { readonly type: 'erase_line'; readonly sequence: string }
  | { readonly type: 'erase_display'; readonly sequence: string }
  | {
      readonly type: 'screen_buffer';
      readonly sequence: string;
      readonly buffer: 'main' | 'alternate';
      readonly active: boolean;
    }
  | { readonly type: 'carriage_return' }
  | { readonly type: 'newline' }
  | { readonly type: 'bell' };

export interface TerminalScreenSnapshot {
  readonly buffer: 'main' | 'alternate';
  readonly cursorRow: number;
  readonly cursorCol: number;
  readonly visibleText: string;
  readonly alternateText?: string;
}

export type TerminalSemanticState =
  | 'unknown'
  | 'awaiting_input'
  | 'thinking'
  | 'outputting'
  | 'complete'
  | 'stuck'
  | 'failed';

export interface TerminalStateDetection {
  readonly state: TerminalSemanticState;
  readonly provider: 'claude' | 'codex' | 'generic';
  readonly confidence: number;
  readonly reason: string;
  readonly signals: readonly string[];
  readonly confirmed?: boolean;
  readonly confirmationSignals?: readonly string[];
}

export type TerminalExitKind =
  | 'success'
  | 'general_error'
  | 'usage_error'
  | 'permission_denied'
  | 'command_not_found'
  | 'interrupted'
  | 'terminated'
  | 'killed'
  | 'segmentation_fault'
  | 'aborted'
  | 'signal'
  | 'unknown';

export interface TerminalExitClassification {
  readonly kind: TerminalExitKind;
  readonly label: string;
  readonly summary: string;
  readonly recommendation: string;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly signalNumber?: number;
}

export type ProcessSnapshotPhase = 'started' | 'running' | 'stopped';

export interface ProcessSnapshotNode {
  readonly pid: number;
  readonly ppid: number;
  readonly command: string;
  readonly args: string;
  readonly cpuPercent?: number;
  readonly memoryPercent?: number;
}

export interface ProcessSnapshotProjection {
  readonly id: string;
  readonly sessionId: TerminalSessionId;
  readonly phase: ProcessSnapshotPhase;
  readonly rootPid: number;
  readonly capturedAt: Date;
  readonly nodes: readonly ProcessSnapshotNode[];
}

export type TerminalFileDeltaPhase = 'baseline' | 'running' | 'stopped';
export type TerminalFileDeltaChangeType = 'created' | 'modified' | 'deleted';

export interface TerminalFileDeltaEntry {
  readonly path: string;
  readonly changeType: TerminalFileDeltaChangeType;
  readonly previousSize?: number;
  readonly currentSize?: number;
}

export interface TerminalFileDeltaSnapshotProjection {
  readonly id: string;
  readonly sessionId: TerminalSessionId;
  readonly phase: TerminalFileDeltaPhase;
  readonly rootPath: string;
  readonly capturedAt: Date;
  readonly changes: readonly TerminalFileDeltaEntry[];
}

// ============================================================================
// Worktrees
// ============================================================================

export type WorktreeStatus = 'created' | 'active' | 'archived' | 'error';

export interface Worktree {
  readonly id: WorktreeId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly agentRunId?: AgentRunId;
  readonly path: string;
  readonly branch: string;
  readonly status: WorktreeStatus;
  readonly createdAt: Date;
  readonly archivedAt?: Date;
  readonly fileChanges: readonly FileChange[];
}

export interface WorktreeCreateParams {
  readonly projectPath: string;
  readonly taskId: TaskId;
  readonly branchName: string;
  readonly worktreePath: string;
}

// ============================================================================
// Events (Event Sourcing)
// ============================================================================

export type EventType =
  | 'thread.created'
  | 'thread.status_changed'
  | 'thread.compacted'
  | 'thread.replay_exported'
  | 'thread.replay_verification_succeeded'
  | 'thread.replay_verification_failed'
  | 'message.appended'
  | 'agent_run.created'
  | 'agent_run.status_changed'
  | 'agent_run.completed'
  | 'terminal.created'
  | 'terminal.started'
  | 'terminal.input'
  | 'terminal.output'
  | 'terminal.state'
  | 'terminal.stopped'
  | 'process.snapshot_captured'
  | 'process.snapshot_failed'
  | 'terminal.file_delta_captured'
  | 'terminal.file_delta_failed'
  | 'agent.attention'
  | 'completion.confidence_updated'
  | 'clarification.requested'
  | 'clarification.answered'
  | 'test.started'
  | 'test.finished'
  | 'diff.updated'
  | 'worktree.created'
  | 'worktree.archived'
  | 'worktree.rollback_patch_exported'
  | 'file_change.detected'
  | 'task_graph.updated'
  | 'handoff.created'
  | 'handoff.used'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'merge.started'
  | 'merge.evaluated'
  | 'merge.completed'
  | 'merge.conflict'
  | 'browser.action'
  | 'browser.bundle_exported'
  | 'unified_thread.session_created'
  | 'unified_thread.agents_registered'
  | 'unified_thread.agent_started'
  | 'unified_thread.completed'
  | 'unified_thread.synthesis_created';

export interface DoorwayEvent {
  readonly id: EventId;
  readonly threadId: ThreadId;
  readonly type: EventType;
  readonly payload: EventPayload;
  readonly timestamp: Date;
  readonly sequence: number;
}

export type EventPayload =
  | ThreadCreatedPayload
  | ThreadStatusChangedPayload
  | ThreadCompactedPayload
  | ThreadReplayExportedPayload
  | ThreadReplayVerificationSucceededPayload
  | ThreadReplayVerificationFailedPayload
  | MessageAppendedPayload
  | AgentRunCreatedPayload
  | AgentRunStatusChangedPayload
  | AgentRunCompletedPayload
  | TerminalCreatedPayload
  | TerminalStartedPayload
  | TerminalInputPayload
  | TerminalOutputPayload
  | TerminalStatePayload
  | TerminalStoppedPayload
  | ProcessSnapshotCapturedPayload
  | ProcessSnapshotFailedPayload
  | TerminalFileDeltaCapturedPayload
  | TerminalFileDeltaFailedPayload
  | AgentAttentionPayload
  | CompletionConfidenceUpdatedPayload
  | ClarificationRequestedPayload
  | ClarificationAnsweredPayload
  | TestStartedPayload
  | TestFinishedPayload
  | DiffUpdatedPayload
  | WorktreeCreatedPayload
  | WorktreeArchivedPayload
  | WorktreeRollbackPatchExportedPayload
  | FileChangeDetectedPayload
  | TaskGraphUpdatedPayload
  | HandoffCreatedPayload
  | HandoffUsedPayload
  | ApprovalRequestedPayload
  | ApprovalGrantedPayload
  | ApprovalDeniedPayload
  | MergeStartedPayload
  | MergeEvaluatedPayload
  | MergeCompletedPayload
  | MergeConflictPayload
  | BrowserBundleExportedPayload
  | UnifiedThreadSessionCreatedPayload
  | UnifiedThreadAgentsRegisteredPayload
  | UnifiedThreadAgentStartedPayload
  | UnifiedThreadCompletedPayload
  | UnifiedThreadSynthesisCreatedPayload;

export interface ThreadCreatedPayload {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly goal: string;
}

export interface BrowserBundleExportedPayload {
  readonly path: string;
  readonly actionCount: number;
  readonly screenshotCount: number;
  readonly createdAt: string;
}

export interface ToolCapabilityProjection {
  readonly id: string;
  readonly name: string;
  readonly surface: 'agent' | 'browser' | 'terminal' | 'worktree' | 'evidence';
  readonly status: 'available' | 'requires_project' | 'requires_thread';
  readonly enabled: boolean;
  readonly permissions: readonly string[];
  readonly evidence: readonly string[];
}

export interface ProjectPluginProjection {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly manifestPath: string;
  readonly status: 'ready' | 'invalid';
  readonly capabilities: readonly string[];
  readonly filesystemRead: readonly string[];
  readonly filesystemWrite: readonly string[];
  readonly networkHosts: readonly string[];
  readonly entryCommand?: string;
  readonly problem?: string;
}

export type ToolLaneRole =
  | 'implementer'
  | 'reviewer'
  | 'browser'
  | 'tester'
  | 'connector'
  | 'automation'
  | 'custom';

export type ToolLaneStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'needs_approval'
  | 'stuck'
  | 'reviewable'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface ToolLaneProjection {
  readonly id: AgentRunId;
  readonly threadId: ThreadId;
  readonly taskId: TaskId;
  readonly runId: AgentRunId;
  readonly toolId: AdapterId;
  readonly role: ToolLaneRole;
  readonly runRole: AgentRole;
  readonly status: ToolLaneStatus;
  readonly terminalSessionId?: TerminalSessionId;
  readonly worktreeId?: WorktreeId;
  readonly latestActivity: string;
  readonly latestActivityAt: Date;
}

export interface ThreadStatusChangedPayload {
  readonly threadId: ThreadId;
  readonly previousStatus: ThreadStatus;
  readonly newStatus: ThreadStatus;
}

export interface ThreadCompactedPayload {
  readonly checkpointId: string;
  readonly threadId: ThreadId;
  readonly terminalSessionIds: readonly TerminalSessionId[];
  readonly createdAt: string;
}

export interface ThreadReplayExportedPayload {
  readonly path: string;
  readonly eventCount: number;
  readonly createdAt: string;
}

export interface ThreadReplayVerificationSucceededPayload {
  readonly path: string;
  readonly eventCount: number;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly threadIds: readonly ThreadId[];
  readonly createdAt: string;
}

export interface ThreadReplayVerificationFailedPayload {
  readonly path: string;
  readonly error: string;
  readonly createdAt: string;
}

export interface MessageAppendedPayload {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly role: MessageRole;
  readonly content: string;
  readonly provider?: ProviderId;
}

export interface AgentRunCreatedPayload {
  readonly runId: AgentRunId;
  readonly threadId: ThreadId;
  readonly taskId: TaskId;
  readonly role: AgentRole;
  readonly adapterId: AdapterId;
  readonly worktreeId?: WorktreeId;
  readonly launchOptions?: AgentLaunchOptions;
  readonly memorySources?: readonly ProjectMemorySource[];
}

export interface ProjectMemorySource {
  readonly sourceFile: string;
  readonly category: 'rule' | 'knowledge' | 'instruction';
  readonly contentLength: number;
}

export interface TaskGraphUpdatedPayload {
  readonly taskId: TaskId;
  readonly nodeId: string;
  readonly previousStatus: TaskNodeStatus;
  readonly newStatus: TaskNodeStatus;
  readonly assignedRunId?: AgentRunId;
  readonly graphStatus?: TaskGraphStatus;
}

export interface AgentRunStatusChangedPayload {
  readonly runId: AgentRunId;
  readonly previousStatus: AgentRunStatus;
  readonly newStatus: AgentRunStatus;
  readonly reason?: string;
}

export interface AgentRunCompletedPayload {
  readonly runId: AgentRunId;
  readonly exitCode?: number;
  readonly summary?: string;
  readonly fileChangesCount: number;
}

export interface TerminalCreatedPayload {
  readonly sessionId: TerminalSessionId;
  readonly agentRunId: AgentRunId;
  readonly runtime: TerminalRuntime;
  readonly command?: string;
}

export interface TerminalStartedPayload {
  readonly sessionId: TerminalSessionId;
  readonly pid: number;
}

export type TerminalInputSource = 'user' | 'permission_decision' | 'doorway';

export const TERMINAL_ENTER = '\r';

export function terminalSubmitInput(text: string): string {
  return `${text}${TERMINAL_ENTER}`;
}

export function terminalSubmitLines(lines: readonly string[]): string {
  return lines.map((line) => terminalSubmitInput(line)).join('');
}

export interface TerminalInputPayload {
  readonly sessionId: TerminalSessionId;
  readonly sequence: number;
  readonly text: string;
  readonly source: TerminalInputSource;
}

export interface TerminalOutputPayload {
  readonly sessionId: TerminalSessionId;
  readonly sequence: number;
  readonly text: string;
  readonly rawText?: string;
  readonly cleanText?: string;
  readonly controlEvents?: readonly TerminalControlEvent[];
  readonly screenSnapshot?: TerminalScreenSnapshot;
  readonly stateDetection?: TerminalStateDetection;
  readonly isStdout: boolean;
  readonly isStderr: boolean;
}

export interface TerminalStatePayload {
  readonly sessionId: TerminalSessionId;
  readonly agentRunId?: AgentRunId;
  readonly detection: TerminalStateDetection;
  readonly source: 'terminal_output' | 'silence_confirmation' | 'process_exit';
  readonly outputPreview?: string;
}

export interface TerminalStoppedPayload {
  readonly sessionId: TerminalSessionId;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly exitClassification?: TerminalExitClassification;
}

export interface ProcessSnapshotCapturedPayload {
  readonly snapshotId: string;
  readonly sessionId: TerminalSessionId;
  readonly phase: ProcessSnapshotPhase;
  readonly rootPid: number;
  readonly processCount: number;
}

export interface ProcessSnapshotFailedPayload {
  readonly sessionId: TerminalSessionId;
  readonly phase: ProcessSnapshotPhase;
  readonly rootPid: number;
  readonly reason: string;
}

export interface TerminalFileDeltaCapturedPayload {
  readonly snapshotId: string;
  readonly sessionId: TerminalSessionId;
  readonly phase: TerminalFileDeltaPhase;
  readonly rootPath: string;
  readonly changeCount: number;
}

export interface TerminalFileDeltaFailedPayload {
  readonly sessionId: TerminalSessionId;
  readonly phase: TerminalFileDeltaPhase;
  readonly rootPath: string;
  readonly reason: string;
}

export type AgentAttentionState =
  | 'running'
  | 'needs_input'
  | 'needs_approval'
  | 'quiet'
  | 'possibly_stuck'
  | 'stuck'
  | 'completed'
  | 'failed';

export type CompletionRecommendedState =
  | 'still_running'
  | 'waiting_for_user'
  | 'probably_done'
  | 'done'
  | 'failed'
  | 'unknown';

export interface AgentAttentionPayload {
  readonly sessionId: TerminalSessionId;
  readonly agentRunId?: AgentRunId;
  readonly state: AgentAttentionState;
  readonly source: 'terminal_output' | 'process_exit';
  readonly reason: string;
  readonly outputPreview?: string;
}

export interface CompletionConfidenceUpdatedPayload {
  readonly sessionId: TerminalSessionId;
  readonly agentRunId?: AgentRunId;
  readonly score: number;
  readonly recommendedState: CompletionRecommendedState;
  readonly signals: readonly string[];
}

export interface ClarificationRequestedPayload {
  readonly clarificationId: string;
  readonly threadId: ThreadId;
  readonly runId: AgentRunId;
  readonly sessionId: TerminalSessionId;
  readonly question: string;
  readonly context: string;
  readonly suggestedResponses?: readonly string[];
  readonly requestedAt: string;
}

export interface ClarificationAnsweredPayload {
  readonly clarificationId: string;
  readonly threadId: ThreadId;
  readonly runId: AgentRunId;
  readonly sessionId: TerminalSessionId;
  readonly answer: string;
  readonly answeredAt: string;
}

export interface TestStartedPayload {
  readonly proofId: string;
  readonly terminalSessionId: TerminalSessionId;
  readonly command: string;
}

export interface TestFinishedPayload {
  readonly proofId: string;
  readonly terminalSessionId: TerminalSessionId;
  readonly status: TestStatus;
  readonly exitCode?: number;
  readonly summary?: string;
}

export interface DiffUpdatedPayload {
  readonly worktreeId?: WorktreeId;
  readonly path: string;
  readonly filesChanged: number;
  readonly totalAdditions: number;
  readonly totalDeletions: number;
}

export interface WorktreeCreatedPayload {
  readonly worktreeId: WorktreeId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly path: string;
  readonly branch: string;
  readonly parentWorktreeId?: WorktreeId;
  readonly baseBranch?: string;
}

export interface WorktreeArchivedPayload {
  readonly worktreeId: WorktreeId;
  readonly path?: string;
  readonly branch?: string;
  readonly branchDeleted?: boolean;
  readonly reason?: string;
}

export interface WorktreeRollbackPatchExportedPayload {
  readonly worktreeId: WorktreeId;
  readonly path: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly patchBytes: number;
  readonly createdAt: string;
}

export interface FileChangeDetectedPayload {
  readonly fileChangeId: FileChangeId;
  readonly worktreeId: WorktreeId;
  readonly agentRunId: AgentRunId;
  readonly path: string;
  readonly changeType: FileChangeType;
}

export interface HandoffCreatedPayload {
  readonly capsuleId: HandoffCapsuleId;
  readonly threadId: ThreadId;
  readonly sourceRunId: AgentRunId;
  readonly targetProvider?: ProviderId;
}

export interface HandoffUsedPayload {
  readonly capsuleId: HandoffCapsuleId;
  readonly threadId: ThreadId;
  readonly action: 'copy_next_prompt' | 'open_worktree' | 'open_changed_file';
  readonly worktreePath?: string;
  readonly filePath?: string;
}

export interface ApprovalRequestedPayload {
  readonly runId: AgentRunId;
  readonly prompt: string;
  readonly requiresUserInput: boolean;
}

export interface ApprovalGrantedPayload {
  readonly runId?: AgentRunId;
  readonly receiptId?: string;
  readonly taskId?: TaskId;
  readonly command?: string;
  readonly riskCategory?: string;
  readonly userResponse?: string;
}

export interface ApprovalDeniedPayload {
  readonly runId?: AgentRunId;
  readonly receiptId?: string;
  readonly taskId?: TaskId;
  readonly command?: string;
  readonly riskCategory?: string;
  readonly reason?: string;
}

export interface MergeStartedPayload {
  readonly taskId: TaskId;
  readonly integrationBranch: string;
  readonly branches: readonly string[];
}

export interface MergeEvaluatedPayload {
  readonly assessmentId: string;
  readonly taskId: TaskId;
  readonly score: MergeSafetyScore;
  readonly reason: string;
}

export interface MergeCompletedPayload {
  readonly taskId: TaskId;
  readonly integrationBranch: string;
  readonly mergedBranches: readonly string[];
  readonly conflicts: readonly string[];
}

export interface MergeConflictPayload {
  readonly taskId: TaskId;
  readonly file: string;
  readonly conflictDetails: string;
}

// ============================================================================
// Unified Thread Payloads
// ============================================================================

export interface UnifiedThreadSessionCreatedPayload {
  readonly sessionId: string;
  readonly threadId: ThreadId;
  readonly goal: string;
  readonly mode: 'parallel' | 'sequential';
}

export interface UnifiedThreadAgentsRegisteredPayload {
  readonly sessionId: string;
  readonly agentIds: readonly string[];
  readonly agentCount: number;
}

export interface UnifiedThreadAgentStartedPayload {
  readonly sessionId: string;
  readonly agentId: string;
  readonly displayName: string;
}

export interface UnifiedThreadCompletedPayload {
  readonly sessionId: string;
  readonly status: 'completed' | 'partial';
  readonly synthesisCreated: boolean;
}

export interface UnifiedThreadSynthesisCreatedPayload {
  readonly sessionId: string;
  readonly summary: string;
  readonly agentCount: number;
}

export type FileChangeType = 'created' | 'modified' | 'deleted' | 'renamed';

export interface FileChange {
  readonly id: FileChangeId;
  readonly worktreeId: WorktreeId;
  readonly agentRunId: AgentRunId;
  readonly path: string;
  readonly changeType: FileChangeType;
  readonly diff?: string;
  readonly detectedAt: Date;
}

// ============================================================================
// Handoff Capsules
// ============================================================================

export interface HandoffCapsule {
  readonly id: HandoffCapsuleId;
  readonly threadId: ThreadId;
  readonly sourceRunId: AgentRunId;
  readonly targetProvider?: ProviderId;
  readonly createdAt: Date;
  readonly summary: ThreadSummary;
  readonly latestIntent: string;
  readonly runSummary: RunSummary;
  readonly worktreePath?: string;
  readonly branch?: string;
  readonly changedFiles: readonly string[];
  readonly diffSummary: string;
  readonly testStatus?: TestStatus;
  readonly openQuestions: readonly string[];
  readonly nextPrompt: string;
}

export interface ThreadSummary {
  readonly threadId: ThreadId;
  readonly title: string;
  readonly messageCount: number;
  readonly agentRunCount: number;
  readonly duration?: number;
}

export interface RunSummary {
  readonly runId: AgentRunId;
  readonly role: AgentRole;
  readonly adapterId: AdapterId;
  readonly status: AgentRunStatus;
  readonly exitCode?: number;
  readonly filesChanged: number;
  readonly testsPassed?: boolean;
}

export type TestStatus = 'pass' | 'fail' | 'pending' | 'skipped' | 'unknown';

// ============================================================================
// Context & Knowledge
// ============================================================================

export interface ContextPacket {
  readonly goal: string;
  readonly roleScope?: string;
  readonly worktreePath?: string;
  readonly relevantFiles: readonly string[];
  readonly projectCommands: ProjectCommands;
  readonly safetyBoundaries: SafetyBoundaries;
  readonly doneCriteria: string;
  readonly summaryInstructions: string;
}

export interface ProjectCommands {
  readonly install: string;
  readonly build: string;
  readonly test: string;
  readonly lint: string;
  readonly dev?: string;
  readonly typecheck?: string;
}

export interface SafetyBoundaries {
  readonly allowedPaths: readonly string[];
  readonly deniedPaths: readonly string[];
  readonly deniedCommands: readonly string[];
  readonly requireApproval: readonly string[];
}

export type PermissionMode = 'open' | 'restricted' | 'locked';

// ============================================================================
// Providers
// ============================================================================

export type ProviderId = string & { readonly brand: unique symbol };

export interface Provider {
  readonly id: ProviderId;
  readonly name: string;
  readonly adapterId: AdapterId;
  readonly defaultModel?: string;
  readonly apiKeyEnvVar?: string;
}

// ============================================================================
// Terminal Events (from Terminal Runtime)
// ============================================================================

export type TerminalEvent =
  | { readonly type: 'terminal_output'; readonly text: string }
  | { readonly type: 'assistant_message'; readonly text: string }
  | { readonly type: 'command_detected'; readonly command: string }
  | { readonly type: 'file_change'; readonly path: string; readonly diff_id: FileChangeId }
  | { readonly type: 'approval_needed'; readonly prompt: string }
  | { readonly type: 'blocked'; readonly reason: string }
  | { readonly type: 'test_result'; readonly status: TestStatus; readonly summary: string }
  | { readonly type: 'run_complete'; readonly summary: string }
  | { readonly type: 'error'; readonly message: string };

// ============================================================================
// Adapter Interface
// ============================================================================

export interface TerminalAgentAdapter {
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

export interface AdapterContext {
  readonly projectPath: string;
  readonly workingDirectory: string;
}

export interface DetectionResult {
  readonly installed: boolean;
  readonly version?: string;
  readonly path?: string;
}

export interface LaunchContext {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly env?: Record<string, string>;
}

export interface LaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
}

export interface PromptContext {
  readonly task: ContextPacket;
  readonly role: AgentRole;
  readonly knowledge: ProjectKnowledge;
  readonly previousRuns?: readonly AgentRunSummary[];
}

export interface FollowupContext {
  readonly task: ContextPacket;
  readonly role: AgentRole;
  readonly knowledge: ProjectKnowledge;
  readonly transcript: readonly TranscriptChunk[];
  readonly pendingApproval?: string;
}

export interface ProjectKnowledge {
  readonly framework?: string;
  readonly packageManager: PackageManager;
  readonly projectCommands: ProjectCommands;
  readonly testCommand: string;
  readonly importantFiles: readonly string[];
  readonly excludePatterns: readonly string[];
}

export type PackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'cargo'
  | 'poetry'
  | 'pip'
  | 'unknown';

export type ProjectMode = 'git' | 'non_git';

// ============================================================================
// Renderer Projections
// ============================================================================

export type EvidenceKind =
  | 'message'
  | 'event'
  | 'run'
  | 'terminal'
  | 'worktree'
  | 'diff'
  | 'test'
  | 'permission'
  | 'merge'
  | 'handoff'
  | 'compact'
  | 'mesh';

export interface EvidenceRef {
  readonly kind: EvidenceKind;
  readonly id: string;
  readonly label: string;
}

export interface ProjectProjection {
  readonly id: ProjectId;
  readonly path: string;
  readonly name: string;
  readonly mode: ProjectMode;
  readonly packageManager: PackageManager;
  readonly framework?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface ThreadProjection {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly status: ThreadStatus;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  readonly messageCount?: number;
  readonly runCount?: number;
}

export interface MessageProjection {
  readonly id: MessageId;
  readonly threadId?: ThreadId;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: Date;
  readonly provider?: ProviderId;
  readonly model?: string;
  readonly evidence?: readonly EvidenceRef[];
}

export interface AgentRunProjection {
  readonly id: AgentRunId;
  readonly threadId: ThreadId;
  readonly status: AgentRunStatus;
  readonly role?: AgentRole;
  readonly provider?: ProviderId;
  readonly model?: string;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly exitCode?: number;
  readonly summary?: string;
  readonly evidence: readonly EvidenceRef[];
}

export type TaskNodeStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TaskGraphMode = 'parallel' | 'sequential';
export type TaskGraphStatus = 'planned' | 'running' | 'completed' | 'failed';

export interface TaskNodeProjection {
  readonly id: string;
  readonly taskId: TaskId;
  readonly role: string;
  readonly status: TaskNodeStatus;
  readonly agentTarget?: string;
  readonly worktreePolicy: 'isolated' | 'shared';
  readonly acceptanceCriteria?: string;
  readonly assignedRunId?: AgentRunId;
}

export interface TaskEdgeProjection {
  readonly id: string;
  readonly taskId: TaskId;
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

export interface TaskGraphProjection {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  readonly goal: string;
  readonly mode: TaskGraphMode;
  readonly status: TaskGraphStatus;
  readonly createdAt: Date;
  readonly nodes: readonly TaskNodeProjection[];
  readonly edges: readonly TaskEdgeProjection[];
  readonly evidence: readonly EvidenceRef[];
}

export type MeshAgentKind =
  | 'visible_cli'
  | 'doorway_brain'
  | 'browser_supervisor'
  | 'reviewer'
  | 'pi_agent'
  | 'custom';

export type MeshAgentStatus =
  | 'starting'
  | 'running'
  | 'waiting'
  | 'needs_approval'
  | 'blocked'
  | 'done'
  | 'failed';

export type MeshMessageKind =
  | 'question'
  | 'answer'
  | 'verification_request'
  | 'verification_result'
  | 'handoff'
  | 'context_request'
  | 'context_response'
  | 'blocked_notice'
  | 'proposal'
  | 'critique'
  | 'status_update';

export interface MeshMessageProjection {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly fromAgentId: string;
  readonly fromDisplayName: string;
  readonly fromAgentKind: MeshAgentKind;
  readonly toAgentId: string;
  readonly toDisplayName: string;
  readonly toAgentKind: MeshAgentKind;
  readonly kind: MeshMessageKind;
  readonly content: string;
  readonly evidenceRefs: readonly string[];
  readonly status: 'unhandled' | 'handled';
  readonly requiresHumanApproval: boolean;
  readonly createdAt: Date;
  readonly handledAt?: Date;
  readonly evidence: readonly EvidenceRef[];
}

export interface WorktreeProjection {
  readonly id: WorktreeId;
  readonly path: string;
  readonly branch: string;
  readonly status?: WorktreeStatus;
  readonly isMain?: boolean;
  readonly isActive?: boolean;
  readonly isClean?: boolean;
  readonly commit?: string;
  readonly evidence?: readonly EvidenceRef[];
}

export interface TerminalProjection {
  readonly id: TerminalSessionId;
  readonly runId?: AgentRunId;
  readonly runtime: TerminalRuntime;
  readonly status: TerminalSessionStatus;
  readonly workingDirectory: string;
  readonly command?: string;
  readonly pid?: number;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly exitClassification?: TerminalExitClassification;
  readonly latestProcessSnapshot?: ProcessSnapshotProjection;
  readonly latestFileDeltaSnapshot?: TerminalFileDeltaSnapshotProjection;
  readonly lastOutput?: string;
  readonly createdAt: Date;
  readonly evidence?: readonly EvidenceRef[];
}

export interface TerminalInputProjection {
  readonly sessionId: TerminalSessionId;
  readonly sequence: number;
  readonly timestamp: Date;
  readonly text: string;
  readonly source: TerminalInputSource;
}

export interface OperationalCommandPatternProjection {
  readonly memoryId?: string;
  readonly command: string;
  readonly runCount: number;
  readonly sources: readonly TerminalInputSource[];
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly lastSessionId: TerminalSessionId;
  readonly lastSessionStatus: TerminalSessionStatus;
  readonly lastSessionExitLabel?: string;
  readonly isRepeatedWorkflow: boolean;
  readonly isStoredPattern: boolean;
}

export interface OperationalMemoryProjection {
  readonly threadId: ThreadId;
  readonly observedCommands: readonly OperationalCommandPatternProjection[];
  readonly repeatedCommands: readonly OperationalCommandPatternProjection[];
  readonly storedPatternCount: number;
  readonly generatedAt: Date;
}

export interface DiffProjection {
  readonly worktreeId?: WorktreeId;
  readonly files: readonly DiffFile[];
  readonly totalAdditions: number;
  readonly totalDeletions: number;
  readonly evidence?: readonly EvidenceRef[];
}

export interface ProofProjection {
  readonly id: string;
  readonly label: string;
  readonly status: TestStatus;
  readonly command?: string;
  readonly summary?: string;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly evidence: readonly EvidenceRef[];
}

export type PermissionDecision = 'approved' | 'denied';

export interface PermissionReceiptProjection {
  readonly id: string;
  readonly taskId: TaskId;
  readonly runId?: AgentRunId;
  readonly command: string;
  readonly riskCategory: string;
  readonly decision: PermissionDecision;
  readonly userNotes?: string;
  readonly timestamp: Date;
  readonly evidence: readonly EvidenceRef[];
}

export type MergeSafetyScore = 'blocked' | 'risky' | 'reviewable' | 'ready';

export interface MergeAssessmentProjection {
  readonly id: string;
  readonly taskId: TaskId;
  readonly score: MergeSafetyScore;
  readonly reason: string;
  readonly cleanApply: boolean;
  readonly testsPassed: boolean;
  readonly highRiskFiles: readonly string[];
  readonly hasApproval: boolean;
  readonly createdAt: Date;
  readonly evidence: readonly EvidenceRef[];
}

export interface HandoffCapsuleProjection {
  readonly id: HandoffCapsuleId;
  readonly threadId: ThreadId;
  readonly sourceRunId: AgentRunId;
  readonly targetProvider?: ProviderId;
  readonly summary: string;
  readonly latestIntent: string;
  readonly runSummary: string;
  readonly worktreePath?: string;
  readonly branch?: string;
  readonly changedFiles: readonly string[];
  readonly diffSummary: string;
  readonly testStatus?: TestStatus;
  readonly openQuestions: readonly string[];
  readonly nextPrompt: string;
  readonly createdAt: Date;
  readonly evidence: readonly EvidenceRef[];
}

export interface CompactCheckpointProjection {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly originalGoal: string;
  readonly currentStatus: string;
  readonly filesChanged: readonly string[];
  readonly commandsRun: readonly string[];
  readonly tests: readonly string[];
  readonly errors: readonly string[];
  readonly importantLines: readonly string[];
  readonly nextAction: string;
  readonly nextPrompt: string;
  readonly createdAt: Date;
  readonly evidence: readonly EvidenceRef[];
}

export interface ProviderProjection {
  readonly id: ProviderId;
  readonly name: string;
  readonly adapterId: AdapterId;
  readonly defaultModel?: string;
  readonly installed?: boolean;
}

export interface ProviderModelProjection {
  readonly id: string;
  readonly providerProfileId: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly displayName?: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly supportsStreaming: boolean;
  readonly supportsJsonSchema: boolean;
  readonly supportsToolCalling: boolean;
  readonly supportsVision: boolean;
}

export type RuntimeBadgeTone = 'neutral' | 'running' | 'success' | 'warning' | 'danger';

export interface RuntimeBadgeProjection {
  readonly label: string;
  readonly tone: RuntimeBadgeTone;
  readonly evidence?: EvidenceRef;
}

export interface AgentRunSummary {
  readonly runId: AgentRunId;
  readonly role: AgentRole;
  readonly status: AgentRunStatus;
  readonly exitCode?: number;
}

export interface ParseContext {
  readonly chunk: TranscriptChunk;
  readonly buffer: string;
}

export interface TerminalSnapshot {
  readonly output: string;
  readonly exitCode?: number;
}

export interface NeedInputResult {
  readonly needsInput: boolean;
  readonly prompt?: string;
}

export interface CompletionResult {
  readonly isComplete: boolean;
  readonly exitCode?: number;
  readonly reason?: string;
}

// ============================================================================
// Merge & Review
// ============================================================================

export interface MergePlan {
  readonly taskId: TaskId;
  readonly integrationBranch: string;
  readonly baseBranch: string;
  readonly merges: readonly BranchMerge[];
}

export interface BranchMerge {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly status: 'pending' | 'conflict' | 'merged' | 'failed';
  readonly conflicts?: readonly ConflictFile[];
}

export interface ConflictFile {
  readonly path: string;
  readonly conflictMarkers?: string;
}

// ============================================================================
// JSON-RPC Protocol
// ============================================================================

export interface ProjectOpenParams {
  readonly path: string;
}

export interface Project {
  readonly id: ProjectId;
  readonly path: string;
  readonly name: string;
  readonly packageManager: PackageManager;
  readonly framework?: string;
}

export interface TaskCreateParams {
  readonly projectId: ProjectId;
  readonly prompt: string;
  readonly mode: 'parallel' | 'sequential';
  readonly agents?: readonly AgentRole[];
  readonly permissionMode: PermissionMode;
}

export interface Task {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  readonly goal: string;
  readonly status: 'planned' | 'running' | 'completed' | 'failed';
  readonly createdAt: Date;
  readonly agentRuns: readonly AgentRun[];
}

export interface GitDiffParams {
  readonly runId?: AgentRunId;
  readonly worktreeId?: WorktreeId;
  readonly paths?: readonly string[];
}

export interface DiffSummary {
  readonly worktreeId: WorktreeId;
  readonly files: readonly DiffFile[];
  readonly totalAdditions: number;
  readonly totalDeletions: number;
}

export interface DiffFile {
  readonly path: string;
  readonly status: FileChangeType;
  readonly additions: number;
  readonly deletions: number;
  readonly patch?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isThreadId(id: string): id is ThreadId {
  return id.startsWith('thread_');
}

export function isMessageId(id: string): id is MessageId {
  return id.startsWith('msg_');
}

export function isAgentRunId(id: string): id is AgentRunId {
  return id.startsWith('run_');
}

export function isTerminalSessionId(id: string): id is TerminalSessionId {
  return id.startsWith('term_');
}

export function isWorktreeId(id: string): id is WorktreeId {
  return id.startsWith('wt_');
}

export function isEventId(id: string): id is EventId {
  return id.startsWith('evt_');
}
