import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type {
  DiffProjection,
  DoorwayEvent,
  AgentLaunchMode,
  AgentLaunchOptions,
  AgentPermissionProfile,
  AgentPtyMode,
  AgentWorktreeStrategy,
  HandoffCapsuleProjection,
  MergeAssessmentProjection,
  MergeSafetyScore,
  MeshMessageProjection,
  PermissionDecision,
  PermissionReceiptProjection,
  ProjectMemorySource,
  ProviderModelProjection,
  ProofProjection,
  ProjectProjection,
  TaskGraphProjection,
  TaskNodeStatus,
  ThreadId,
  ThreadProjection,
  ToolCapabilityProjection,
  TranscriptChunk,
  WorktreeProjection,
} from '@doorway/protocol';
import { permissionDecisionTerminalInput, useDoorway } from './hooks';
import { ThreadCanvas } from './ThreadCanvas';
import { TerminalMuxPanel } from './TerminalMuxPanel';
import { ComposerDock } from './ComposerDock';
import { HarnessStateProvider } from './HarnessContext';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { SurfaceDrawer } from './SurfaceDrawer';
import { WorkspaceChrome } from './WorkspaceChrome';
import { EmptyState, LatestProofStatus } from './shared-ui';
export {
  ProjectPluginPanel,
  ReplayVerificationPolicyStatus,
  ToolCapabilitiesPanel,
  WorktreeFirstActionCard,
  WorktreeReviewActions,
} from './SurfaceControls';
export { ReviewEvidence } from './ReviewEvidence';
export {
  EmptyProjectThreadPanel,
  FirstRunProjectPanel,
  SidebarProjectContext,
  messageCapsuleClassName,
} from './shared-ui';
import './tokens.css';
import './styles.css';

type Surface =
  | 'browser'
  | 'terminal'
  | 'evidence'
  | 'worktrees'
  | 'tools'
  | 'plugins'
  | 'automations'
  | null;
type HandoffUsageFilter = 'all' | 'used' | 'unused';
type ProofStatusFilter = 'all' | 'pass' | 'fail';
type MergeScoreFilter = 'all' | MergeSafetyScore;
type PermissionDecisionFilter = 'all' | 'approved' | 'denied';
interface LivePermissionRequest {
  readonly sourceEventId: string;
  readonly runId?: string;
  readonly sessionId?: string;
  readonly command: string;
  readonly riskCategory: string;
  readonly reason: string;
  readonly evidence: string;
  readonly requestedAt: Date;
}
type SlashCommand =
  | '/build'
  | '/debug'
  | '/review'
  | '/plan'
  | '/handoff'
  | '/compact'
  | '/test'
  | '/browser'
  | '/merge'
  | '/tools'
  | '/plugins'
  | '/automations';
export type LiveAgentEvent = {
  readonly runId: string;
  readonly type: string;
  readonly data: string;
  readonly timestamp: Date;
};
type OrchestrationLane = {
  readonly runId: string;
  readonly provider: string;
  readonly taskId: string;
  readonly worktreeId?: string;
  readonly status: string;
  readonly latestOutput?: string;
  readonly evidenceCount: number;
};
type ComposerMentionTarget = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly insertText?: string;
  readonly provider?: string;
  readonly modelId?: string;
};
type ComposerPolicySummaryItem = {
  readonly label: string;
  readonly tone: 'neutral' | 'blocked' | 'warning';
};
type ComposerLaunchPreflight = {
  readonly canSubmit: boolean;
  readonly provider: string;
  readonly toolId: string;
  readonly reason?: string;
};
type ToolPolicyPreflight = {
  readonly canUse: boolean;
  readonly reason?: string;
};
type BrowserEvidenceAction = {
  readonly timestamp: Date;
  readonly type: string;
  readonly selector?: string;
  readonly text?: string;
  readonly url?: string;
  readonly screenshot?: string;
};
type ThreadReplayVerification = {
  readonly path: string;
  readonly eventCount: number;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly threadIds: readonly string[];
};
type SurfaceDrawerStatusInput = {
  readonly terminalChunkCount: number;
  readonly liveAgentEventCount: number;
  readonly activeTerminalSessionId: string | null;
  readonly browserUrl: string;
  readonly browserTitle: string;
  readonly browserActionCount: number;
  readonly evidenceRecordCount: number;
  readonly worktreeCount: number;
  readonly toolCount: number;
  readonly pluginCount: number;
  readonly automationCount: number;
};

export const slashCommands: readonly SlashCommand[] = [
  '/build',
  '/debug',
  '/review',
  '/plan',
  '/handoff',
  '/compact',
  '/test',
  '/browser',
  '/merge',
  '/tools',
  '/plugins',
  '/automations',
];

const surfaceLabels: Record<Exclude<Surface, null>, string> = {
  browser: 'Browser',
  terminal: 'Terminal',
  evidence: 'Evidence',
  worktrees: 'Worktrees',
  tools: 'Tools',
  plugins: 'Plugins',
  automations: 'Automations',
};

const composerPermissionLabels: Record<AgentPermissionProfile, string> = {
  'ask-writes': 'Ask on writes',
  'worktree-only': 'Worktree only',
  'review-first': 'Review first',
};

const composerWorktreeLabels: Record<AgentWorktreeStrategy, string> = {
  'auto-worktree': 'Auto worktree',
  'fork-current': 'Fork current',
  'selected-worktree': 'Use selected',
};

const composerPtyLabels: Record<AgentPtyMode, string> = {
  'doorway-pty': 'Doorway PTY',
  'external-pty': 'External PTY',
  protocol: 'Protocol',
};

const handoffUsageFilters: readonly HandoffUsageFilter[] = ['all', 'used', 'unused'];
const handoffUsageFilterLabels: Record<HandoffUsageFilter, string> = {
  all: 'All',
  used: 'Used',
  unused: 'Unused',
};

const proofStatusFilters: readonly ProofStatusFilter[] = ['all', 'pass', 'fail'];
const proofStatusFilterLabels: Record<ProofStatusFilter, string> = {
  all: 'All',
  pass: 'Passing',
  fail: 'Failing',
};
export function surfaceDrawerStatusLabel(
  surface: Exclude<Surface, null>,
  status: SurfaceDrawerStatusInput
) {
  switch (surface) {
    case 'terminal':
      if (status.terminalChunkCount > 0) {
        return evidenceCountLabel(status.terminalChunkCount, 'chunk');
      }
      if (status.liveAgentEventCount > 0) {
        return evidenceCountLabel(status.liveAgentEventCount, 'live event');
      }
      return status.activeTerminalSessionId ? 'Session open' : 'Idle';
    case 'browser':
      if (status.browserTitle) {
        return status.browserTitle;
      }
      if (status.browserUrl) {
        return status.browserUrl;
      }
      return evidenceCountLabel(status.browserActionCount, 'capture');
    case 'evidence':
      return evidenceCountLabel(status.evidenceRecordCount, 'record');
    case 'worktrees':
      return evidenceCountLabel(status.worktreeCount, 'worktree');
    case 'tools':
      return evidenceCountLabel(status.toolCount, 'tool');
    case 'plugins':
      return evidenceCountLabel(status.pluginCount, 'manifest');
    case 'automations':
      return evidenceCountLabel(status.automationCount, 'automation');
  }
}

export function buildComposerLaunchOptions({
  mode,
  permissionProfile,
  worktreeStrategy,
  ptyMode,
  modelId,
}: {
  readonly mode: AgentLaunchMode;
  readonly permissionProfile: AgentPermissionProfile;
  readonly worktreeStrategy: AgentWorktreeStrategy;
  readonly ptyMode: AgentPtyMode;
  readonly modelId?: string;
}): AgentLaunchOptions {
  return {
    mode,
    permissionProfile,
    worktreeStrategy,
    ptyMode,
    ...(modelId ? { modelId } : {}),
  };
}

export function latestLaunchOptionsFromEvents(
  events: readonly DoorwayEvent[]
): AgentLaunchOptions | undefined {
  for (const event of latestThreadEventsBySequence(events, events.length)) {
    const candidate = event.payload as unknown as { readonly launchOptions?: AgentLaunchOptions };
    if (candidate.launchOptions) {
      return candidate.launchOptions;
    }
  }

  return undefined;
}

export function launchOptionLabels(options: AgentLaunchOptions): readonly string[] {
  return [
    options.mode,
    composerPermissionLabels[options.permissionProfile],
    composerWorktreeLabels[options.worktreeStrategy],
    composerPtyLabels[options.ptyMode],
    ...(options.modelId ? [`Model ${options.modelId}`] : []),
  ];
}

export function providerModelLabel(model: ProviderModelProjection): string {
  return `${model.displayName ?? model.modelId} · ${model.providerName}`;
}

export function providerModelCapabilityLabel(model: ProviderModelProjection): string {
  const capabilities = [
    model.supportsStreaming ? 'streaming' : undefined,
    model.supportsToolCalling ? 'tools' : undefined,
    model.supportsVision ? 'vision' : undefined,
  ].filter((item): item is string => Boolean(item));
  return capabilities.length > 0 ? capabilities.join(' / ') : 'text';
}

export function composerPolicySummary({
  activeProject,
  permissionProfile,
  worktreeStrategy,
  ptyMode,
  tools,
}: {
  readonly activeProject?: ProjectProjection | null;
  readonly permissionProfile: AgentPermissionProfile;
  readonly worktreeStrategy: AgentWorktreeStrategy;
  readonly ptyMode: AgentPtyMode;
  readonly tools: readonly ToolCapabilityProjection[];
}): readonly ComposerPolicySummaryItem[] {
  const disabledCount = tools.filter((tool) => !tool.enabled).length;
  return [
    { label: composerPermissionLabels[permissionProfile], tone: 'neutral' },
    { label: composerWorktreeLabels[worktreeStrategy], tone: 'neutral' },
    ...(activeProject
      ? [
          {
            label:
              activeProject.mode === 'git' ? 'Git worktrees enabled' : 'Terminal-only execution',
            tone: activeProject.mode === 'git' ? 'neutral' : 'warning',
          } satisfies ComposerPolicySummaryItem,
        ]
      : []),
    { label: composerPtyLabels[ptyMode], tone: 'neutral' },
    {
      label:
        disabledCount > 0
          ? `${disabledCount} disabled ${disabledCount === 1 ? 'tool' : 'tools'}`
          : 'All tools enabled',
      tone: disabledCount > 0 ? 'blocked' : 'neutral',
    },
  ];
}

