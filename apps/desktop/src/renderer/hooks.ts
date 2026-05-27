/**
 * Doorway Desktop - App Hooks
 *
 * Custom hooks for connecting UI to IPC services.
 */

import { useState, useEffect, useCallback } from 'react';
import { readPersistedThreadState } from './thread-refresh';
import type {
  Automation,
  AutomationRun,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@doorway/core';
import type {
  AgentLaunchOptions,
  CompactCheckpointProjection,
  DiffProjection,
  DoorwayEvent,
  HandoffCapsuleProjection,
  MessageProjection,
  MergeAssessmentProjection,
  MeshMessageProjection,
  OperationalMemoryProjection,
  PermissionDecision,
  PermissionReceiptProjection,
  ProjectMemorySource,
  ProjectPluginProjection,
  ProjectMode,
  ProjectProjection,
  ProviderModelProjection,
  ProofProjection,
  TaskGraphProjection,
  TaskNodeStatus,
  TerminalInputProjection,
  TerminalInputSource,
  TerminalProjection,
  ThreadProjection,
  ToolCapabilityProjection,
  ToolLaneProjection,
  TranscriptChunk,
  WorktreeProjection,
} from '@doorway/protocol';
import { terminalSubmitInput } from '@doorway/protocol';
import type { TerminalBlock } from '@doorway/terminal-runtime';

// ============================================================================
// Utilities
// ============================================================================

export function appendRetained<T>(items: readonly T[], item: T, maxItems: number): readonly T[] {
  const retainedCount = Math.max(maxItems - 1, 0);
  if (retainedCount === 0) {
    return [item];
  }
  return [...items.slice(-retainedCount), item];
}

export function launchThreadRefreshId(
  activeThread: ThreadProjection | null,
  resultThreadId: string | undefined
): string | undefined {
  return activeThread?.id ?? resultThreadId;
}

export function mergeLaunchedThreadList(
  threads: readonly ThreadProjection[],
  launchedThread: ThreadProjection
): ThreadProjection[] {
  return threads.some((thread) => thread.id === launchedThread.id)
    ? [...threads]
    : [launchedThread, ...threads];
}

export interface AgentLaunchResult {
  readonly runId?: string;
  readonly runIds?: readonly string[];
  readonly threadId?: string;
  readonly sessionId?: string;
  readonly reusedLane?: boolean;
  readonly multiAgent?: boolean;
}

export function primaryLaunchRunId(result: AgentLaunchResult): string | undefined {
  return result.runId ?? result.runIds?.[0];
}

export function permissionDecisionTerminalInput(decision: PermissionDecision): string {
  return terminalSubmitInput(decision === 'approved' ? 'y' : 'n');
}

// ============================================================================
// IPC Bridge Types
// ============================================================================

interface ThreadReplayVerificationResult {
  readonly path: string;
  readonly eventCount: number;
  readonly verified: boolean;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly threadIds: readonly string[];
}

type LiveAgentEvent = {
  readonly runId: string;
  readonly type: string;
  readonly data: string;
  readonly timestamp: Date;
};

interface TerminalDataPayload {
  readonly sessionId: string;
  readonly data: string;
  readonly chunk?: TranscriptChunk;
}

export function mergeLiveTerminalChunk(
  chunks: readonly TranscriptChunk[],
  payload: TerminalDataPayload
): readonly TranscriptChunk[] {
  const liveChunk = payload.chunk;
  if (!liveChunk) {
    return chunks;
  }
  if (liveChunk.sessionId !== payload.sessionId) {
    return chunks;
  }
  const existingIndex = chunks.findIndex(
    (chunk) => chunk.sessionId === liveChunk.sessionId && chunk.sequence === liveChunk.sequence
  );
  const nextChunks =
    existingIndex >= 0
      ? chunks.map((chunk, index) => (index === existingIndex ? liveChunk : chunk))
      : [...chunks, liveChunk];
  return nextChunks.sort((left, right) => left.sequence - right.sequence);
}

interface DoorwayAPI {
  selectProjectFolder(): Promise<string | null>;
  openProject(req: {
    path: string;
    name?: string;
    packageManager?: string;
    framework?: string;
    mode?: ProjectMode;
  }): Promise<ProjectProjection>;
  listProjects(): Promise<ProjectProjection[]>;
  listProjectMemorySources(req: { path: string }): Promise<ProjectMemorySource[]>;
  listProjectPlugins(req: { projectId: string }): Promise<ProjectPluginProjection[]>;
  listProjectFiles(path: string): Promise<any[]>;
  listProviderModels(): Promise<ProviderModelProjection[]>;
  listToolCapabilities(req?: {
    projectId?: string;
    threadId?: string;
  }): Promise<ToolCapabilityProjection[]>;
  listToolLanes(threadId: string): Promise<ToolLaneProjection[]>;
  setToolEnabled(req: {
    threadId: string;
    toolId: string;
    enabled: boolean;
  }): Promise<ToolCapabilityProjection>;
  listAutomations(req: { projectId: string }): Promise<Automation[]>;
  createAutomation(req: CreateAutomationInput): Promise<Automation>;
  updateAutomation(req: UpdateAutomationInput): Promise<Automation>;
  deleteAutomation(id: string): Promise<{ deleted: boolean }>;
  getAutomationRuns(automationId: string): Promise<AutomationRun[]>;
  runAutomationNow(id: string): Promise<AutomationRun | null>;

  createThread(req: {
    projectId: string;
    title?: string;
    goal?: string;
  }): Promise<ThreadProjection>;
  getThread(id: string): Promise<ThreadProjection | null>;
  listThreads(req?: { projectId?: string }): Promise<ThreadProjection[]>;
  addMessage(threadId: string, req: { role: string; content: string }): Promise<MessageProjection>;
  getMessages(threadId: string): Promise<MessageProjection[]>;
  getThreadEvents(threadId: string): Promise<DoorwayEvent[]>;
  getThreadOperationalMemory(threadId: string): Promise<OperationalMemoryProjection>;
  exportThreadReplay(req: {
    threadId: string;
  }): Promise<{ path: string; messageCount: number; eventCount: number }>;
  verifyThreadReplay(req: {
    path: string;
    threadId?: string;
  }): Promise<ThreadReplayVerificationResult>;
  getThreadProofs(threadId: string): Promise<ProofProjection[]>;
  getThreadPermissionReceipts(threadId: string): Promise<PermissionReceiptProjection[]>;
  decidePermission(req: {
    threadId: string;
    decision: PermissionDecision;
    command: string;
    runId?: string;
    sessionId?: string;
    riskCategory?: string;
    userNotes?: string;
  }): Promise<PermissionReceiptProjection>;
  getThreadMergeAssessments(threadId: string): Promise<MergeAssessmentProjection[]>;
  getThreadHandoffCapsules(threadId: string): Promise<HandoffCapsuleProjection[]>;
  getThreadPeerMessages(threadId: string): Promise<MeshMessageProjection[]>;
  getThreadTaskGraphs(threadId: string): Promise<TaskGraphProjection[]>;
  getThreadCompactCheckpoints(threadId: string): Promise<CompactCheckpointProjection[]>;
  createCompactCheckpoint(req: { threadId: string }): Promise<CompactCheckpointProjection>;
  updateTaskNodeStatus(req: {
    threadId: string;
    nodeId: string;
    status: TaskNodeStatus;
  }): Promise<TaskGraphProjection>;
  createHandoff(req: {
    threadId: string;
    worktreePath?: string;
    targetProvider?: string;
  }): Promise<HandoffCapsuleProjection | undefined>;
  copyText(req: {
    text: string;
    threadId?: string;
    capsuleId?: string;
  }): Promise<{ copied: boolean }>;
  openPath(req: {
    path: string;
    threadId?: string;
    capsuleId?: string;
    worktreePath?: string;
    filePath?: string;
  }): Promise<{ opened: boolean }>;

  launchAgent(req: {
    threadId?: string;
    projectId?: string;
    prompt: string;
    provider?: string;
    launchOptions?: AgentLaunchOptions;
  }): Promise<AgentLaunchResult>;
  launchBestOfN(req: {
    threadId?: string;
    projectId?: string;
    prompt: string;
    providers?: string[];
  }): Promise<{ runIds: string[]; threadId: string }>;
  interruptAgent(runId: string): Promise<void>;
  terminateAgent(runId: string): Promise<void>;

  createTerminal(req?: {
    cwd?: string;
    shell?: string;
    threadId?: string;
  }): Promise<{ sessionId: string }>;
  writeTerminal(
    sessionId: string,
    data: string,
    metadata?: { readonly threadId?: string; readonly source?: TerminalInputSource }
  ): Promise<void>;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
  stopTerminal(sessionId: string): Promise<{ stopped: boolean }>;
  getTerminalTranscript(sessionId: string): Promise<TranscriptChunk[]>;
  getTerminalBlocks(sessionId: string): Promise<TerminalBlock[]>;
  getTerminalInputs(sessionId: string): Promise<TerminalInputProjection[]>;
  listTerminals(threadId: string): Promise<TerminalProjection[]>;

  listWorktrees(): Promise<WorktreeProjection[]>;
  getWorktreeDiff(path: string, threadId?: string): Promise<DiffProjection>;
  forkWorktree(req: { threadId: string; worktreePath: string }): Promise<WorktreeProjection>;
  archiveWorktree(req: {
    threadId: string;
    worktreePath: string;
  }): Promise<{ archived: boolean; worktreeId: string; branchDeleted?: boolean }>;
  archiveMergedWorktreeBranch(req: {
    threadId: string;
    worktreePath: string;
  }): Promise<{ archived: boolean; worktreeId: string; branchDeleted?: boolean }>;
  exportRollbackPatch(req: {
    threadId: string;
    worktreePath: string;
  }): Promise<{ path: string; patchBytes: number; worktreePath: string; branch: string }>;
  evaluateMergeReadiness(req: {
    threadId: string;
    worktreePath: string;
  }): Promise<MergeAssessmentProjection>;
  approveWorktreeMerge(req: {
    threadId: string;
    worktreePath: string;
  }): Promise<PermissionReceiptProjection>;
  createIntegrationMerge(req: {
    threadId: string;
    worktreePath: string;
  }): Promise<{ success: boolean; conflicts?: readonly string[]; branch: string }>;

  onAgentEvent(callback: (payload: LiveAgentEvent) => void): () => void;
  onTerminalData(callback: (payload: TerminalDataPayload) => void): () => void;
  onDbChange(callback: (payload: unknown) => void): () => void;

  launchBrowser(options: { url?: string; threadId?: string }): Promise<void>;
  toggleBrowserControl(options: { isAgent: boolean }): Promise<void>;
  exportBrowserEvidence(req: {
    threadId: string;
  }): Promise<{ path: string; screenshotCount: number; actionCount: number }>;
  onBrowserStateChange(
    callback: (state: {
      url: string;
      title: string;
      isLoading: boolean;
      isAgentControlled: boolean;
    }) => void
  ): () => void;
  onBrowserAction(
    callback: (action: {
      timestamp: Date;
      type: string;
      selector?: string;
      text?: string;
      url?: string;
      screenshot?: string;
    }) => void
  ): () => void;

  // Clarification
  answerClarification(req: { runId: string; answer: string }): Promise<{ success: boolean; runId: string }>;
  getClarification(clarificationId: string): Promise<ClarificationProjection | null>;
  pendingClarifications(sessionId: string): Promise<ClarificationProjection[]>;
}

export interface ClarificationProjection {
  readonly id: string;
  readonly runId: string;
  readonly threadId: string;
  readonly sessionId: string;
  readonly question: string;
  readonly context?: string;
  readonly suggestedResponses?: string[];
  readonly status: 'pending' | 'answered' | 'cancelled';
  readonly createdAt: Date;
}

// ============================================================================
// Unavailable Bridge
// ============================================================================

function bridgeUnavailable(action: string): never {
  throw new Error(
    `Doorway backend bridge is not available for ${action}. Open the Electron desktop app to use this action.`
  );
}

function noopSubscription(): () => void {
  return () => {
    return;
  };
}

function emptyOperationalMemoryProjection(threadId: string): OperationalMemoryProjection {
  return {
    threadId: threadId as OperationalMemoryProjection['threadId'],
    observedCommands: [],
    repeatedCommands: [],
    storedPatternCount: 0,
    generatedAt: new Date(),
  };
}

export function createUnavailableDoorwayAPI(): DoorwayAPI {
  return {
    selectProjectFolder: async () => bridgeUnavailable('selectProjectFolder'),
    openProject: async () => bridgeUnavailable('openProject'),
    listProjects: async () => [],
    listProjectMemorySources: async () => [],
    listProjectPlugins: async () => [],
    listProjectFiles: async () => [],
    listProviderModels: async () => [],
    listToolCapabilities: async () => [],
    listToolLanes: async () => [],
    setToolEnabled: async () => bridgeUnavailable('setToolEnabled'),
    listAutomations: async () => [],
    createAutomation: async () => bridgeUnavailable('createAutomation'),
    updateAutomation: async () => bridgeUnavailable('updateAutomation'),
    deleteAutomation: async () => bridgeUnavailable('deleteAutomation'),
    getAutomationRuns: async () => [],
    runAutomationNow: async () => bridgeUnavailable('runAutomationNow'),

    createThread: async () => bridgeUnavailable('createThread'),
    getThread: async () => null,
    listThreads: async () => [],
    addMessage: async () => bridgeUnavailable('addMessage'),
    getMessages: async () => [],
    getThreadEvents: async () => [],
    getThreadOperationalMemory: async (threadId) => emptyOperationalMemoryProjection(threadId),
    exportThreadReplay: async () => bridgeUnavailable('exportThreadReplay'),
    verifyThreadReplay: async () => bridgeUnavailable('verifyThreadReplay'),
    getThreadProofs: async () => [],
    getThreadPermissionReceipts: async () => [],
    decidePermission: async () => bridgeUnavailable('decidePermission'),
    getThreadMergeAssessments: async () => [],
    getThreadHandoffCapsules: async () => [],
    getThreadPeerMessages: async () => [],
    getThreadTaskGraphs: async () => [],
    getThreadCompactCheckpoints: async () => [],
    createCompactCheckpoint: async () => bridgeUnavailable('createCompactCheckpoint'),
    updateTaskNodeStatus: async () => bridgeUnavailable('updateTaskNodeStatus'),
    createHandoff: async () => bridgeUnavailable('createHandoff'),
    copyText: async () => bridgeUnavailable('copyText'),
    openPath: async () => bridgeUnavailable('openPath'),

    launchAgent: async () => bridgeUnavailable('launchAgent'),
    launchBestOfN: async () => bridgeUnavailable('launchBestOfN'),
    interruptAgent: async () => bridgeUnavailable('interruptAgent'),
    terminateAgent: async () => bridgeUnavailable('terminateAgent'),

    createTerminal: async () => bridgeUnavailable('createTerminal'),
    writeTerminal: async () => bridgeUnavailable('writeTerminal'),
    resizeTerminal: async () => bridgeUnavailable('resizeTerminal'),
    stopTerminal: async () => bridgeUnavailable('stopTerminal'),
    getTerminalTranscript: async () => [],
    getTerminalBlocks: async () => [],
    getTerminalInputs: async () => [],
    listTerminals: async () => [],

    listWorktrees: async () => [],
    getWorktreeDiff: async () => bridgeUnavailable('getWorktreeDiff'),
    forkWorktree: async () => bridgeUnavailable('forkWorktree'),
    archiveWorktree: async () => bridgeUnavailable('archiveWorktree'),
    archiveMergedWorktreeBranch: async () => bridgeUnavailable('archiveMergedWorktreeBranch'),
    exportRollbackPatch: async () => bridgeUnavailable('exportRollbackPatch'),
    evaluateMergeReadiness: async () => bridgeUnavailable('evaluateMergeReadiness'),
    approveWorktreeMerge: async () => bridgeUnavailable('approveWorktreeMerge'),
    createIntegrationMerge: async () => bridgeUnavailable('createIntegrationMerge'),

    onAgentEvent: noopSubscription,
    onTerminalData: noopSubscription,
    onDbChange: noopSubscription,

    launchBrowser: async () => bridgeUnavailable('launchBrowser'),
    toggleBrowserControl: async () => bridgeUnavailable('toggleBrowserControl'),
    exportBrowserEvidence: async () => bridgeUnavailable('exportBrowserEvidence'),
    onBrowserStateChange: noopSubscription,
    onBrowserAction: noopSubscription,

    answerClarification: async () => bridgeUnavailable('answerClarification'),
    getClarification: async () => null,
    pendingClarifications: async () => [],
  };
}

const unavailableDoorwayAPI = createUnavailableDoorwayAPI();

// ============================================================================
// Main Hook
// ============================================================================

export function useDoorway() {
  const [projects, setProjects] = useState<ProjectProjection[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectProjection | null>(null);
  const [projectFiles, setProjectFiles] = useState<any[]>([]);
  const [projectMemorySources, setProjectMemorySources] = useState<ProjectMemorySource[]>([]);
  const [projectPlugins, setProjectPlugins] = useState<ProjectPluginProjection[]>([]);
  const [providerModels, setProviderModels] = useState<ProviderModelProjection[]>([]);
  const [toolCapabilities, setToolCapabilities] = useState<ToolCapabilityProjection[]>([]);
  const [toolLanes, setToolLanes] = useState<ToolLaneProjection[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationRuns, setAutomationRuns] = useState<Record<string, AutomationRun[]>>({});
  const [threads, setThreads] = useState<ThreadProjection[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadProjection | null>(null);
  const [messages, setMessages] = useState<MessageProjection[]>([]);
  const [threadEvents, setThreadEvents] = useState<DoorwayEvent[]>([]);
  const [operationalMemory, setOperationalMemory] = useState<OperationalMemoryProjection | null>(
    null
  );
  const [proofs, setProofs] = useState<ProofProjection[]>([]);
  const [permissionReceipts, setPermissionReceipts] = useState<PermissionReceiptProjection[]>([]);
  const [mergeAssessments, setMergeAssessments] = useState<MergeAssessmentProjection[]>([]);
  const [handoffCapsules, setHandoffCapsules] = useState<HandoffCapsuleProjection[]>([]);
  const [peerMessages, setPeerMessages] = useState<MeshMessageProjection[]>([]);
  const [taskGraphs, setTaskGraphs] = useState<TaskGraphProjection[]>([]);
  const [compactCheckpoints, setCompactCheckpoints] = useState<CompactCheckpointProjection[]>([]);
  const [agentEvents, setAgentEvents] = useState<readonly LiveAgentEvent[]>([]);
  const [activeTerminalSessionId, setActiveTerminalSessionId] = useState<string | null>(null);
  const [terminalSessions, setTerminalSessions] = useState<TerminalProjection[]>([]);
  const [terminalTranscript, setTerminalTranscript] = useState<TranscriptChunk[]>([]);
  const [terminalBlocks, setTerminalBlocks] = useState<TerminalBlock[]>([]);
  const [terminalInputs, setTerminalInputs] = useState<TerminalInputProjection[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeProjection[]>([]);
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<string | null>(null);
  const [activeDiff, setActiveDiff] = useState<DiffProjection | null>(null);
  const [browserState, setBrowserState] = useState({
    url: '',
    title: '',
    isLoading: false,
    isAgentControlled: true,
  });
  const [browserActions, setBrowserActions] = useState<
    Array<{
      timestamp: Date;
      type: string;
      selector?: string;
      text?: string;
      url?: string;
      screenshot?: string;
    }>
  >([]);
  const [threadReplayVerification, setThreadReplayVerification] =
    useState<ThreadReplayVerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doorwayBridge =
    typeof window === 'undefined'
      ? undefined
      : (window as unknown as { doorway?: DoorwayAPI }).doorway;
  const api: DoorwayAPI = doorwayBridge ?? unavailableDoorwayAPI;

  const loadProjectFiles = useCallback(async (path: string) => {
    try {
      setProjectFiles(await api.listProjectFiles(path));
    } catch (err) {
      console.error('Failed to load project files:', err);
    }
  }, [api]);

  useEffect(() => {
    if (activeProject) {
      void loadProjectFiles(activeProject.path);
    } else {
      setProjectFiles([]);
    }
  }, [activeProject, loadProjectFiles]);

  useEffect(() => {
    const unsubState = api.onBrowserStateChange?.((state) => setBrowserState(state));
    const unsubAction = api.onBrowserAction?.((action) =>
      setBrowserActions((prev) => [...appendRetained(prev, action, 50)])
    );
    return () => {
      unsubState?.();
      unsubAction?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = api.onAgentEvent((payload) =>
      setAgentEvents((prev) => [...appendRetained(prev, payload, 100)])
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = api.onTerminalData((payload) => {
      if (payload.sessionId === activeTerminalSessionId) {
        if (payload.chunk) {
          setTerminalTranscript((prev) => [...mergeLiveTerminalChunk(prev, payload)]);
        } else {
          void loadTerminalTranscript(payload.sessionId);
        }
      }
    });
    return unsubscribe;
  }, [activeTerminalSessionId]);

  useEffect(() => {
    if (!activeThread) return;
    const unsubscribe = api.onDbChange((payload) => {
      const p = payload as {
        table?: string;
        action?: string;
        threadId?: string;
        payload?: { threadId?: string };
      };
      const changedThreadId = p.threadId ?? p.payload?.threadId;
      // Only reload if the change is relevant to the active thread or a global table
      if (!changedThreadId || changedThreadId === activeThread.id) {
        void Promise.all([
          api.getThreadPeerMessages(activeThread.id),
          api.getThreadEvents(activeThread.id),
          api.listToolLanes(activeThread.id),
          api.getThreadOperationalMemory(activeThread.id),
          api.getThreadTaskGraphs(activeThread.id),
          api.listTerminals(activeThread.id),
        ]).then(
          ([
            nextPeerMessages,
            nextEvents,
            nextToolLanes,
            nextOperationalMemory,
            nextTaskGraphs,
            nextTerminalSessions,
          ]) => {
            setPeerMessages(nextPeerMessages);
            setThreadEvents(nextEvents);
            setToolLanes(nextToolLanes);
            setOperationalMemory(nextOperationalMemory);
            setTaskGraphs(nextTaskGraphs);
            setTerminalSessions(nextTerminalSessions);
            if (activeProject) {
              void loadProjectFiles(activeProject.path);
            }
          },
          (err: unknown) => {
            console.error('Failed to process db change sync', err);
          }
        );
      }
    });
    return unsubscribe;
  }, [activeThread, activeProject, loadProjectFiles]);

  useEffect(() => {
    void loadProjects();
    void loadWorktrees();
    void loadProviderModels();
    void loadToolCapabilities();
  }, []);

  useEffect(() => {
    if (terminalSessions.length > 0) {
      if (!activeTerminalSessionId || activeTerminalSessionId === 'current') {
        setActiveTerminalSessionId(terminalSessions[0].id);
      }
    }
  }, [terminalSessions, activeTerminalSessionId]);



  const loadProviderModels = useCallback(async () => {
    try {
      setProviderModels(await api.listProviderModels());
    } catch (err) {
      console.error('Failed to load provider models:', err);
    }
  }, []);

  const loadToolCapabilities = useCallback(async (projectId?: string, threadId?: string) => {
    try {
      setToolCapabilities(await api.listToolCapabilities({ projectId, threadId }));
    } catch (err) {
      console.error('Failed to load tool capabilities:', err);
    }
  }, []);

  const loadToolLanes = useCallback(async (threadId?: string) => {
    if (!threadId) {
      setToolLanes([]);
      return;
    }
    try {
      setToolLanes(await api.listToolLanes(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tool lanes');
    }
  }, []);

  const loadProjectMemorySources = useCallback(async (projectPath?: string) => {
    if (!projectPath) {
      setProjectMemorySources([]);
      return;
    }
    try {
      setProjectMemorySources(await api.listProjectMemorySources({ path: projectPath }));
    } catch (err) {
      setProjectMemorySources([]);
      console.error('Failed to load project memory sources:', err);
    }
  }, []);

  const loadProjectPlugins = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setProjectPlugins([]);
      return;
    }
    try {
      setProjectPlugins(await api.listProjectPlugins({ projectId }));
    } catch (err) {
      setProjectPlugins([]);
      setError(err instanceof Error ? err.message : 'Failed to load project plugins');
    }
  }, []);

  const loadAutomations = useCallback(async (projectId?: string) => {
    if (!projectId) {
      setAutomations([]);
      setAutomationRuns({});
      return;
    }
    try {
      setAutomations(await api.listAutomations({ projectId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automations');
    }
  }, []);

  const loadWorktrees = useCallback(async () => {
    try {
      setWorktrees(await api.listWorktrees());
    } catch (err) {
      console.error('Failed to load worktrees:', err);
    }
  }, []);

  const loadTerminalSessions = useCallback(async (threadId?: string) => {
    if (!threadId) {
      setTerminalSessions([]);
      return;
    }
    try {
      setTerminalSessions(await api.listTerminals(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terminal sessions');
    }
  }, []);

  const loadThreads = useCallback(async (projectId?: string) => {
    try {
      setThreads(await api.listThreads({ projectId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load threads');
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      setMessages(await api.getMessages(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }, []);

  const loadThreadEvents = useCallback(async (threadId: string) => {
    try {
      setThreadEvents(await api.getThreadEvents(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread events');
    }
  }, []);

  const loadOperationalMemory = useCallback(async (threadId?: string) => {
    if (!threadId) {
      setOperationalMemory(null);
      return;
    }
    try {
      setOperationalMemory(await api.getThreadOperationalMemory(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operational memory');
    }
  }, []);

  const loadProofs = useCallback(async (threadId: string) => {
    try {
      setProofs(await api.getThreadProofs(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proofs');
    }
  }, []);

  const loadPermissionReceipts = useCallback(async (threadId: string) => {
    try {
      setPermissionReceipts(await api.getThreadPermissionReceipts(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permission receipts');
    }
  }, []);

  const loadMergeAssessments = useCallback(async (threadId: string) => {
    try {
      setMergeAssessments(await api.getThreadMergeAssessments(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load merge assessments');
    }
  }, []);

  const loadHandoffCapsules = useCallback(async (threadId: string) => {
    try {
      setHandoffCapsules(await api.getThreadHandoffCapsules(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load handoff capsules');
    }
  }, []);

  const loadPeerMessages = useCallback(async (threadId: string) => {
    try {
      setPeerMessages(await api.getThreadPeerMessages(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load peer messages');
    }
  }, []);

  const loadTaskGraphs = useCallback(async (threadId: string) => {
    try {
      setTaskGraphs(await api.getThreadTaskGraphs(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task graphs');
    }
  }, []);

  const loadCompactCheckpoints = useCallback(async (threadId: string) => {
    try {
      setCompactCheckpoints(await api.getThreadCompactCheckpoints(threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load compact checkpoints');
    }
  }, []);

  const loadTerminalTranscript = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === 'current') {
      setTerminalTranscript([]);
      return;
    }
    try {
      setTerminalTranscript(await api.getTerminalTranscript(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terminal transcript');
    }
  }, [api]);

  const loadTerminalBlocks = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === 'current') {
      setTerminalBlocks([]);
      return;
    }
    try {
      setTerminalBlocks(await api.getTerminalBlocks(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terminal blocks');
    }
  }, [api]);

  const loadTerminalInputs = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === 'current') {
      setTerminalInputs([]);
      return;
    }
    try {
      setTerminalInputs(await api.getTerminalInputs(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terminal inputs');
    }
  }, [api]);

  useEffect(() => {
    if (activeTerminalSessionId) {
      void loadTerminalTranscript(activeTerminalSessionId);
      void loadTerminalBlocks(activeTerminalSessionId);
      void loadTerminalInputs(activeTerminalSessionId);
    } else {
      setTerminalTranscript([]);
      setTerminalBlocks([]);
      setTerminalInputs([]);
    }
  }, [activeTerminalSessionId, loadTerminalTranscript, loadTerminalBlocks, loadTerminalInputs]);

  const selectTerminalSession = useCallback(
    async (sessionId: string | null) => {
      setActiveTerminalSessionId(sessionId);
      if (sessionId) {
        await Promise.all([
          loadTerminalTranscript(sessionId),
          loadTerminalBlocks(sessionId),
          loadTerminalInputs(sessionId),
        ]);
      } else {
        setTerminalTranscript([]);
        setTerminalBlocks([]);
        setTerminalInputs([]);
      }
    },
    [loadTerminalTranscript, loadTerminalBlocks, loadTerminalInputs]
  );

  const writeActiveTerminal = useCallback(
    async (data: string, metadata?: { threadId?: string; source?: TerminalInputSource }) => {
      if (!activeTerminalSessionId) throw new Error('No active terminal');
      await api.writeTerminal(activeTerminalSessionId, data, metadata);
      await loadTerminalInputs(activeTerminalSessionId);
      await loadOperationalMemory(activeThread?.id);
    },
    [activeTerminalSessionId, activeThread, loadTerminalInputs, loadOperationalMemory]
  );

  const resizeActiveTerminal = useCallback(
    async (cols: number, rows: number) => {
      if (!activeTerminalSessionId) throw new Error('No active terminal');
      await api.resizeTerminal(activeTerminalSessionId, cols, rows);
    },
    [activeTerminalSessionId]
  );

  const stopActiveTerminal = useCallback(async () => {
    if (!activeTerminalSessionId) throw new Error('No active terminal');
    const result = await api.stopTerminal(activeTerminalSessionId);
    await loadTerminalSessions(activeThread?.id);
    await loadToolLanes(activeThread?.id);
    await loadOperationalMemory(activeThread?.id);
    return result;
  }, [
    activeTerminalSessionId,
    activeThread,
    loadTerminalSessions,
    loadToolLanes,
    loadOperationalMemory,
  ]);

  const selectProjectFolder = useCallback(async () => {
    try {
      const path = await api.selectProjectFolder();
      return path;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select folder');
      return null;
    }
  }, []);

  const openProject = useCallback(
    async (
      path: string,
      req?: { name?: string; packageManager?: string; framework?: string; mode?: ProjectMode }
    ) => {
      try {
        const project = await api.openProject({ path, ...req });
        setProjects((prev) => {
          const existing = prev.findIndex((p) => p.path === project.path);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = project;
            return next;
          }
          return [project, ...prev];
        });
        setActiveProject(project);
        void loadProjectMemorySources(project.path);
        void loadProjectPlugins(project.id);
        void loadAutomations(project.id);
        void loadThreads(project.id);
        return project;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open project');
        throw err;
      }
    },
    [loadProjectMemorySources, loadProjectPlugins, loadAutomations, loadThreads]
  );

  const selectProject = useCallback(
    (project: ProjectProjection | null) => {
      setActiveProject(project);
      if (project) {
        void loadProjectMemorySources(project.path);
        void loadProjectPlugins(project.id);
        void loadAutomations(project.id);
        void loadThreads(project.id);
      } else {
        setProjectMemorySources([]);
        setProjectPlugins([]);
        setAutomations([]);
        setAutomationRuns({});
        setThreads([]);
        setActiveThread(null);
      }
    },
    [loadProjectMemorySources, loadProjectPlugins, loadAutomations, loadThreads]
  );

  const createProjectAutomation = useCallback(
    async (input: CreateAutomationInput) => {
      if (!activeProject) throw new Error('Select a project before creating an automation.');
      const automation = await api.createAutomation({ ...input, projectId: activeProject.id });
      await loadAutomations(activeProject.id);
      return automation;
    },
    [activeProject, loadAutomations]
  );

  const updateProjectAutomation = useCallback(
    async (input: UpdateAutomationInput) => {
      const automation = await api.updateAutomation(input);
      await loadAutomations(activeProject?.id);
      return automation;
    },
    [activeProject, loadAutomations]
  );

  const deleteProjectAutomation = useCallback(
    async (id: string) => {
      const result = await api.deleteAutomation(id);
      await loadAutomations(activeProject?.id);
      return result;
    },
    [activeProject, loadAutomations]
  );

  const loadAutomationRuns = useCallback(async (id: string) => {
    const runs = await api.getAutomationRuns(id);
    setAutomationRuns((prev) => ({ ...prev, [id]: runs }));
    return runs;
  }, []);

  const runProjectAutomationNow = useCallback(
    async (id: string) => {
      const run = await api.runAutomationNow(id);
      await Promise.all([loadAutomations(activeProject?.id), loadAutomationRuns(id)]);
      if (run?.threadId) {
        await loadThreads(activeProject?.id);
      }
      return run;
    },
    [activeProject, loadAutomations, loadAutomationRuns, loadThreads]
  );

  useEffect(() => {
    if (projects.length > 0 && !activeProject) {
      selectProject(projects[0]);
    }
  }, [projects, activeProject, selectProject]);

  const selectThread = useCallback(
    async (threadId: string) => {
      setError(null);
      const thread = threadId ? (threads.find((t) => t.id === threadId) ?? null) : null;
      setActiveThread(thread);
      if (thread) {
        await Promise.all([
          loadMessages(thread.id),
          loadThreadEvents(thread.id),
          loadProofs(thread.id),
          loadPermissionReceipts(thread.id),
          loadMergeAssessments(thread.id),
          loadHandoffCapsules(thread.id),
          loadPeerMessages(thread.id),
          loadTaskGraphs(thread.id),
          loadCompactCheckpoints(thread.id),
          loadTerminalSessions(thread.id),
          loadToolLanes(thread.id),
          loadOperationalMemory(thread.id),
        ]);
      } else {
        setMessages([]);
        setThreadEvents([]);
        setProofs([]);
        setPermissionReceipts([]);
        setMergeAssessments([]);
        setHandoffCapsules([]);
        setPeerMessages([]);
        setTaskGraphs([]);
        setCompactCheckpoints([]);
        setTerminalSessions([]);
        setToolLanes([]);
        setOperationalMemory(null);
      }
    },
    [
      threads,
      loadMessages,
      loadThreadEvents,
      loadProofs,
      loadPermissionReceipts,
      loadMergeAssessments,
      loadHandoffCapsules,
      loadPeerMessages,
      loadTaskGraphs,
      loadCompactCheckpoints,
      loadTerminalSessions,
      loadToolLanes,
      loadOperationalMemory,
    ]
  );

  const createTerminal = useCallback(
    async (cwd?: string, threadId?: string) => {
      const targetCwd = cwd ?? activeProject?.path;
      const targetThreadId = threadId ?? activeThread?.id;
      const result = await api.createTerminal({
        cwd: targetCwd,
        threadId: targetThreadId,
      });
      setActiveTerminalSessionId(result.sessionId);
      await loadTerminalSessions(targetThreadId);
      await loadToolLanes(targetThreadId);
      return result;
    },
    [activeProject, activeThread, loadTerminalSessions, loadToolLanes]
  );

  const createThread = useCallback(
    async (title?: string) => {
      if (!activeProject) throw new Error('Select a project first');
      const thread = await api.createThread({ projectId: activeProject.id, title });
      setThreads((prev) => {
        const exists = prev.some((t) => t.id === thread.id);
        return exists ? prev : [thread, ...prev];
      });
      await selectThread(thread.id);
      try {
        const result = await api.createTerminal({ cwd: activeProject.path, threadId: thread.id });
        setActiveTerminalSessionId(result.sessionId);
        await loadTerminalSessions(thread.id);
        await loadToolLanes(thread.id);
      } catch (err) {
        console.error('Failed to auto-spawn terminal for new thread:', err);
      }
      return thread;
    },
    [activeProject, selectThread, loadTerminalSessions, loadToolLanes]
  );

  const addMessage = useCallback(async (threadId: string, role: string, content: string) => {
    const message = await api.addMessage(threadId, { role, content });
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  const loadWorktreeDiff = useCallback(async (worktreePath: string, threadId?: string) => {
    try {
      setActiveDiff(await api.getWorktreeDiff(worktreePath, threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load worktree diff');
    }
  }, []);

  const evaluateMergeReadiness = useCallback(
    async (worktreePath: string) => {
      if (!activeThread) throw new Error('Select a thread first');
      return api.evaluateMergeReadiness({ threadId: activeThread.id, worktreePath });
    },
    [activeThread]
  );

  const approveWorktreeMerge = useCallback(
    async (worktreePath: string) => {
      if (!activeThread) throw new Error('Select a thread first');
      return api.approveWorktreeMerge({ threadId: activeThread.id, worktreePath });
    },
    [activeThread]
  );

  const decidePermission = useCallback(
    async (req: {
      decision: PermissionDecision;
      command: string;
      runId?: string;
      sessionId?: string;
      riskCategory?: string;
      userNotes?: string;
    }) => {
      if (!activeThread) throw new Error('Select a thread first');
      const receipt = await api.decidePermission({ threadId: activeThread.id, ...req });
      setPermissionReceipts((prev) => [...prev, receipt]);
      if (req.sessionId && req.decision) {
        const input = permissionDecisionTerminalInput(req.decision);
        await api.writeTerminal(req.sessionId, input, { source: 'permission_decision' });
        await loadTerminalInputs(req.sessionId);
      }
      await loadThreadEvents(activeThread.id);
      await loadOperationalMemory(activeThread.id);
      return receipt;
    },
    [activeThread, loadThreadEvents, loadTerminalInputs, loadOperationalMemory]
  );

  const createIntegrationMerge = useCallback(
    async (worktreePath: string) => {
      if (!activeThread) throw new Error('Select a thread first');
      return api.createIntegrationMerge({ threadId: activeThread.id, worktreePath });
    },
    [activeThread]
  );

  const forkWorktree = useCallback(
    async (worktreePath: string) => {
      if (!activeThread) throw new Error('Select a thread first');
      try {
        const fork = await api.forkWorktree({ threadId: activeThread.id, worktreePath });
        await loadWorktrees();
        return fork;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fork worktree');
        throw err;
      }
    },
    [activeThread, loadWorktrees]
  );

  const archiveWorktree = useCallback(
    async (worktreePath: string, archiveMergedBranch?: boolean) => {
      if (!activeThread) throw new Error('Select a thread first');
      try {
        if (archiveMergedBranch) {
          await api.archiveMergedWorktreeBranch({ threadId: activeThread.id, worktreePath });
        } else {
          await api.archiveWorktree({ threadId: activeThread.id, worktreePath });
        }
        await loadWorktrees();
        if (selectedWorktreePath === worktreePath) {
          setSelectedWorktreePath(null);
          setActiveDiff(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to archive worktree');
        throw err;
      }
    },
    [activeThread, loadWorktrees, selectedWorktreePath]
  );

  const createHandoff = useCallback(
    async (worktreePath?: string, targetProvider?: string) => {
      if (!activeThread) throw new Error('Select a thread first');
      try {
        const capsule = await api.createHandoff({
          threadId: activeThread.id,
          worktreePath,
          targetProvider,
        });
        await loadHandoffCapsules(activeThread.id);
        return capsule;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create handoff');
        throw err;
      }
    },
    [activeThread, loadHandoffCapsules]
  );

  const copyText = useCallback(
    async (text: string) => {
      if (!activeThread) throw new Error('Select a thread first');
      return api.copyText({ text, threadId: activeThread.id });
    },
    [activeThread]
  );

  const openPath = useCallback(
    async (path: string, worktreePath?: string, filePath?: string) => {
      if (!activeThread) throw new Error('Select a thread first');
      return api.openPath({ path, threadId: activeThread.id, worktreePath, filePath });
    },
    [activeThread]
  );

  const launchAgent = useCallback(
    async (prompt: string, provider?: string, launchOptions?: AgentLaunchOptions) => {
      setError(null);
      const targetProjectId = activeProject?.id;
      const targetThreadId = activeThread?.id;
      let result: AgentLaunchResult;
      if (targetThreadId) {
        result = await api.launchAgent({
          threadId: targetThreadId,
          prompt,
          provider,
          launchOptions,
        });
      } else if (targetProjectId) {
        result = await api.launchAgent({
          projectId: targetProjectId,
          prompt,
          provider,
          launchOptions,
        });
      } else throw new Error('Select a project or thread first');

      const refreshThreadId = launchThreadRefreshId(activeThread, result.threadId);
      if (result.threadId) {
        const launchedThread = await api.getThread(result.threadId);
        if (launchedThread) {
          setThreads((prev) => mergeLaunchedThreadList(prev, launchedThread));
          setActiveThread(launchedThread);
        }
      }
      if (refreshThreadId) {
        const persisted = await readPersistedThreadState(api, refreshThreadId);
        setMessages(persisted.messages);
        setThreadEvents(persisted.events);
        setProofs(persisted.proofs);
        setPermissionReceipts(persisted.permissionReceipts);
        setMergeAssessments(persisted.mergeAssessments);
        setHandoffCapsules(persisted.handoffCapsules);
        setPeerMessages(persisted.peerMessages);
        setTaskGraphs(persisted.taskGraphs);
        await Promise.all([
          loadTerminalSessions(refreshThreadId),
          loadToolLanes(refreshThreadId),
          loadOperationalMemory(refreshThreadId),
          loadCompactCheckpoints(refreshThreadId),
        ]);
      }
      if (result.sessionId && result.sessionId !== 'current') {
        setActiveTerminalSessionId(result.sessionId);
      }
      const runId = primaryLaunchRunId(result);
      if (!runId) {
        throw new Error('Agent launch did not return a run id.');
      }
      return runId;
    },
    [
      activeProject,
      activeThread,
      loadTerminalSessions,
      loadToolLanes,
      loadOperationalMemory,
      loadCompactCheckpoints,
    ]
  );

  const launchBestOfN = useCallback(
    async (prompt: string, providers: string[]) => {
      if (!activeProject && !activeThread) throw new Error('Select a project or thread first');
      const result = await api.launchBestOfN({
        threadId: activeThread?.id,
        projectId: activeProject?.id,
        prompt,
        providers,
      });
      if (activeThread) {
        const launchedThread = await api.getThread(result.threadId);
        if (launchedThread) {
          setThreads((prev) => {
            const exists = prev.some((t) => t.id === launchedThread.id);
            return exists ? prev : [launchedThread, ...prev];
          });
          setActiveThread(launchedThread);
        }
        await Promise.all([loadTerminalSessions(activeThread.id), loadToolLanes(activeThread.id)]);
      }
      return result;
    },
    [activeProject, activeThread, loadTerminalSessions, loadToolLanes]
  );

  const interruptAgent = useCallback(async (runId: string) => {
    await api.interruptAgent(runId);
  }, []);
  const terminateAgent = useCallback(async (runId: string) => {
    await api.terminateAgent(runId);
  }, []);

  const updateGraphNodeStatus = useCallback(
    async (nodeId: string, status: TaskNodeStatus) => {
      if (!activeThread) throw new Error('Select a thread first');
      const updated = await api.updateTaskNodeStatus({ threadId: activeThread.id, nodeId, status });
      setTaskGraphs((prev) => prev.map((tg) => (tg.id === updated.id ? updated : tg)));
    },
    [activeThread]
  );

  const createCompactCheckpoint = useCallback(async () => {
    if (!activeThread) {
      setError('Select a thread before creating a compact checkpoint.');
      return undefined;
    }
    try {
      const checkpoint = await api.createCompactCheckpoint({ threadId: activeThread.id });
      await Promise.all([
        loadCompactCheckpoints(activeThread.id),
        loadThreadEvents(activeThread.id),
      ]);
      return checkpoint;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create compact checkpoint');
      throw err;
    }
  }, [activeThread, loadCompactCheckpoints, loadThreadEvents]);

  const launchBrowser = useCallback(
    async (url?: string) => {
      if (!activeThread) {
        setError('Select a thread before launching browser.');
        return;
      }
      try {
        setLoading(true);
        await api.launchBrowser({ url, threadId: activeThread.id });
        await loadThreadEvents(activeThread.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to launch browser');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [activeThread, loadThreadEvents]
  );

  const setToolEnabled = useCallback(
    async (toolId: string, enabled: boolean) => {
      if (!activeThread) {
        setError('Select a thread before changing tool permissions.');
        return null;
      }
      try {
        await api.setToolEnabled({ threadId: activeThread.id, toolId, enabled });
        await loadToolCapabilities(activeProject?.id, activeThread.id);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update tool permissions');
        throw err;
      }
    },
    [activeProject, activeThread, loadToolCapabilities]
  );

  const toggleBrowserControl = useCallback(async (isAgent: boolean) => {
    await api.toggleBrowserControl({ isAgent });
  }, []);

  const exportBrowserEvidence = useCallback(async () => {
    if (!activeThread) {
      setError('Select a thread before exporting browser evidence.');
      return undefined;
    }
    try {
      const bundle = await api.exportBrowserEvidence({ threadId: activeThread.id });
      await loadThreadEvents(activeThread.id);
      return bundle;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export browser evidence');
      throw err;
    }
  }, [activeThread, loadThreadEvents]);

  const exportThreadReplay = useCallback(async () => {
    if (!activeThread) {
      setError('Select a thread before exporting replay evidence.');
      return undefined;
    }
    try {
      const exported = await api.exportThreadReplay({ threadId: activeThread.id });
      const verified = await api.verifyThreadReplay({
        path: exported.path,
        threadId: activeThread.id,
      });
      setThreadReplayVerification(verified);
      await loadThreadEvents(activeThread.id);
      return exported;
    } catch (err) {
      await loadThreadEvents(activeThread.id);
      setError(err instanceof Error ? err.message : 'Failed to export replay evidence');
      throw err;
    }
  }, [activeThread, loadThreadEvents]);

  return {
    projects,
    activeProject,
    projectFiles,
    loadProjectFiles,
    projectMemorySources,
    projectPlugins,
    providerModels,
    toolCapabilities,
    toolLanes,
    automations,
    automationRuns,
    threads,
    activeThread,
    messages,
    threadEvents,
    operationalMemory,
    proofs,
    permissionReceipts,
    mergeAssessments,
    handoffCapsules,
    peerMessages,
    taskGraphs,
    compactCheckpoints,
    agentEvents,
    activeTerminalSessionId,
    terminalSessions,
    terminalTranscript,
    terminalBlocks,
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
    selectProjectFolder,
    api,
    openProject,
    selectProject,
    createThread,
    selectThread,
    addMessage,
    createTerminal,
    launchAgent,
    launchBestOfN,
    interruptAgent,
    terminateAgent,
    selectTerminalSession,
    writeActiveTerminal,
    resizeActiveTerminal,
    stopActiveTerminal,
    launchBrowser,
    exportBrowserEvidence,
    exportThreadReplay,
    loadWorktreeDiff,
    evaluateMergeReadiness,
    approveWorktreeMerge,
    createIntegrationMerge,
    forkWorktree,
    archiveWorktree,
    exportRollbackPatch: activeThread
      ? (worktreePath: string) =>
          api.exportRollbackPatch({ threadId: activeThread.id, worktreePath })
      : ((() => {
          throw new Error('No active thread');
        }) as unknown as (
          worktreePath: string
        ) => Promise<{ path: string; patchBytes: number; worktreePath: string; branch: string }>),
    createHandoff,
    createCompactCheckpoint,
    updateGraphNodeStatus,
    decidePermission,
    copyText,
    openPath,
    toggleBrowserControl,
    setToolEnabled,
    createProjectAutomation,
    updateProjectAutomation,
    deleteProjectAutomation,
    loadAutomationRuns,
    runProjectAutomationNow,
  };
}
