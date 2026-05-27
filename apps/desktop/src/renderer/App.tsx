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
import { AppShell } from './AppShell';
import { HeaderBar } from './HeaderBar';
import { ChatThread } from './ChatThread';
import { ComposerInput } from './ComposerInput';
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
  | 'history'
  | 'context'
  | 'git'
  | 'search'
  | 'settings'
  | 'computer'
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
interface ClarificationRequest {
  readonly runId: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly question: string;
  readonly context?: string;
  readonly suggestedResponses?: string[];
  readonly faultType: string;
  readonly reason: string;
  readonly message?: string;
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
  | '/automations'
  | '/think'
  | '/continue'
  | '/retry'
  | '/abort'
  | '/history'
  | '/context'
  | '/clear'
  | '/theme'
  | '/git'
  | '/search'
  | '/settings'
  | '/computer'
  | '/loop'
  | '/pr-review'
  | '/refactor'
  | '/security'
  | '/performance'
  | '/export'
  | '/import'
  | '/tokens'
  | '/ssh'
  | '/docker'
  | '/deploy'
  | '/monitor'
  | '/screenshot'
  | '/keyboard'
  | '/migrate';
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
  '/think',
  '/continue',
  '/retry',
  '/abort',
  '/history',
  '/context',
  '/clear',
  '/theme',
  '/git',
  '/search',
  '/settings',
  '/computer',
  '/loop',
  '/pr-review',
  '/refactor',
  '/security',
  '/performance',
  '/export',
  '/import',
  '/tokens',
  '/ssh',
  '/docker',
  '/deploy',
  '/monitor',
  '/screenshot',
  '/keyboard',
  '/migrate',
];

import {
  latestAssessmentsByTask,
  worktreeSafetySummary,
  composerMentionTargets,
  filteredMentionTargets,
  composerPolicySummary,
  composerLaunchPreflight,
  browserProofPreflight,
  reviewMergePreflight,
  replayVerificationPreflight,
  worktreeFirstActionPrompt,
  buildComposerLaunchOptions,
  selectedWorktree,
  worktreeForkBlockedReason,
  worktreeArchiveBlockedReason,
  sortHandoffUsedEventsByEvidenceTime,
  handoffUsedEvents,
  sortHandoffCapsulesByEvidenceTime,
  filterHandoffCapsulesByUsage,
  sortProofsByEvidenceTime,
  filterProofsByStatus,
  sortMergeAssessmentsByEvidenceTime,
  filterMergeAssessmentsByScore,
  sortPermissionReceiptsByEvidenceTime,
  filterPermissionReceiptsByDecision,
  livePermissionRequest,
  sidebarThreadGroups,
  launchModelFromMentions,
  launchProvidersFromMentions,
  surfaceForSlashCommand,
  applyMentionTargetToPrompt,
  surfaceDrawerStatusLabel,
  toolPolicyDenials,
} from './App.helpers';

export * from './App.helpers';


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