export function toolIdForProvider(provider: string | undefined): string {
  switch (provider) {
    case 'codex':
      return 'tool.codex-cli';
    case 'generic':
      return 'tool.generic-cli';
    case 'claude':
    case 'cloudcode':
    case undefined:
      return 'tool.claude-code';
    default:
      return `tool.${provider}`;
  }
}

export function composerLaunchPreflight({
  provider,
  prompt,
  mentionTargets,
  tools,
}: {
  readonly provider: string;
  readonly prompt: string;
  readonly mentionTargets: readonly ComposerMentionTarget[];
  readonly tools: readonly ToolCapabilityProjection[];
}): ComposerLaunchPreflight {
  const launchProvider = launchProviderFromMentions(prompt, provider, mentionTargets);
  const toolId = toolIdForProvider(launchProvider);
  const tool = tools.find((item) => item.id === toolId);

  if (tool && !tool.enabled) {
    return {
      canSubmit: false,
      provider: launchProvider,
      toolId,
      reason: `${tool.name} is disabled for this thread`,
    };
  }

  return {
    canSubmit: true,
    provider: launchProvider,
    toolId,
  };
}

function threadToolPreflight({
  tools,
  toolId,
  blockedReason,
}: {
  readonly tools: readonly ToolCapabilityProjection[];
  readonly toolId: string;
  readonly blockedReason: string;
}): ToolPolicyPreflight {
  const tool = tools.find((item) => item.id === toolId);

  if (tool && !tool.enabled) {
    return {
      canUse: false,
      reason: blockedReason,
    };
  }

  return { canUse: true };
}

export function browserProofPreflight(
  tools: readonly ToolCapabilityProjection[]
): ToolPolicyPreflight {
  return threadToolPreflight({
    tools,
    toolId: 'tool.browser-proof',
    blockedReason: 'Browser proof is disabled for this thread',
  });
}

export function reviewMergePreflight(
  tools: readonly ToolCapabilityProjection[]
): ToolPolicyPreflight {
  return threadToolPreflight({
    tools,
    toolId: 'tool.review-merge',
    blockedReason: 'Review merge is disabled for this thread',
  });
}

export function replayVerificationPreflight(events: readonly DoorwayEvent[]): ToolPolicyPreflight {
  return threadReplayVerificationSuccessEvents(events).length > 0
    ? { canUse: true }
    : {
        canUse: false,
        reason: 'No successful replay verification recorded for this thread',
      };
}

export function worktreeFirstActionPrompt(thread: ThreadProjection | null): string {
  const title = thread?.title.trim();
  if (!title) {
    return '';
  }

  return [
    `Continue "${title}" in an isolated Doorway worktree.`,
    'Inspect the repository state, keep changes inside the worktree boundary, and leave diff evidence ready for review.',
  ].join('\n\n');
}

export function mentionLabelFromText(text: string): string {
  const token = text
    .trim()
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `@${token || 'model'}`;
}

export function composerMentionTargets(
  providerModels: readonly ProviderModelProjection[],
  options: {
    readonly activeProject?: ProjectProjection | null;
    readonly worktrees?: readonly WorktreeProjection[];
    readonly macros?: readonly SlashCommand[];
  } = {}
): readonly ComposerMentionTarget[] {
  return [
    {
      id: 'worker-claude',
      label: '@CloudCode',
      detail: 'Claude Code CLI',
      provider: 'claude',
    },
    {
      id: 'worker-codex',
      label: '@Codex',
      detail: 'Codex CLI',
      provider: 'codex',
    },
    ...providerModels.map((model) => ({
      id: `model-${model.id}`,
      label: mentionLabelFromText(model.displayName ?? model.modelId),
      detail: providerModelLabel(model),
      modelId: model.modelId,
    })),
    ...(options.activeProject
      ? [
          {
            id: `resource-project-${options.activeProject.id}`,
            label: mentionLabelFromText(options.activeProject.name),
            detail: `Project · ${options.activeProject.path}`,
          },
        ]
      : []),
    ...(options.worktrees ?? []).map((worktree) => ({
      id: `resource-worktree-${worktree.id}`,
      label: mentionLabelFromText(worktree.branch.replace(/^refs\/heads\//, '')),
      detail: `Worktree · ${worktree.path}`,
    })),
    ...(options.macros ?? []).map((macro) => ({
      id: `macro-${macro.slice(1)}`,
      label: mentionLabelFromText(macro.slice(1)),
      detail: `Command macro · ${macro}`,
      insertText: macro,
    })),
  ];
}

function activeMentionQuery(prompt: string): string | null {
  const match = prompt.match(/(^|\s)@([A-Za-z0-9-]*)$/);
  return match ? match[2].toLowerCase() : null;
}

export function filteredMentionTargets(
  prompt: string,
  targets: readonly ComposerMentionTarget[],
  limit = 6
): readonly ComposerMentionTarget[] {
  const query = activeMentionQuery(prompt);
  if (query === null) {
    return [];
  }
  return targets
    .filter((target) => target.label.slice(1).toLowerCase().startsWith(query))
    .slice(0, limit);
}

export function applyMentionTargetToPrompt(prompt: string, target: ComposerMentionTarget): string {
  const insertText = target.insertText ?? target.label;
  if (activeMentionQuery(prompt) === null) {
    return `${prompt.trimEnd()}${prompt.trimEnd() ? ' ' : ''}${insertText} `;
  }
  return prompt.replace(/(^|\s)@[A-Za-z0-9-]*$/, (match, prefix: string) => {
    return `${prefix}${insertText} `;
  });
}

export function launchProviderFromMentions(
  prompt: string,
  currentProvider: string,
  targets: readonly ComposerMentionTarget[]
): string {
  const mentions = prompt.match(/@[A-Za-z0-9-]+/g) ?? [];
  for (const mention of [...mentions].reverse()) {
    const target = targets.find((item) => item.label.toLowerCase() === mention.toLowerCase());
    if (target?.provider) {
      return target.provider;
    }
  }
  return currentProvider;
}

export function launchModelFromMentions(
  prompt: string,
  currentModelId: string | undefined,
  targets: readonly ComposerMentionTarget[]
): string | undefined {
  const mentions = prompt.match(/@[A-Za-z0-9-]+/g) ?? [];
  for (const mention of [...mentions].reverse()) {
    const target = targets.find((item) => item.label.toLowerCase() === mention.toLowerCase());
    if (target?.modelId) {
      return target.modelId;
    }
  }
  return currentModelId;
}

export function replayEventJsonLine(event: DoorwayEvent): string {
  return JSON.stringify({
    id: event.id,
    threadId: event.threadId,
    sequence: event.sequence,
    timestamp: event.timestamp.toISOString(),
    type: event.type,
    payload: event.payload,
  });
}

export function replayJsonl(events: readonly DoorwayEvent[]): string {
  return latestThreadEventsBySequence(events, events.length)
    .slice()
    .reverse()
    .map(replayEventJsonLine)
    .join('\n');
}

export function replayPreviewEvents(
  events: readonly DoorwayEvent[],
  limit = 6
): readonly DoorwayEvent[] {
  return latestThreadEventsBySequence(events, events.length).slice().reverse().slice(0, limit);
}

export function browserEvidenceBundle(actions: readonly BrowserEvidenceAction[]): string {
  return JSON.stringify(
    {
      kind: 'browser-evidence',
      actions: actions.map((action, index) => ({
        sequence: index + 1,
        timestamp: action.timestamp.toISOString(),
        type: action.type,
        ...(action.url ? { url: action.url } : {}),
        ...(action.selector ? { selector: action.selector } : {}),
        ...(action.text ? { text: action.text } : {}),
        ...(action.screenshot ? { screenshot: action.screenshot } : {}),
      })),
    },
    null,
    2
  );
}

export function browserEvidencePreview(
  actions: readonly BrowserEvidenceAction[],
  limit = 4
): readonly BrowserEvidenceAction[] {
  return actions.slice(-limit).reverse();
}

export function browserEvidenceActionLabel(action: BrowserEvidenceAction): string {
  const target = action.url ?? action.selector ?? action.text;
  return target ? `${action.type} ${target}` : action.type;
}

function eventPayloadRunId(event: DoorwayEvent): string | undefined {
  const payload = event.payload as unknown as {
    readonly runId?: unknown;
    readonly agentRunId?: unknown;
    readonly sourceRunId?: unknown;
  };
  const runId = payload.runId ?? payload.agentRunId ?? payload.sourceRunId;
  return typeof runId === 'string' ? runId : undefined;
}

export function orchestrationLanesFromEvents({
  threadEvents,
  agentEvents,
}: {
  readonly threadEvents: readonly DoorwayEvent[];
  readonly agentEvents: readonly LiveAgentEvent[];
}): readonly OrchestrationLane[] {
  return latestThreadEventsBySequence(threadEvents, threadEvents.length)
    .filter((event) => event.type === 'agent_run.created')
    .slice(0, 3)
    .map((event) => {
      const payload = event.payload as unknown as {
        readonly runId?: string;
        readonly taskId?: string;
        readonly adapterId?: string;
        readonly worktreeId?: string;
      };
      const runId = payload.runId ?? event.id;
      const latestLiveEvent = latestTimestampedEvents(
        agentEvents.filter((agentEvent) => agentEvent.runId === runId),
        1
      )[0];
      const evidenceCount =
        threadEvents.filter((threadEvent) => eventPayloadRunId(threadEvent) === runId).length +
        agentEvents.filter((agentEvent) => agentEvent.runId === runId).length;

      return {
        runId,
        provider: payload.adapterId ?? 'agent',
        taskId: payload.taskId ?? 'task',
        ...(payload.worktreeId ? { worktreeId: payload.worktreeId } : {}),
        status: latestLiveEvent?.type ?? 'recorded',
        ...(latestLiveEvent?.data ? { latestOutput: latestLiveEvent.data } : {}),
        evidenceCount,
      };
    });
}

const mergeScoreFilters: readonly MergeScoreFilter[] = [
  'all',
  'ready',
  'reviewable',
  'risky',
  'blocked',
];
const mergeScoreFilterLabels: Record<MergeScoreFilter, string> = {
  all: 'All',
  ready: 'Ready',
  reviewable: 'Reviewable',
  risky: 'Risky',
  blocked: 'Blocked',
};
const permissionDecisionFilters: readonly PermissionDecisionFilter[] = [
  'all',
  'approved',
  'denied',
];
const permissionDecisionFilterLabels: Record<PermissionDecisionFilter, string> = {
  all: 'All',
  approved: 'Approved',
  denied: 'Denied',
};

export function surfaceForSlashCommand(command: SlashCommand): Surface {
  switch (command) {
    case '/review':
    case '/merge':
      return 'worktrees';
    case '/browser':
      return 'browser';
    case '/handoff':
    case '/test':
      return 'evidence';
    case '/tools':
      return 'tools';
    case '/plugins':
      return 'plugins';
    case '/automations':
      return 'automations';
    case '/build':
    case '/debug':
    case '/plan':
    case '/compact':
      return null;
  }
}

function taskIdFromWorktree(worktree: WorktreeProjection): string | null {
  const branch = worktree.branch.replace(/^refs\/heads\//, '');
  const match = /^doorway\/([^/]+)/.exec(branch);
  return match?.[1] ?? null;
}

function assessmentTime(assessment: MergeAssessmentProjection): number {
  return new Date(assessment.createdAt).getTime();
}

export function latestAssessmentsByTask(
  assessments: readonly MergeAssessmentProjection[]
): ReadonlyMap<string, MergeAssessmentProjection> {
  const latest = new Map<string, MergeAssessmentProjection>();
  for (const assessment of assessments) {
    const current = latest.get(assessment.taskId);
    if (!current || assessmentTime(assessment) >= assessmentTime(current)) {
      latest.set(assessment.taskId, assessment);
    }
  }
  return latest;
}

export function worktreeMergeScore(
  worktree: WorktreeProjection,
  assessments: ReadonlyMap<string, MergeAssessmentProjection>
): MergeSafetyScore | 'unevaluated' {
  const taskId = taskIdFromWorktree(worktree);
  return (taskId ? assessments.get(taskId)?.score : undefined) ?? 'unevaluated';
}

export function worktreeSafetySummary(
  worktrees: readonly WorktreeProjection[],
  assessments: ReadonlyMap<string, MergeAssessmentProjection>
) {
  return {
    reviewableCount: worktrees.filter((worktree) => !worktree.isMain).length,
    readyCount: worktrees.filter(
      (worktree) => worktreeMergeScore(worktree, assessments) === 'ready'
    ).length,
    cleanCount: worktrees.filter((worktree) => worktree.isClean === true).length,
  };
}

export function selectedWorktree(
  worktrees: readonly WorktreeProjection[],
  selectedWorktreePath: string | null
): WorktreeProjection | undefined {
  return selectedWorktreePath
    ? worktrees.find((worktree) => worktree.path === selectedWorktreePath)
    : undefined;
}

export function worktreeForkBlockedReason(
  worktree: WorktreeProjection | undefined
): string | undefined {
  if (!worktree) {
    return 'Select a worktree before forking.';
  }

  if (worktree.isClean === false) {
    return `Commit or stash changes in ${worktree.path} before forking.`;
  }

  return undefined;
}

export function worktreeArchiveBlockedReason(
  worktree: WorktreeProjection | undefined
): string | undefined {
  if (!worktree) {
    return 'Select a worktree before archiving.';
  }

  if (worktree.isClean === false) {
    return `Commit or stash changes in ${worktree.path} before archiving.`;
  }

  return undefined;
}

export function worktreeCleanStatusLabel(worktree: WorktreeProjection): string {
  if (worktree.isClean === true) {
    return 'clean';
  }

  if (worktree.isClean === false) {
    return 'dirty';
  }

  return 'clean state unknown';
}

export function filterMergeAssessmentsByScore(
  assessments: readonly MergeAssessmentProjection[],
  filter: MergeScoreFilter
): readonly MergeAssessmentProjection[] {
  return filter === 'all'
    ? assessments
    : assessments.filter((assessment) => assessment.score === filter);
}

function sortByRecordedTimeDescending<T>(
  items: readonly T[],
  recordedTime: (item: T) => Date
): readonly T[] {
  return [...items].sort(
    (left, right) => recordedTime(right).getTime() - recordedTime(left).getTime()
  );
}

export function sortMergeAssessmentsByEvidenceTime(
  assessments: readonly MergeAssessmentProjection[]
): readonly MergeAssessmentProjection[] {
  return sortByRecordedTimeDescending(assessments, (assessment) => assessment.createdAt);
}

export function diffUpdatedEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'diff.updated'),
    (event) => event.timestamp
  );
}

export function diffUpdatedEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly path?: string;
    readonly filesChanged?: number;
    readonly totalAdditions?: number;
    readonly totalDeletions?: number;
  };
  const filesChanged = payload.filesChanged ?? 0;
  return `${payload.path ?? 'Unknown worktree'} · ${filesChanged} ${
    filesChanged === 1 ? 'file' : 'files'
  } · +${payload.totalAdditions ?? 0} -${payload.totalDeletions ?? 0}`;
}

export function mergeLifecycleEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter(
      (event) =>
        event.type === 'merge.started' ||
        event.type === 'merge.evaluated' ||
        event.type === 'merge.completed' ||
        event.type === 'merge.conflict'
    ),
    (event) => event.timestamp
  );
}

function mergeLifecycleEventTitle(event: DoorwayEvent): string {
  switch (event.type) {
    case 'merge.started':
      return 'Merge started';
    case 'merge.evaluated':
      return 'Merge evaluated';
    case 'merge.completed':
      return 'Merge completed';
    case 'merge.conflict':
      return 'Merge conflict';
    default:
      return 'Merge event';
  }
}

export function mergeLifecycleEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly taskId?: string;
    readonly integrationBranch?: string;
    readonly branches?: readonly string[];
    readonly assessmentId?: string;
    readonly score?: string;
    readonly reason?: string;
    readonly mergedBranches?: readonly string[];
    readonly conflicts?: readonly string[];
    readonly file?: string;
    readonly conflictDetails?: string;
  };

  if (event.type === 'merge.conflict') {
    return `${payload.taskId ?? 'unknown task'} · ${payload.file ?? 'unknown file'}`;
  }

  if (event.type === 'merge.evaluated') {
    return `${payload.assessmentId ?? 'unknown assessment'} · ${
      payload.taskId ?? 'unknown task'
    } · ${payload.score ?? 'unknown score'} · ${payload.reason ?? 'no reason recorded'}`;
  }

  const branches =
    event.type === 'merge.completed'
      ? (payload.mergedBranches ?? payload.branches ?? [])
      : (payload.branches ?? []);
  const branchLabel = branches.length > 0 ? branches.join(', ') : 'no branches recorded';
  const conflictLabel =
    event.type === 'merge.completed' && payload.conflicts && payload.conflicts.length > 0
      ? ` · ${payload.conflicts.length} conflicts`
      : '';

  return `${payload.taskId ?? 'unknown task'} · ${
    payload.integrationBranch ?? 'unknown integration branch'
  } · ${branchLabel}${conflictLabel}`;
}

export function terminalEvidenceEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter(
      (event) =>
        event.type === 'terminal.created' ||
        event.type === 'terminal.started' ||
        event.type === 'terminal.input' ||
        event.type === 'terminal.output' ||
        event.type === 'terminal.stopped' ||
        event.type === 'agent.attention' ||
        event.type === 'completion.confidence_updated'
    ),
    (event) => event.timestamp
  );
}

export function terminalEvidencePreview(
  events: readonly DoorwayEvent[],
  limit = 5
): readonly DoorwayEvent[] {
  return terminalEvidenceEvents(events).slice(0, limit);
}

function terminalEvidenceEventTitle(event: DoorwayEvent): string {
  switch (event.type) {
    case 'terminal.created':
      return 'Terminal created';
    case 'terminal.started':
      return 'Terminal started';
    case 'terminal.input':
      return 'Terminal input';
    case 'terminal.output':
      return 'Terminal output';
    case 'terminal.stopped':
      return 'Terminal stopped';
    case 'agent.attention':
      return 'Agent attention';
    case 'completion.confidence_updated':
      return 'Completion confidence';
    default:
      return 'Terminal event';
  }
}

export function terminalEvidenceEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly sessionId?: string;
    readonly agentRunId?: string;
    readonly runtime?: string;
    readonly command?: string;
    readonly pid?: number;
    readonly sequence?: number;
    readonly text?: string;
    readonly source?: string;
    readonly isStdout?: boolean;
    readonly isStderr?: boolean;
    readonly exitCode?: number;
    readonly signal?: string;
    readonly state?: string;
    readonly reason?: string;
    readonly outputPreview?: string;
    readonly score?: number;
    readonly recommendedState?: string;
    readonly signals?: readonly string[];
  };

  if (event.type === 'terminal.created') {
    return `${payload.sessionId ?? 'unknown session'} · ${payload.agentRunId ?? 'unknown run'} · ${
      payload.runtime ?? 'unknown runtime'
    }${payload.command ? ` · ${payload.command}` : ''}`;
  }

  if (event.type === 'terminal.started') {
    return `${payload.sessionId ?? 'unknown session'} · pid ${payload.pid ?? 'unknown'}`;
  }

  if (event.type === 'terminal.stopped') {
    const exit =
      payload.exitCode === undefined ? 'exit unknown' : `exit ${payload.exitCode.toString()}`;
    return `${payload.sessionId ?? 'unknown session'} · ${exit}${
      payload.signal ? ` · ${payload.signal}` : ''
    }`;
  }

  if (event.type === 'terminal.input') {
    const text = payload.text?.replace(/\s+/g, ' ').trim() || 'empty input';
    const preview = text.length > 96 ? `${text.slice(0, 93)}...` : text;
    return `${payload.sessionId ?? 'unknown session'} · #${payload.sequence ?? 0} · ${
      payload.source ?? 'user'
    } · ${preview}`;
  }

  if (event.type === 'agent.attention') {
    return `${payload.sessionId ?? 'unknown session'} · ${payload.state ?? 'unknown state'} · ${
      payload.reason ?? payload.outputPreview ?? 'attention event'
    }`;
  }

  if (event.type === 'completion.confidence_updated') {
    const score = typeof payload.score === 'number' ? `${Math.round(payload.score * 100)}%` : 'n/a';
    const signals = payload.signals?.join(', ') ?? 'no signals';
    return `${payload.sessionId ?? 'unknown session'} · ${score} · ${
      payload.recommendedState ?? 'unknown state'
    } · ${signals}`;
  }

  const stream = payload.isStderr ? 'stderr' : payload.isStdout ? 'stdout' : 'output';
  const text = payload.text?.replace(/\s+/g, ' ').trim() || 'empty chunk';
  const preview = text.length > 96 ? `${text.slice(0, 93)}...` : text;
  return `${payload.sessionId ?? 'unknown session'} · #${payload.sequence ?? 0} · ${stream} · ${preview}`;
}