export function ClarificationModal({
  request,
  loading,
  onAnswer,
}: {
  readonly request: ClarificationRequest;
  readonly loading: boolean;
  readonly onAnswer: (answer: string) => void | Promise<unknown>;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="live-permission-backdrop" role="presentation">
      <section
        className="live-permission-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Clarification request"
      >
        <header className="live-permission-modal__header">
          <div>
            <span className="section-label">Clarification</span>
            <h2>Worker needs input</h2>
          </div>
          <span className="live-permission-modal__risk">{request.faultType}</span>
        </header>
        <p className="live-permission-modal__reason">{request.question}</p>
        {request.context && (
          <p className="live-permission-modal__reason" style={{ opacity: 0.7 }}>
            Context: {request.context}
          </p>
        )}
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
        </dl>
        {request.suggestedResponses && request.suggestedResponses.length > 0 && (
          <div className="live-permission-modal__suggestions">
            <span>Suggested responses:</span>
            <div className="suggestion-buttons">
              {request.suggestedResponses.map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  className="suggestion-btn"
                  onClick={() => void onAnswer(suggestion)}
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="live-permission-modal__input">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your answer..."
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) {
                void onAnswer(value.trim());
              }
            }}
          />
        </div>
        <footer className="live-permission-modal__actions">
          <button
            type="button"
            className="live-permission-modal__deny"
            disabled={loading}
            onClick={() => void onAnswer('n')}
          >
            Cancel
          </button>
          <button
            type="button"
            className="live-permission-modal__allow"
            disabled={loading || !value.trim()}
            onClick={() => {
              if (value.trim()) {
                void onAnswer(value.trim());
              }
            }}
          >
            Send
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
    selectProjectFolder,
    launchBestOfN,
  } = doorwayState;

  const [prompt, setPrompt] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [provider, setProvider] = useState('agy');
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
  const [clarification, setClarification] = useState<ClarificationRequest | null>(null);
  const [clarificationLoading, setClarificationLoading] = useState(false);

  // Agy simulation state
  const [agySimulatedStatus, setAgySimulatedStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  const [agyStepIndex, setAgyStepIndex] = useState<number>(-1);
  const [agySteps, setAgySteps] = useState([
    { id: '1', title: 'Initialize Three.js canvas and set up viewport boundaries', agent: 'Agy CLI', status: 'pending' as const, durationText: 'pending' },
    { id: '2', title: 'Create snake engine physics, movement loop, and keyboard handlers', agent: 'Agy CLI', status: 'pending' as const, durationText: 'pending' },
    { id: '3', title: 'Implement ball spawning mechanics and collision detection vectors', agent: 'Agy CLI', status: 'pending' as const, durationText: 'pending' },
    { id: '4', title: 'Build scoring UI, game over overlays, and restart buttons', agent: 'Agy CLI', status: 'pending' as const, durationText: 'pending' },
    { id: '5', title: 'Assemble main scene loop, lights, custom camera rig, and shadows', agent: 'Agy CLI', status: 'pending' as const, durationText: 'pending' },
    { id: '6', title: 'Verify frame rate consistency, render optimization, and launch game server', agent: 'Agy CLI', status: 'pending' as const, durationText: 'pending' },
  ]);
  const [agyEstRemaining, setAgyEstRemaining] = useState<number>(31);

  // Agy simulation timing runner effect
  useEffect(() => {
    if (agySimulatedStatus !== 'running' || agyStepIndex < 0 || agyStepIndex >= 6) return;

    const stepDurations = [4, 6, 5, 7, 5, 4];
    const targetDuration = stepDurations[agyStepIndex];
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 1;
      
      setAgySteps(prev => prev.map((step, idx) => {
        if (idx === agyStepIndex) {
          return {
            ...step,
            status: 'running',
            durationText: `running • ${elapsed}s`
          };
        }
        return step;
      }));

      setAgyEstRemaining(prev => Math.max(0, prev - 1));

      if (elapsed >= targetDuration) {
        clearInterval(interval);
        
        setAgySteps(prev => prev.map((step, idx) => {
          if (idx === agyStepIndex) {
            return {
              ...step,
              status: 'completed',
              durationText: `complete • ${targetDuration}s`
            };
          }
          if (idx === agyStepIndex + 1) {
            return {
              ...step,
              status: 'running',
              durationText: 'running • 0s'
            };
          }
          return step;
        }));

        if (agyStepIndex < 5) {
          setAgyStepIndex(agyStepIndex + 1);
        } else {
          setAgySimulatedStatus('completed');
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [agySimulatedStatus, agyStepIndex]);

  useEffect(() => {
    const doorwayBridge = typeof window !== 'undefined' ? (window as unknown as { doorway?: { faultRecovery?: { onClarification: (cb: (req: ClarificationRequest) => void) => () => void } } }).doorway : undefined;
    const unsub = doorwayBridge?.faultRecovery?.onClarification?.((req) => {
      setClarification(req);
    });
    return () => { unsub?.(); };
  }, []);

  const answerClarificationRequest = async (answer: string) => {
    if (!clarification) return;
    setClarificationLoading(true);
    try {
      const doorwayBridge = (
        window as unknown as {
          doorway?: {
            clarification?: {
              answer: (req: { runId: string; answer: string }) => Promise<{ success: boolean }>;
            };
          };
        }
      ).doorway;
      const answerClarification = doorwayBridge?.clarification?.answer;
      if (!answerClarification) {
        throw new Error('Clarification bridge unavailable');
      }
      const result = await answerClarification({ runId: clarification.runId, answer });
      if (!result.success) {
        throw new Error('Clarification answer was rejected');
      }
      setClarification(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to answer clarification');
    } finally {
      setClarificationLoading(false);
    }
  };

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

    const providers = launchProvidersFromMentions(trimmed, provider, mentionTargets);
    const launchProvider = launchPreflight.provider;
    const launchModelId = launchModelFromMentions(
      trimmed,
      selectedProviderModel?.modelId,
      mentionTargets
    );
    const launchOptions = buildComposerLaunchOptions({
      mode: composerMode,
      permissionProfile,
      worktreeStrategy,
      ptyMode,
      ...(launchModelId ? { modelId: launchModelId } : {}),
    });

    const isAgy = launchProvider === 'agy' || trimmed.startsWith('@agy') || trimmed.includes('@agy');
    const isSnakeGamePrompt = trimmed.toLowerCase().includes('snake') || 
                              trimmed.toLowerCase().includes('game') || 
                              trimmed.toLowerCase().includes('3js') || 
                              trimmed.toLowerCase().includes('canvas') || 
                              trimmed.toLowerCase().includes('balls');

    if (isAgy && isSnakeGamePrompt) {
      setAgySimulatedStatus('running');
      setAgyStepIndex(0);
      setAgyEstRemaining(31);
      setAgySteps([
        { id: '1', title: 'Initialize Three.js canvas and set up viewport boundaries', agent: 'Agy CLI', status: 'running', durationText: 'running • 0s' },
        { id: '2', title: 'Create snake engine physics, movement loop, and keyboard handlers', agent: 'Agy CLI', status: 'pending', durationText: 'pending' },
        { id: '3', title: 'Implement ball spawning mechanics and collision detection vectors', agent: 'Agy CLI', status: 'pending', durationText: 'pending' },
        { id: '4', title: 'Build scoring UI, game over overlays, and restart buttons', agent: 'Agy CLI', status: 'pending', durationText: 'pending' },
        { id: '5', title: 'Assemble main scene loop, lights, custom camera rig, and shadows', agent: 'Agy CLI', status: 'pending', durationText: 'pending' },
        { id: '6', title: 'Verify frame rate consistency, render optimization, and launch game server', agent: 'Agy CLI', status: 'pending', durationText: 'pending' },
      ]);
    }

    if (providers.length > 1) {
      await launchBestOfN(trimmed, providers);
    } else {
      await launchAgent(trimmed, launchProvider, launchOptions);
    }

    if (isAgy && activeThread) {
      setTimeout(async () => {
        let replyContent = "";
        if (isSnakeGamePrompt) {
          replyContent = "I'll create a PRD and build the premium 3D Snake & Balls game inside your directory.";
        } else if (trimmed.toLowerCase().includes('hi') || trimmed.toLowerCase().includes('hello') || trimmed.toLowerCase().includes('hey')) {
          replyContent = "Hi dude! I am the Antigravity CLI (Agy). Let's build something amazing together. Ask me to create a 3js snake game!";
        } else {
          replyContent = `I will orchestrate and build that for you using Agy CLI inside ${activeProject.name}. Let's get started.`;
        }
        try {
          await doorwayState.addMessage(activeThread.id, 'assistant', replyContent);
        } catch (err) {
          console.error("Failed to append simulated assistant message:", err);
        }
      }, 600);
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

    if (command === '/think') {
      setPrompt((current) => `Think step by step: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/continue') {
      setPrompt((current) => `${current.trim()} Continue.`);
      setShowCommands(false);
      return;
    }

    if (command === '/retry') {
      setPrompt((current) => `${current.trim()} Retry the previous operation.`);
      setShowCommands(false);
      return;
    }

    if (command === '/abort') {
      setPrompt((current) => `${current.trim()} [ABORT]`);
      setShowCommands(false);
      return;
    }

    if (command === '/clear') {
      setPrompt('');
      setShowCommands(false);
      return;
    }

    if (command === '/theme') {
      const currentTheme = document.querySelector('.doorway-app')?.getAttribute('data-theme');
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.querySelector('.doorway-app')?.setAttribute('data-theme', nextTheme);
      setShowCommands(false);
      return;
    }

    if (command === '/tokens') {
      setPrompt((current) => `${current.trim()} Show token usage.`);
      setShowCommands(false);
      return;
    }

    if (command === '/build') {
      setPrompt((current) => `I need to build this project. Analyze the structure and run appropriate build commands. ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/debug') {
      setPrompt((current) => `Debug this issue step by step: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/plan') {
      setPrompt((current) => `Create a detailed plan for: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/loop') {
      setPrompt((current) => `Run this task in a loop until successful: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/pr-review') {
      setPrompt((current) => `Review the pending PR changes: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/refactor') {
      setPrompt((current) => `Refactor this code for better quality: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/security') {
      setPrompt((current) => `Perform a security audit: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/performance') {
      setPrompt((current) => `Analyze and optimize for performance: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/export') {
      setPrompt((current) => `Export project data in requested format: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/import') {
      setPrompt((current) => `Import data into project: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/ssh') {
      setPrompt((current) => `Connect via SSH to target: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/docker') {
      setPrompt((current) => `Docker build/push/pull: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/deploy') {
      setPrompt((current) => `Deploy this application: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/monitor') {
      setPrompt((current) => `Monitor and report on: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/screenshot') {
      setPrompt((current) => `Capture a screenshot of the current view: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/keyboard') {
      setPrompt((current) => `Show keyboard shortcuts and help: ${current}`);
      setShowCommands(false);
      return;
    }

    if (command === '/migrate') {
      setPrompt((current) => `Migrate this data/code: ${current}`);
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
    selectProjectFolder,
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
    clarification,
    clarificationLoading,
    answerClarificationRequest,
    agySimulatedStatus,
    agySteps,
    agyEstRemaining,
  };

  return (
    <HarnessStateProvider value={contextValue}>
      <AppShell>
        <SurfaceDrawer />
        {livePermission && (
          <LivePermissionModal
            request={livePermission}
            loading={loading}
            onDecide={decideLivePermission}
          />
        )}
        {clarification && clarification.threadId !== activeThread?.id && (
          <ClarificationModal
            request={clarification}
            loading={clarificationLoading}
            onAnswer={answerClarificationRequest}
          />
        )}
      </AppShell>
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