export function testLifecycleEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'test.started' || event.type === 'test.finished'),
    (event) => event.timestamp
  );
}

function testLifecycleEventTitle(event: DoorwayEvent): string {
  return event.type === 'test.finished' ? 'Test finished' : 'Test started';
}

export function testLifecycleEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly proofId?: string;
    readonly terminalSessionId?: string;
    readonly command?: string;
    readonly status?: string;
    readonly exitCode?: number;
    readonly summary?: string;
  };

  if (event.type === 'test.started') {
    return `${payload.proofId ?? 'unknown proof'} · ${
      payload.terminalSessionId ?? 'unknown session'
    } · ${payload.command ?? 'unknown command'}`;
  }

  const exit =
    payload.exitCode === undefined ? 'exit unknown' : `exit ${payload.exitCode.toString()}`;
  return `${payload.proofId ?? 'unknown proof'} · ${payload.status ?? 'unknown'} · ${exit}${
    payload.summary ? ` · ${payload.summary}` : ''
  }`;
}

export function approvalTimelineEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter(
      (event) =>
        event.type === 'approval.requested' ||
        event.type === 'approval.granted' ||
        event.type === 'approval.denied'
    ),
    (event) => event.timestamp
  );
}

function approvalTimelineEventTitle(event: DoorwayEvent): string {
  switch (event.type) {
    case 'approval.requested':
      return 'Approval requested';
    case 'approval.granted':
      return 'Approval granted';
    case 'approval.denied':
      return 'Approval denied';
    default:
      return 'Approval event';
  }
}

export function approvalTimelineEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly runId?: string;
    readonly prompt?: string;
    readonly requiresUserInput?: boolean;
    readonly receiptId?: string;
    readonly taskId?: string;
    readonly command?: string;
    readonly riskCategory?: string;
    readonly userResponse?: string;
    readonly reason?: string;
  };

  if (event.type === 'approval.requested') {
    const inputLabel = payload.requiresUserInput ? 'requires user input' : 'policy checkpoint';
    return `${payload.runId ?? 'unknown run'} · ${inputLabel} · ${payload.prompt ?? 'no prompt'}`;
  }

  const detail = event.type === 'approval.denied' ? payload.reason : payload.userResponse;
  return `${payload.receiptId ?? 'unknown receipt'} · ${payload.taskId ?? 'unknown task'} · ${
    payload.riskCategory ?? 'unknown risk'
  } · ${payload.command ?? 'unknown command'}${detail ? ` · ${detail}` : ''}`;
}

function eventPayloadRecord(event: DoorwayEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

function payloadText(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function eventIsAfter(candidate: DoorwayEvent, source: DoorwayEvent): boolean {
  if (candidate.timestamp.getTime() !== source.timestamp.getTime()) {
    return candidate.timestamp.getTime() > source.timestamp.getTime();
  }
  return candidate.sequence > source.sequence;
}

function approvalEventResolvesRequest(
  decisionEvent: DoorwayEvent,
  sourceEvent: DoorwayEvent
): boolean {
  if (decisionEvent.type !== 'approval.granted' && decisionEvent.type !== 'approval.denied') {
    return false;
  }
  if (!eventIsAfter(decisionEvent, sourceEvent)) {
    return false;
  }
  const sourcePayload = eventPayloadRecord(sourceEvent);
  const decisionPayload = eventPayloadRecord(decisionEvent);
  const sourceRunId = payloadText(sourcePayload, 'runId');
  return sourceRunId ? payloadText(decisionPayload, 'runId') === sourceRunId : true;
}

function isApprovalSourceResolved(
  events: readonly DoorwayEvent[],
  sourceEvent: DoorwayEvent
): boolean {
  return events.some((event) => approvalEventResolvesRequest(event, sourceEvent));
}

export function livePermissionRequest(
  events: readonly DoorwayEvent[]
): LivePermissionRequest | undefined {
  for (const event of sortByRecordedTimeDescending(events, (item) => item.timestamp)) {
    const payload = eventPayloadRecord(event);
    if (event.type === 'approval.requested' && !isApprovalSourceResolved(events, event)) {
      const prompt = payloadText(payload, 'prompt') ?? 'Approval requested';
      const runId = payloadText(payload, 'runId');
      return {
        sourceEventId: event.id,
        ...(runId ? { runId } : {}),
        command: prompt,
        riskCategory: 'approval_request',
        reason:
          payload.requiresUserInput === true
            ? 'Worker is waiting for user input.'
            : 'Policy checkpoint requested approval.',
        evidence: prompt,
        requestedAt: event.timestamp,
      };
    }

    if (event.type === 'agent.attention' && payloadText(payload, 'state') === 'needs_approval') {
      if (isApprovalSourceResolved(events, event)) {
        continue;
      }
      const reason = payloadText(payload, 'reason') ?? 'Terminal requested approval.';
      const outputPreview = payloadText(payload, 'outputPreview');
      const runId = payloadText(payload, 'runId');
      const sessionId = payloadText(payload, 'sessionId');
      return {
        sourceEventId: event.id,
        ...(runId ? { runId } : {}),
        ...(sessionId ? { sessionId } : {}),
        command: outputPreview ?? reason,
        riskCategory: 'live_terminal_permission',
        reason,
        evidence: outputPreview ?? reason,
        requestedAt: event.timestamp,
      };
    }
  }

  return undefined;
}

export function agentLifecycleEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter(
      (event) =>
        event.type === 'agent_run.created' ||
        event.type === 'agent_run.status_changed' ||
        event.type === 'agent_run.completed'
    ),
    (event) => event.timestamp
  );
}

function agentLifecycleEventTitle(event: DoorwayEvent): string {
  switch (event.type) {
    case 'agent_run.created':
      return 'Agent run created';
    case 'agent_run.status_changed':
      return 'Agent status changed';
    case 'agent_run.completed':
      return 'Agent run completed';
    default:
      return 'Agent event';
  }
}

export function agentLifecycleEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly runId?: string;
    readonly taskId?: string;
    readonly role?: string;
    readonly adapterId?: string;
    readonly worktreeId?: string;
    readonly previousStatus?: string;
    readonly newStatus?: string;
    readonly reason?: string;
    readonly exitCode?: number;
    readonly memorySources?: readonly {
      readonly sourceFile?: string;
      readonly category?: string;
      readonly contentLength?: number;
    }[];
  };

  if (event.type === 'agent_run.status_changed') {
    return `${payload.runId ?? 'unknown run'} · ${payload.previousStatus ?? 'unknown'} -> ${
      payload.newStatus ?? 'unknown'
    }${payload.reason ? ` · ${payload.reason}` : ''}`;
  }

  if (event.type === 'agent_run.completed') {
    const exit =
      payload.exitCode === undefined ? 'exit unknown' : `exit ${payload.exitCode.toString()}`;
    return `${payload.runId ?? 'unknown run'} · ${exit}`;
  }

  return `${payload.runId ?? 'unknown run'} · ${payload.taskId ?? 'unknown task'} · ${
    payload.adapterId ?? 'unknown adapter'
  } · ${payload.role ?? 'unknown role'}${payload.worktreeId ? ` · ${payload.worktreeId}` : ''}${
    payload.memorySources && payload.memorySources.length > 0
      ? ` · instructions ${agentMemorySourceLabel(payload.memorySources)}`
      : ''
  }`;
}

export function agentMemorySourceLabel(
  sources: readonly {
    readonly sourceFile?: string;
    readonly category?: string;
    readonly contentLength?: number;
  }[]
): string {
  return sources
    .map((source) => {
      const category = source.category ?? 'memory';
      const contentLength =
        typeof source.contentLength === 'number'
          ? `, ${source.contentLength.toString()} chars`
          : '';
      return `${source.sourceFile ?? 'unknown source'} (${category}${contentLength})`;
    })
    .join(', ');
}

export function worktreeSafetyEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter(
      (event) =>
        event.type === 'worktree.created' ||
        event.type === 'worktree.archived' ||
        event.type === 'worktree.rollback_patch_exported' ||
        event.type === 'file_change.detected'
    ),
    (event) => event.timestamp
  );
}

function worktreeSafetyEventTitle(event: DoorwayEvent): string {
  switch (event.type) {
    case 'worktree.created':
      return 'Worktree created';
    case 'worktree.archived':
      return 'Worktree archived';
    case 'worktree.rollback_patch_exported':
      return 'Rollback patch exported';
    case 'file_change.detected':
      return 'File change detected';
    default:
      return 'Worktree event';
  }
}

export function worktreeSafetyEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly worktreeId?: string;
    readonly projectId?: string;
    readonly taskId?: string;
    readonly path?: string;
    readonly branch?: string;
    readonly branchDeleted?: boolean;
    readonly reason?: string;
    readonly worktreePath?: string;
    readonly patchBytes?: number;
    readonly fileChangeId?: string;
    readonly agentRunId?: string;
    readonly changeType?: string;
  };

  if (event.type === 'worktree.created') {
    return `${payload.worktreeId ?? 'unknown worktree'} · ${payload.taskId ?? 'unknown task'} · ${
      payload.branch ?? 'unknown branch'
    } · ${payload.path ?? 'unknown path'}`;
  }

  if (event.type === 'worktree.archived') {
    const branchPolicy =
      payload.branchDeleted === undefined
        ? undefined
        : payload.branchDeleted
          ? 'branch deleted'
          : 'branch kept';
    return `${payload.worktreeId ?? 'unknown worktree'}${
      payload.branch ? ` · ${payload.branch}` : ''
    }${payload.path ? ` · ${payload.path}` : ''}${branchPolicy ? ` · ${branchPolicy}` : ''}${
      payload.reason ? ` · ${payload.reason}` : ''
    }`;
  }

  if (event.type === 'worktree.rollback_patch_exported') {
    return `${payload.worktreeId ?? 'unknown worktree'} · ${payload.branch ?? 'unknown branch'} · ${
      payload.worktreePath ?? 'unknown path'
    } · ${payload.patchBytes ?? 0} bytes · ${payload.path ?? 'unknown export path'}`;
  }

  return `${payload.worktreeId ?? 'unknown worktree'} · ${payload.agentRunId ?? 'unknown run'} · ${
    payload.changeType ?? 'unknown change'
  } · ${payload.path ?? 'unknown path'}`;
}

export function handoffCreationEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'handoff.created'),
    (event) => event.timestamp
  );
}

export function handoffCreationEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly capsuleId?: string;
    readonly sourceRunId?: string;
    readonly targetProvider?: string;
  };

  return `${payload.capsuleId ?? 'unknown capsule'} · ${
    payload.sourceRunId ?? 'unknown run'
  }${payload.targetProvider ? ` · ${payload.targetProvider}` : ''}`;
}

export function browserBundleExportEvents(
  events: readonly DoorwayEvent[]
): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'browser.bundle_exported'),
    (event) => event.timestamp
  );
}

export function browserBundleExportEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly path?: string;
    readonly actionCount?: number;
    readonly screenshotCount?: number;
    readonly createdAt?: string;
  };
  const actionCount = payload.actionCount ?? 0;
  const screenshotCount = payload.screenshotCount ?? 0;

  return `${payload.path ?? 'unknown bundle path'} · ${actionCount} ${
    actionCount === 1 ? 'action' : 'actions'
  } · ${screenshotCount} ${screenshotCount === 1 ? 'screenshot' : 'screenshots'}${
    payload.createdAt ? ` · ${payload.createdAt}` : ''
  }`;
}

export function threadReplayExportEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'thread.replay_exported'),
    (event) => event.timestamp
  );
}

export function threadReplayExportEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly path?: string;
    readonly eventCount?: number;
    readonly createdAt?: string;
  };
  const eventCount = payload.eventCount ?? 0;

  return `${payload.path ?? 'unknown replay path'} · ${eventCount} ${
    eventCount === 1 ? 'event' : 'events'
  }${payload.createdAt ? ` · ${payload.createdAt}` : ''}`;
}

export function threadReplayVerificationFailureEvents(
  events: readonly DoorwayEvent[]
): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'thread.replay_verification_failed'),
    (event) => event.timestamp
  );
}

export function threadReplayVerificationSuccessEvents(
  events: readonly DoorwayEvent[]
): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'thread.replay_verification_succeeded'),
    (event) => event.timestamp
  );
}

export function threadReplayVerificationSuccessEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly path?: string;
    readonly eventCount?: number;
    readonly firstSequence?: number | null;
    readonly lastSequence?: number | null;
    readonly threadIds?: readonly string[];
    readonly createdAt?: string;
  };
  const eventCount = payload.eventCount ?? 0;
  const firstSequence = payload.firstSequence ?? '-';
  const lastSequence = payload.lastSequence ?? '-';
  const threads = payload.threadIds?.join(', ') || 'unknown thread';

  return `${payload.path ?? 'unknown replay path'} · ${eventCount} ${
    eventCount === 1 ? 'event' : 'events'
  } · seq ${firstSequence}-${lastSequence} · ${threads}${
    payload.createdAt ? ` · ${payload.createdAt}` : ''
  }`;
}

export function latestReplayVerificationEvent(
  events: readonly DoorwayEvent[]
): DoorwayEvent | undefined {
  return sortByRecordedTimeDescending(
    [
      ...threadReplayVerificationSuccessEvents(events),
      ...threadReplayVerificationFailureEvents(events),
    ],
    (event) => event.timestamp
  )[0];
}

export function threadReplayVerificationFailureEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly path?: string;
    readonly error?: string;
    readonly createdAt?: string;
  };

  return `${payload.path ?? 'unknown replay path'} · ${
    payload.error ?? 'unknown replay verification error'
  }${payload.createdAt ? ` · ${payload.createdAt}` : ''}`;
}

export function browserActionEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'browser.action'),
    (event) => event.timestamp
  );
}

export function browserActionEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly type?: string;
    readonly url?: string;
    readonly selector?: string;
    readonly text?: string;
    readonly screenshot?: string;
  };
  const action = payload.type ?? 'browser action';
  const target = payload.url ?? payload.selector ?? payload.text;
  const screenshotLabel = payload.screenshot ? ' · screenshot attached' : '';

  return `${target ? `${action} ${target}` : action}${screenshotLabel}`;
}

export function messageAppendedEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'message.appended'),
    (event) => event.timestamp
  );
}

export function messageAppendedEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly messageId?: string;
    readonly role?: string;
    readonly content?: string;
    readonly provider?: string;
  };
  const content = payload.content?.replace(/\s+/g, ' ').trim() || 'empty message';
  const preview = content.length > 96 ? `${content.slice(0, 93)}...` : content;

  return `${payload.messageId ?? 'unknown message'} · ${payload.role ?? 'unknown role'}${
    payload.provider ? ` · ${payload.provider}` : ''
  } · ${preview}`;
}

export function threadLifecycleEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter(
      (event) => event.type === 'thread.created' || event.type === 'thread.status_changed'
    ),
    (event) => event.timestamp
  );
}

function threadLifecycleEventTitle(event: DoorwayEvent): string {
  return event.type === 'thread.created' ? 'Thread created' : 'Thread status changed';
}

export function threadLifecycleEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly threadId?: string;
    readonly projectId?: string;
    readonly title?: string;
    readonly goal?: string;
    readonly previousStatus?: string;
    readonly newStatus?: string;
  };

  if (event.type === 'thread.status_changed') {
    return `${payload.threadId ?? 'unknown thread'} · ${payload.previousStatus ?? 'unknown'} -> ${
      payload.newStatus ?? 'unknown'
    }`;
  }

  return `${payload.threadId ?? 'unknown thread'} · ${payload.projectId ?? 'unknown project'} · ${
    payload.title ?? 'untitled thread'
  }${payload.goal ? ` · ${payload.goal}` : ''}`;
}

export function taskGraphUpdateEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(
    events.filter((event) => event.type === 'task_graph.updated'),
    (event) => event.timestamp
  );
}

export function taskGraphUpdateEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly taskId?: string;
    readonly nodeId?: string;
    readonly previousStatus?: string;
    readonly newStatus?: string;
  };

  return `${payload.taskId ?? 'unknown task'} · ${payload.nodeId ?? 'unknown node'} · ${
    payload.previousStatus ?? 'unknown'
  } -> ${payload.newStatus ?? 'unknown'}`;
}

export function latestProof(proofs: readonly ProofProjection[]): ProofProjection | undefined {
  return sortProofsByEvidenceTime(proofs)[0];
}

export function filterProofsByStatus(
  proofs: readonly ProofProjection[],
  filter: ProofStatusFilter
): readonly ProofProjection[] {
  return filter === 'all' ? proofs : proofs.filter((proof) => proof.status === filter);
}

export function sortProofsByEvidenceTime(
  proofs: readonly ProofProjection[]
): readonly ProofProjection[] {
  return sortByRecordedTimeDescending(proofs, (proof) => proof.finishedAt ?? proof.startedAt);
}

export function filterPermissionReceiptsByDecision(
  receipts: readonly PermissionReceiptProjection[],
  filter: PermissionDecisionFilter
): readonly PermissionReceiptProjection[] {
  return filter === 'all' ? receipts : receipts.filter((receipt) => receipt.decision === filter);
}

export function sortPermissionReceiptsByEvidenceTime(
  receipts: readonly PermissionReceiptProjection[]
): readonly PermissionReceiptProjection[] {
  return sortByRecordedTimeDescending(receipts, (receipt) => receipt.timestamp);
}

export function evidenceFeedItems(proofs: readonly ProofProjection[]) {
  return sortProofsByEvidenceTime(proofs)
    .map((proof) => ({
      id: proof.id,
      kind: 'Verification',
      status: proof.status,
      title: proof.label,
      detail: proof.summary ?? proof.command ?? 'Proof recorded',
      timestamp: proof.finishedAt ?? proof.startedAt,
    }))
    .slice(0, 3);
}

export function latestApprovalReceipts(
  receipts: readonly PermissionReceiptProjection[],
  limit = 3
): readonly PermissionReceiptProjection[] {
  return sortPermissionReceiptsByEvidenceTime(receipts).slice(0, limit);
}

export function toolPolicyDenials(
  receipts: readonly PermissionReceiptProjection[],
  limit = 3
): readonly PermissionReceiptProjection[] {
  return sortPermissionReceiptsByEvidenceTime(
    receipts.filter(
      (receipt) => receipt.riskCategory === 'tool_disabled' && receipt.decision === 'denied'
    )
  ).slice(0, limit);
}

export function latestTerminalTranscriptChunks(
  chunks: readonly TranscriptChunk[],
  limit = 3
): readonly TranscriptChunk[] {
  return [...chunks].sort((left, right) => right.sequence - left.sequence).slice(0, limit);
}

export function diffPreviewFiles(diff: DiffProjection, limit = 4) {
  return diff.files.slice(0, limit);
}

export function sidebarThreadGroups(
  threads: readonly ThreadProjection[],
  activeThread: ThreadProjection | null
) {
  const activeThreadId = activeThread?.id;
  const current = activeThreadId
    ? threads.filter((thread) => thread.id === activeThreadId)
    : ([] as ThreadProjection[]);
  const remaining = threads
    .filter((thread) => thread.id !== activeThreadId)
    .sort((left, right) => threadSortTime(right) - threadSortTime(left));

  return {
    current,
    active: remaining.filter((thread) => thread.status === 'active'),
    recent: remaining.filter((thread) => thread.status !== 'active'),
  };
}

function threadSortTime(thread: ThreadProjection): number {
  return (thread.updatedAt ?? thread.createdAt).getTime();
}

export function rollbackPreviewFiles(diff: DiffProjection, limit = 2) {
  return diff.files.filter((file) => Boolean(file.patch)).slice(0, limit);
}

export function reversePatchPreview(patch: string): string {
  const lines = patch.split('\n');
  const reversed: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const nextLine = lines[index + 1] ?? '';

    if (line.startsWith('--- ') && nextLine.startsWith('+++ ')) {
      reversed.push(`--- ${nextLine.slice(4)}`);
      reversed.push(`+++ ${line.slice(4)}`);
      index += 1;
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      reversed.push(`-${line.slice(1)}`);
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      reversed.push(`+${line.slice(1)}`);
      continue;
    }

    reversed.push(line);
  }

  return reversed.join('\n');
}

export function latestMergeReviewAssessments(
  assessments: readonly MergeAssessmentProjection[],
  limit = 3
): readonly MergeAssessmentProjection[] {
  return sortMergeAssessmentsByEvidenceTime(assessments).slice(0, limit);
}

export function handoffCapsuleMetadata(capsule: HandoffCapsuleProjection): readonly string[] {
  const worktreePath = handoffWorktreeOpenPath(capsule);
  return [
    capsule.targetProvider ? `Provider ${capsule.targetProvider}` : undefined,
    capsule.branch ? `Branch ${capsule.branch}` : undefined,
    worktreePath ? `Worktree ${worktreePath}` : undefined,
  ].filter((item): item is string => item !== undefined);
}

export function evidenceCountLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function evidenceTimestampLabel(value: Date | undefined): string {
  return value ? `Recorded ${value.toISOString()}` : 'Time not recorded';
}

export function handoffNextPromptText(capsule: HandoffCapsuleProjection): string {
  return capsule.nextPrompt.trim();
}

export function handoffUsedEvents(events: readonly DoorwayEvent[]): readonly DoorwayEvent[] {
  return events.filter((event) => event.type === 'handoff.used');
}

export function sortHandoffUsedEventsByEvidenceTime(
  events: readonly DoorwayEvent[]
): readonly DoorwayEvent[] {
  return sortByRecordedTimeDescending(events, (event) => event.timestamp);
}

export function latestTimestampedEvents<T extends { readonly timestamp: Date }>(
  events: readonly T[],
  limit: number
): readonly T[] {
  return sortByRecordedTimeDescending(events, (event) => event.timestamp).slice(0, limit);
}

export function latestThreadEventsBySequence(
  events: readonly DoorwayEvent[],
  limit: number
): readonly DoorwayEvent[] {
  return [...events].sort((left, right) => right.sequence - left.sequence).slice(0, limit);
}

export function filterHandoffCapsulesByUsage(
  capsules: readonly HandoffCapsuleProjection[],
  events: readonly DoorwayEvent[],
  filter: HandoffUsageFilter
): readonly HandoffCapsuleProjection[] {
  if (filter === 'all') {
    return capsules;
  }

  const usedCapsuleIds = new Set(
    handoffUsedEvents(events)
      .map((event) => {
        const payload = event.payload as { readonly capsuleId?: string };
        return payload.capsuleId;
      })
      .filter((capsuleId): capsuleId is string => Boolean(capsuleId))
  );

  return capsules.filter((capsule) =>
    filter === 'used' ? usedCapsuleIds.has(capsule.id) : !usedCapsuleIds.has(capsule.id)
  );
}

export function sortHandoffCapsulesByEvidenceTime(
  capsules: readonly HandoffCapsuleProjection[],
  events: readonly DoorwayEvent[]
): readonly HandoffCapsuleProjection[] {
  return sortByRecordedTimeDescending(
    capsules,
    (capsule) => latestHandoffUsedEventForCapsule(events, capsule)?.timestamp ?? capsule.createdAt
  );
}

export function latestInlineHandoffCapsules(
  capsules: readonly HandoffCapsuleProjection[],
  limit = 1
): readonly HandoffCapsuleProjection[] {
  return sortByRecordedTimeDescending(capsules, (capsule) => capsule.createdAt).slice(0, limit);
}

export function handoffUsedEventLabel(event: DoorwayEvent): string {
  const payload = event.payload as {
    readonly action?: string;
    readonly capsuleId?: string;
    readonly worktreePath?: string;
    readonly filePath?: string;
  };
  if (payload.action === 'open_changed_file') {
    const filePath = payload.filePath ? ` ${payload.filePath}` : '';
    return `${payload.capsuleId ?? 'Unknown capsule'} opened file${filePath} at ${event.timestamp.toISOString()}`;
  }

  const verb = payload.action === 'open_worktree' ? 'opened' : 'copied';
  const targetPath = payload.worktreePath ? ` ${payload.worktreePath}` : '';
  return `${payload.capsuleId ?? 'Unknown capsule'} ${verb}${targetPath} at ${event.timestamp.toISOString()}`;
}

export function latestHandoffUsedEventForCapsule(
  events: readonly DoorwayEvent[],
  capsule: HandoffCapsuleProjection
): DoorwayEvent | undefined {
  return handoffUsedEvents(events)
    .filter((event) => {
      const payload = event.payload as { readonly capsuleId?: string };
      return payload.capsuleId === capsule.id;
    })
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0];
}

export function latestHandoffActivityLabel(event: DoorwayEvent | undefined): string | undefined {
  if (!event) {
    return undefined;
  }
  const payload = event.payload as {
    readonly action?: string;
    readonly filePath?: string;
    readonly worktreePath?: string;
  };
  const target = payload.filePath?.trim() || payload.worktreePath?.trim();
  const action =
    payload.action === 'open_changed_file'
      ? 'Opened file'
      : payload.action === 'open_worktree'
        ? 'Opened worktree'
        : 'Copied prompt';
  return target
    ? `Latest activity: ${action} ${target}`
    : `Latest activity: ${action} at ${event.timestamp.toISOString()}`;
}

export function handoffUsageCountLabel(
  events: readonly DoorwayEvent[],
  capsule: HandoffCapsuleProjection
): string | undefined {
  const count = handoffUsedEvents(events).filter((event) => {
    const payload = event.payload as { readonly capsuleId?: string };
    return payload.capsuleId === capsule.id;
  }).length;

  return count > 0 ? evidenceCountLabel(count, 'use') : undefined;
}

export function handoffUsageBreakdownLabels(
  events: readonly DoorwayEvent[],
  capsule: HandoffCapsuleProjection
): readonly string[] {
  const counts = handoffUsedEvents(events).reduce(
    (nextCounts, event) => {
      const payload = event.payload as {
        readonly action?: string;
        readonly capsuleId?: string;
      };
      if (payload.capsuleId !== capsule.id) {
        return nextCounts;
      }
      if (payload.action === 'copy_next_prompt') {
        return { ...nextCounts, copied: nextCounts.copied + 1 };
      }
      if (payload.action === 'open_worktree') {
        return { ...nextCounts, worktrees: nextCounts.worktrees + 1 };
      }
      if (payload.action === 'open_changed_file') {
        return { ...nextCounts, files: nextCounts.files + 1 };
      }
      return nextCounts;
    },
    { copied: 0, worktrees: 0, files: 0 }
  );

  return [
    counts.copied > 0
      ? `${counts.copied} prompt ${counts.copied === 1 ? 'copy' : 'copies'}`
      : undefined,
    counts.worktrees > 0
      ? `${counts.worktrees} worktree ${counts.worktrees === 1 ? 'open' : 'opens'}`
      : undefined,
    counts.files > 0 ? `${counts.files} file ${counts.files === 1 ? 'open' : 'opens'}` : undefined,
  ].filter((label): label is string => Boolean(label));
}

export function latestHandoffOpenTargetForCapsule(
  events: readonly DoorwayEvent[],
  capsule: HandoffCapsuleProjection
):
  | {
      readonly label: string;
      readonly path: string;
      readonly target: string;
      readonly worktreePath?: string;
      readonly filePath?: string;
    }
  | undefined {
  const latestOpenEvent = handoffUsedEvents(events)
    .filter((event) => {
      const payload = event.payload as { readonly action?: string; readonly capsuleId?: string };
      return (
        payload.capsuleId === capsule.id &&
        (payload.action === 'open_worktree' || payload.action === 'open_changed_file')
      );
    })
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0];

  const payload = latestOpenEvent?.payload as
    | {
        readonly action?: string;
        readonly worktreePath?: string;
        readonly filePath?: string;
      }
    | undefined;
  if (!payload) {
    return undefined;
  }

  const worktreePath = payload.worktreePath?.trim() || handoffWorktreeOpenPath(capsule);
  if (payload.action === 'open_changed_file') {
    const filePath = payload.filePath?.trim();
    if (!filePath) {
      return undefined;
    }
    const path = handoffChangedFileOpenPath(
      { ...capsule, ...(worktreePath ? { worktreePath } : {}) },
      filePath
    );
    if (!path) {
      return undefined;
    }
    return {
      label: 'Reopen latest file',
      path,
      target: filePath,
      ...(worktreePath ? { worktreePath } : {}),
      filePath,
    };
  }

  return worktreePath
    ? { label: 'Reopen latest worktree', path: worktreePath, target: worktreePath }
    : undefined;
}

export function handoffCopiedInlineLabel(event: DoorwayEvent | undefined): string | undefined {
  if (!event) {
    return undefined;
  }
  const payload = event.payload as { readonly action?: string };
  const actionLabel =
    payload.action === 'open_changed_file'
      ? 'Opened file'
      : payload.action === 'open_worktree'
        ? 'Opened'
        : 'Copied';
  return `${actionLabel} ${event.timestamp.toISOString()}`;
}

export function handoffWorktreeOpenPath(capsule: HandoffCapsuleProjection): string | undefined {
  const path = capsule.worktreePath?.trim();
  return path || undefined;
}

export function handoffChangedFilePreview(
  capsule: HandoffCapsuleProjection,
  limit = 4
): {
  readonly files: readonly string[];
  readonly remaining: number;
} {
  const files = capsule.changedFiles.map((file) => file.trim()).filter((file) => file.length > 0);
  return {
    files: files.slice(0, limit),
    remaining: Math.max(files.length - limit, 0),
  };
}

export function handoffChangedFileOpenPath(
  capsule: HandoffCapsuleProjection,
  filePath: string
): string | undefined {
  const worktreePath = handoffWorktreeOpenPath(capsule);
  const changedFilePath = filePath.trim();
  if (!worktreePath || !changedFilePath) {
    return undefined;
  }

  if (changedFilePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(changedFilePath)) {
    return changedFilePath;
  }

  return `${worktreePath.replace(/[\\/]+$/, '')}/${changedFilePath.replace(/^[\\/]+/, '')}`;
}

function EvidenceSection({
  title,
  countLabel,
  children,
}: {
  readonly title: string;
  readonly countLabel: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="evidence-section" aria-label={title}>
      <header className="evidence-section__header">
        <strong>{title}</strong>
        <span>{countLabel}</span>
      </header>
      <div className="evidence-section__body">{children}</div>
    </section>
  );
}

type EvidenceActionMetadata = {
  readonly threadId?: string;
  readonly capsuleId?: string;
  readonly worktreePath?: string;
  readonly filePath?: string;
};

export function sortPeerMessagesByEvidenceTime(
  peerMessages: readonly MeshMessageProjection[]
): readonly MeshMessageProjection[] {
  return [...peerMessages].sort(
    (left, right) =>
      right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
  );
}

export function peerMessageKindLabel(kind: MeshMessageProjection['kind']): string {
  return kind.split('_').join(' ');
}

export function peerMessageRouteLabel(message: MeshMessageProjection): string {
  return `${message.fromDisplayName} -> ${message.toDisplayName}`;
}

function peerMessageStateLabel(message: MeshMessageProjection): string {
  return message.requiresHumanApproval ? `${message.status} · human approval` : message.status;
}

export function latestTaskGraphs(
  taskGraphs: readonly TaskGraphProjection[],
  limit = 1
): readonly TaskGraphProjection[] {
  return [...taskGraphs]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export function LivePermissionModal({
  request,
  loading,
  onDecide,
}: {
  readonly request: LivePermissionRequest;
  readonly loading: boolean;
  readonly onDecide: (
    decision: PermissionDecision,
    request: LivePermissionRequest
  ) => void | Promise<unknown>;
}) {
  return (
    <div className="live-permission-backdrop" role="presentation">
      <section
        className="live-permission-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Live permission request"
      >
        <header className="live-permission-modal__header">
          <div>
            <span className="section-label">Permission</span>
            <h2>Worker needs approval</h2>
          </div>
          <span className="live-permission-modal__risk">{request.riskCategory}</span>
        </header>
        <p className="live-permission-modal__reason">{request.reason}</p>
        <dl className="live-permission-modal__meta">
          {request.runId && (
            <>
              <dt>Run</dt>
              <dd>{request.runId}</dd>
            </>
          )}
          {request.sessionId && (
            <>
              <dt>Session</dt>
              <dd>{request.sessionId}</dd>
            </>
          )}
          <dt>Requested</dt>
          <dd>{request.requestedAt.toISOString()}</dd>
        </dl>
        <div className="live-permission-modal__evidence" aria-label="Permission evidence">
          <span>Evidence</span>
          <code>{request.evidence}</code>
        </div>
        <footer className="live-permission-modal__actions">
          <button
            type="button"
            className="live-permission-modal__deny"
            disabled={loading}
            onClick={() => void onDecide('denied', request)}
          >
            Deny
          </button>
          <button
            type="button"
            className="live-permission-modal__allow"
            disabled={loading}
            onClick={() => void onDecide('approved', request)}
          >
            Allow
          </button>
        </footer>
      </section>
    </div>
  );
}

export function App() {
  const doorwayState = useDoorway();
  const {
    projects,
    activeProject,
    projectMemorySources,
    projectPlugins,
    automations,
    automationRuns,
    providerModels,
    toolCapabilities,
    threads,
    activeThread,
    messages,
    threadEvents,
    proofs,
    permissionReceipts,
    mergeAssessments,
    handoffCapsules,
    peerMessages,
    taskGraphs,
    agentEvents,
    activeTerminalSessionId,
    terminalSessions,
    terminalTranscript,
    terminalInputs,
    worktrees,
    selectedWorktreePath,
    activeDiff,
    browserState,
    browserActions,
    threadReplayVerification,
    loading,
    error,
    setError,
    openProject,
    selectProject,
    createThread,
    selectThread,
    launchAgent,
    selectTerminalSession,
    writeActiveTerminal,
    resizeActiveTerminal,
    stopActiveTerminal,
    launchBrowser,
    toggleBrowserControl,
    loadWorktreeDiff,
    evaluateMergeReadiness,
    approveWorktreeMerge,
    createIntegrationMerge,
    forkWorktree,
    archiveWorktree,
    exportRollbackPatch,
    createHandoff,
    createCompactCheckpoint,
    updateGraphNodeStatus,
    decidePermission,
    copyText,
    exportBrowserEvidence,
    exportThreadReplay,
    openPath,
    setToolEnabled,
    createProjectAutomation,
    updateProjectAutomation,
    deleteProjectAutomation,
    loadAutomationRuns,
    runProjectAutomationNow,
  } = doorwayState;

  const [prompt, setPrompt] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [provider, setProvider] = useState('claude');
  const [modelId, setModelId] = useState('');
  const [composerMode, setComposerMode] = useState<AgentLaunchMode>('/build');
  const [permissionProfile, setPermissionProfile] = useState<AgentPermissionProfile>('ask-writes');
  const [worktreeStrategy, setWorktreeStrategy] = useState<AgentWorktreeStrategy>('auto-worktree');
  const [ptyMode, setPtyMode] = useState<AgentPtyMode>('doorway-pty');
  const [activeSurface, setActiveSurface] = useState<Surface>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [browserUrl, setBrowserUrl] = useState('');
  const [handoffFilter, setHandoffFilter] = useState<HandoffUsageFilter>('all');
  const [proofFilter, setProofFilter] = useState<ProofStatusFilter>('all');
  const [mergeFilter, setMergeFilter] = useState<MergeScoreFilter>('all');
  const [permissionFilter, setPermissionFilter] = useState<PermissionDecisionFilter>('all');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowCommands(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const terminalFallbackText =
    agentEvents.length > 0
      ? agentEvents.map((event) => `[${event.type}] ${event.data}`).join('\n')
      : activeTerminalSessionId
        ? 'Terminal session is open. No transcript chunks have been persisted.'
        : 'No terminal session is active.';
  const latestBrowserScreenshot = browserActions[browserActions.length - 1]?.screenshot;
  const worktreeAssessments = useMemo(
    () => latestAssessmentsByTask(mergeAssessments),
    [mergeAssessments]
  );
  const worktreeSummary = useMemo(
    () => worktreeSafetySummary(worktrees, worktreeAssessments),
    [worktreeAssessments, worktrees]
  );
  const selectedProviderModel = useMemo(
    () => providerModels.find((model) => model.modelId === modelId),
    [modelId, providerModels]
  );
  const mentionTargets = useMemo(
    () =>
      composerMentionTargets(providerModels, {
        activeProject,
        worktrees,
        macros: slashCommands,
      }),
    [activeProject, providerModels, worktrees]
  );
  const activeMentionTargets = useMemo(
    () => filteredMentionTargets(prompt, mentionTargets),
    [mentionTargets, prompt]
  );
  const policySummary = useMemo(
    () =>
      composerPolicySummary({
        permissionProfile,
        worktreeStrategy,
        ptyMode,
        tools: toolCapabilities,
        activeProject,
      }),
    [activeProject, permissionProfile, ptyMode, toolCapabilities, worktreeStrategy]
  );
  const launchPreflight = useMemo(
    () =>
      composerLaunchPreflight({
        provider,
        prompt,
        mentionTargets,
        tools: toolCapabilities,
      }),
    [mentionTargets, prompt, provider, toolCapabilities]
  );
  const isComposerBlocked = Boolean(activeThread && !launchPreflight.canSubmit);
  const browserPreflight = useMemo(
    () => browserProofPreflight(toolCapabilities),
    [toolCapabilities]
  );
  const isBrowserProofBlocked = Boolean(activeThread && !browserPreflight.canUse);
  const browserPolicyTitle = isBrowserProofBlocked ? browserPreflight.reason : undefined;
  const reviewMergePreflightResult = useMemo(
    () => reviewMergePreflight(toolCapabilities),
    [toolCapabilities]
  );
  const replayVerificationPreflightResult = useMemo(
    () => replayVerificationPreflight(threadEvents),
    [threadEvents]
  );
  const isReviewMergeBlocked = Boolean(activeThread && !reviewMergePreflightResult.canUse);
  const hasReplayVerificationWarning = Boolean(
    activeThread && !replayVerificationPreflightResult.canUse
  );
  const reviewMergePolicyTitle = isReviewMergeBlocked
    ? reviewMergePreflightResult.reason
    : undefined;
  const worktreeFirstActionPromptText = useMemo(
    () => worktreeFirstActionPrompt(activeThread),
    [activeThread]
  );
  const worktreeFirstActionPreflight = useMemo(
    () =>
      composerLaunchPreflight({
        provider,
        prompt: worktreeFirstActionPromptText,
        mentionTargets,
        tools: toolCapabilities,
      }),
    [mentionTargets, provider, toolCapabilities, worktreeFirstActionPromptText]
  );
  const worktreeFirstActionBlockedReason =
    activeThread && !worktreeFirstActionPreflight.canSubmit
      ? worktreeFirstActionPreflight.reason
      : undefined;
  const onStartWorktreeRun = async () => {
    if (!activeProject || !activeThread || !worktreeFirstActionPreflight.canSubmit) {
      return;
    }

    await launchAgent(
      worktreeFirstActionPromptText,
      worktreeFirstActionPreflight.provider,
      buildComposerLaunchOptions({
        mode: '/build',
        permissionProfile,
        worktreeStrategy: 'auto-worktree',
        ptyMode,
        ...(modelId ? { modelId } : {}),
      })
    );
  };
  const selectedForkWorktree = useMemo(
    () => selectedWorktree(worktrees, selectedWorktreePath),
    [selectedWorktreePath, worktrees]
  );
  const forkWorktreeBlockedReason = worktreeForkBlockedReason(selectedForkWorktree);
  const archiveWorktreeBlockedReason = worktreeArchiveBlockedReason(selectedForkWorktree);
  const archiveMergedBranchTitle = archiveWorktreeBlockedReason
    ? archiveWorktreeBlockedReason
    : 'Uses git branch -d after archiving; Git refuses unmerged branches.';

  useEffect(() => {
    if (modelId && !selectedProviderModel) {
      setModelId('');
    }
  }, [modelId, selectedProviderModel]);
  const handoffCopyEvents = useMemo(
    () => sortHandoffUsedEventsByEvidenceTime(handoffUsedEvents(threadEvents)),
    [threadEvents]
  );
  const evidenceRecordCount =
    handoffCapsules.length +
    handoffCopyEvents.length +
    mergeAssessments.length +
    permissionReceipts.length +
    proofs.length +
    peerMessages.length +
    browserActions.length;
  const filteredHandoffCapsules = useMemo(
    () =>
      sortHandoffCapsulesByEvidenceTime(
        filterHandoffCapsulesByUsage(handoffCapsules, threadEvents, handoffFilter),
        threadEvents
      ),
    [handoffCapsules, handoffFilter, threadEvents]
  );
  const filteredProofs = useMemo(
    () => sortProofsByEvidenceTime(filterProofsByStatus(proofs, proofFilter)),
    [proofFilter, proofs]
  );
  const filteredMergeAssessments = useMemo(
    () =>
      sortMergeAssessmentsByEvidenceTime(
        filterMergeAssessmentsByScore(mergeAssessments, mergeFilter)
      ),
    [mergeAssessments, mergeFilter]
  );
  const filteredPermissionReceipts = useMemo(
    () =>
      sortPermissionReceiptsByEvidenceTime(
        filterPermissionReceiptsByDecision(permissionReceipts, permissionFilter)
      ),
    [permissionFilter, permissionReceipts]
  );
  const livePermission = useMemo(
    () => (activeThread ? livePermissionRequest(threadEvents) : undefined),
    [activeThread, threadEvents]
  );
  const sidebarQuery = sidebarSearch.trim().toLowerCase();
  const visibleThreads = useMemo(
    () =>
      sidebarQuery
        ? threads.filter((thread) => thread.title.toLowerCase().includes(sidebarQuery))
        : threads,
    [sidebarQuery, threads]
  );
  const sidebarGroups = useMemo(
    () => sidebarThreadGroups(visibleThreads, activeThread),
    [activeThread, visibleThreads]
  );
  const visibleProjects = useMemo(
    () =>
      projects
        .filter((project) => project.id !== activeProject?.id)
        .filter((project) => {
          if (!sidebarQuery) return true;
          return (
            project.name.toLowerCase().includes(sidebarQuery) ||
            project.path.toLowerCase().includes(sidebarQuery)
          );
        }),
    [activeProject?.id, projects, sidebarQuery]
  );

  const submitPrompt = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    if (!activeProject) {
      setError('Open a project before starting an agent run.');
      return;
    }
    if (activeThread && !launchPreflight.canSubmit) {
      setError(launchPreflight.reason ?? 'Selected worker is disabled for this thread.');
      return;
    }

    const launchProvider = launchPreflight.provider;
    const launchModelId = launchModelFromMentions(
      trimmed,
      selectedProviderModel?.modelId,
      mentionTargets
    );

    await launchAgent(
      trimmed,
      launchProvider,
      buildComposerLaunchOptions({
        mode: composerMode,
        permissionProfile,
        worktreeStrategy,
        ptyMode,
        ...(launchModelId ? { modelId: launchModelId } : {}),
      })
    );
    if (ptyMode !== 'protocol') {
      setActiveSurface('terminal');
    }
    setPrompt('');
    setShowCommands(false);
  };

  const submitProject = async () => {
    const trimmed = projectPath.trim();
    if (!trimmed || loading) return;
    await openProject(trimmed);
    setProjectPath('');
  };

  const submitThread = async () => {
    if (!activeProject || loading) return;
    const thread = await createThread(threadTitle.trim() || undefined);
    if (thread) setThreadTitle('');
  };

  const runSlashCommand = async (command: SlashCommand) => {
    if (command === '/compact') {
      try {
        const checkpoint = await createCompactCheckpoint();
        if (checkpoint) {
          setPrompt(checkpoint.nextPrompt);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create compact checkpoint');
      }
      setShowCommands(false);
      return;
    }

    const surface = surfaceForSlashCommand(command);
    if (surface) {
      setActiveSurface(surface);
    } else {
      setPrompt((current) => `${current.trimStart()}${current.trim() ? ' ' : ''}${command} `);
    }
    setShowCommands(false);
  };
  const applyComposerMention = (target: ComposerMentionTarget) => {
    setPrompt((current) => applyMentionTargetToPrompt(current, target));
    if (target.provider) {
      setProvider(target.provider);
    }
    if (target.modelId) {
      setModelId(target.modelId);
    }
  };
  const decideLivePermission = (decision: PermissionDecision, request: LivePermissionRequest) => {
    void decidePermission({
      decision,
      command: request.command,
      ...(request.runId ? { runId: request.runId } : {}),
      ...(request.sessionId
        ? {
            sessionId: request.sessionId,
            terminalInput: permissionDecisionTerminalInput(decision),
          }
        : {}),
      riskCategory: request.riskCategory,
      userNotes: `${decision === 'approved' ? 'Approved' : 'Denied'} ${request.sourceEventId}`,
    });
  };
  const activeSurfaceStatus = activeSurface
    ? surfaceDrawerStatusLabel(activeSurface, {
        terminalChunkCount: terminalTranscript.length,
        liveAgentEventCount: agentEvents.length,
        activeTerminalSessionId,
        browserUrl: browserState.url,
        browserTitle: browserState.title,
        browserActionCount: browserActions.length,
        evidenceRecordCount,
        worktreeCount: worktrees.length,
        toolCount: toolCapabilities.length,
        pluginCount: projectPlugins.length,
        automationCount: automations.length,
      })
    : null;
  const workspaceChromeProps = {
    activeSurface,
    setActiveSurface,
    activeProject,
    activeThread,
    projectMemorySources,
    worktreeCount: worktrees.length,
    evidenceRecordCount,
    loading,
    projectPath,
    setProjectPath,
    submitProject,
    threadTitle,
    setThreadTitle,
    submitThread,
    sidebarSearch,
    setSidebarSearch,
    visibleProjects,
    visibleThreads,
    sidebarGroups,
    selectProject,
    selectThread,
  } as const;

  const contextValue = {
    ...doorwayState,
    projects,
    activeProject,
    projectMemorySources,
    projectPlugins,
    automations,
    automationRuns,
    providerModels,
    toolCapabilities,
    threads,
    activeThread,
    messages,
    threadEvents,
    proofs,
    permissionReceipts,
    mergeAssessments,
    handoffCapsules,
    peerMessages,
    taskGraphs,
    agentEvents,
    activeTerminalSessionId,
    terminalSessions,
    terminalTranscript,
    terminalInputs,
    worktrees,
    worktreeAssessments,
    selectedWorktreePath,
    activeDiff,
    browserState,
    browserActions,
    threadReplayVerification,
    loading,
    error,
    setError,
    openProject,
    selectProject,
    createThread,
    selectThread,
    launchAgent,
    selectTerminalSession,
    writeActiveTerminal,
    resizeActiveTerminal,
    stopActiveTerminal,
    launchBrowser,
    toggleBrowserControl,
    loadWorktreeDiff,
    evaluateMergeReadiness,
    approveWorktreeMerge,
    createIntegrationMerge,
    forkWorktree,
    archiveWorktree,
    exportRollbackPatch,
    createHandoff,
    updateGraphNodeStatus,
    decidePermission,
    copyText,
    exportBrowserEvidence,
    exportThreadReplay,
    openPath,
    setToolEnabled,
    createProjectAutomation,
    updateProjectAutomation,
    deleteProjectAutomation,
    loadAutomationRuns,
    runProjectAutomationNow,
    prompt,
    setPrompt,
    projectPath,
    setProjectPath,
    threadTitle,
    setThreadTitle,
    sidebarSearch,
    setSidebarSearch,
    provider,
    setProvider,
    modelId,
    setModelId,
    composerMode,
    setComposerMode,
    permissionProfile,
    setPermissionProfile,
    worktreeStrategy,
    setWorktreeStrategy,
    ptyMode,
    setPtyMode,
    activeSurface,
    setActiveSurface,
    showCommands,
    setShowCommands,
    browserUrl,
    setBrowserUrl,
    handoffFilter,
    setHandoffFilter,
    proofFilter,
    setProofFilter,
    mergeFilter,
    setMergeFilter,
    permissionFilter,
    setPermissionFilter,
    activeThreadExists: Boolean(activeThread),
    runSlashCommand,
    applyComposerMention,
    submitPrompt,
    submitProject,
    submitThread,
    evidenceRecordCount,
    browserPreflight,
    browserPolicyTitle,
    latestBrowserScreenshot,
    filteredHandoffCapsules,
    handoffCopyEvents,
    filteredMergeAssessments,
    filteredPermissionReceipts,
    filteredProofs,
    forkWorktreeBlockedReason,
    archiveWorktreeBlockedReason,
    archiveMergedBranchTitle,
    worktreeFirstActionBlockedReason,
    isReviewMergeBlocked,
    reviewMergeBlockedReason: reviewMergePreflightResult.reason,
    reviewMergePolicyTitle,
    hasReplayVerificationWarning,
    replayVerificationPolicyReason: replayVerificationPreflightResult.reason,
    permissionReceiptsForTools: toolPolicyDenials(permissionReceipts),
    onStartWorktreeRun,
    terminalFallbackText,
    selectedProviderModel,
    activeMentionTargets,
    policySummary,
    launchPreflight,
    isComposerBlocked,
    activeProjectMode: activeProject?.mode,
    worktreeSummary,
  };

  return (
    <HarnessStateProvider value={contextValue}>
      <div className="doorway-app" data-theme="dark">
        <PanelGroup orientation="horizontal" className="w-full h-full">
          <Panel
            defaultSize="20%"
            minSize="15%"
            maxSize="30%"
            className="flex flex-row overflow-hidden border-r border-transparent"
          >
            <WorkspaceChrome />
          </Panel>
          <PanelResizeHandle className="w-[1px] bg-transparent hover:bg-white/10 hover:w-1 transition-all duration-300 cursor-col-resize z-50" />
          <Panel className="relative flex flex-col min-w-0">
            <PanelGroup orientation="vertical" className="w-full h-full">
              <Panel defaultSize="60%" minSize="30%" className="relative min-h-0">
                <ThreadCanvas />
              </Panel>
              {activeSurface === 'terminal' && (
                <>
                  <PanelResizeHandle className="h-[1px] bg-transparent hover:bg-white/10 hover:h-1 transition-all duration-300 cursor-row-resize z-50" />
                  <Panel defaultSize="40%" minSize="20%" className="relative min-h-0">
                    <TerminalMuxPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
            <ComposerDock />
            <AnimatePresence>
              {activeSurface && activeSurface !== 'terminal' && <SurfaceDrawer />}
            </AnimatePresence>
            {livePermission && (
              <LivePermissionModal
                request={livePermission}
                loading={loading}
                onDecide={decideLivePermission}
              />
            )}
          </Panel>
        </PanelGroup>
      </div>
    </HarnessStateProvider>
  );
}
export {
  SessionActivityCapsule,
  EvidenceFeedCapsule,
  PeerMessagesCapsule,
  CompactCheckpointCapsule,
  DiffPreviewCapsule,
  InlineHandoffCapsule,
  ActiveWorktreeCapsule,
  TaskGraphCapsule,
  MergeReviewCapsule,
  ApprovalHistoryCapsule,
} from './chat-widgets';
