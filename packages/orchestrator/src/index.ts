/**
 * @doorway/orchestrator
 *
 * The brain of Doorway - connects threads to agents, manages task planning,
 * and coordinates the agent lifecycle.
 */

import type Database from 'better-sqlite3';
import { TaskGraphService, type TaskGraph } from './task-graph.js';
import { ProjectMemoryLoader } from './memory.js';
import { HandoffPacketService, type HandoffPacket } from './handoff-service.js';
import type { AdapterManifest } from '@doorway/adapters';
import {
  appendTerminalChunk,
  claimTaskGraphNodeForRun,
  completeTaskGraphNodeForRun,
  generateId,
  recordEvent,
  recordProcessSnapshot,
  recordProcessSnapshotFailed,
  recordTerminalInput,
  recordTerminalStateDetection,
  recordTerminalStarted,
  recordTerminalStopped,
  redactTerminalText,
  registerMeshAgent,
  routeTerminalActionBlocks,
  upsertAgentRunLaunch,
} from '@doorway/core';
import { EnvironmentOverrider, type EnvOverride } from './env.js';
import { BrainService } from './brain/brain-service.js';
import { BrowserSessionService } from './browser-session.js';
import { FlightRecorderService } from './flight-recorder.js';
import { PeerProtocolService } from './peer-protocol.js';
import {
  createPeerOrchestration,
  PeerOrchestrationService,
  type AgentCapabilityTag,
  type AgentProfile,
  type TaskAssignment,
  type TaskLane,
  type SynthesisCard,
} from './peer-orchestration.js';
import { getFaultRecoveryService } from '@doorway/core';
import { type VaultProvider } from './brain/types.js';
import { captureProcessTree, createSessionManager, type ProcessTreeCapture } from '@doorway/terminal-runtime';
import {
  AutoCompactor,
  createAutoCompactorIntegration,
  type AutoCompactorConfig,
} from './auto-compactor.js';
import { terminalSubmitInput } from '@doorway/protocol';
import type {
  AgentRunId,
  AgentLaunchOptions,
  DoorwayMessage,
  MeshAgentKind,
  ProcessSnapshotPhase,
  TaskId,
  TerminalControlEvent,
  TerminalScreenSnapshot,
  TerminalStateDetection,
  TerminalSessionId,
  ThreadId,
  WorktreeId,
} from '@doorway/protocol';
import {
  ClarificationHandler,
  ClarificationRequest,
} from '@doorway/core';
import { FollowUpEngine } from './follow-up.js';

// ============================================================================
// Orchestrator Types
// ============================================================================

/**
 * Callback to broadcast clarification requests to the renderer.
 */
export type ClarificationBroadcast = (request: ClarificationRequest) => void;
export type ProcessSnapshotter = (rootPid: number) => Promise<ProcessTreeCapture>;

export interface WorktreeCreator {
  createWorktree(options: {
    readonly projectPath?: string;
    readonly taskId: string;
    readonly branchName: string;
    readonly worktreePath?: string;
    readonly baseBranch?: string;
    readonly force?: boolean;
  }): Promise<{ readonly id: WorktreeId; readonly path: string }>;
}

export interface OrchestratorConfig {
  cwd?: string;
  defaultProvider?: string;
  worktreeManager?: WorktreeCreator;
  terminalManager?: AgentTerminalRuntime;
  processSnapshotter?: ProcessSnapshotter | false;
  /** Callback to broadcast clarification requests to the renderer via terminalStreamHub */
  onClarificationBroadcast?: ClarificationBroadcast;
}

export interface AgentEvent {
  readonly type: 'stdout' | 'stderr' | 'exit' | 'tool_use' | 'thinking' | 'error';
  readonly data: string;
  readonly timestamp: Date;
}

export interface LaunchContext {
  readonly prompt: string;
  readonly cwd: string;
  readonly env?: Record<string, string>;
  readonly model?: string;
}

export interface LaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly stdinPrompt?: string;
}

export interface TerminalLaunchResult {
  readonly sessionId: string;
  readonly pid: number;
  readonly startedAt: Date;
}

export interface TerminalDecodedData {
  readonly text: string;
  readonly rawText: string;
  readonly controlEvents: readonly TerminalControlEvent[];
  readonly screenSnapshot: TerminalScreenSnapshot;
  readonly stateDetection: TerminalStateDetection;
}

export interface AgentTerminalRuntime {
  launch(options: { cwd: string; env?: Record<string, string> }): Promise<TerminalLaunchResult>;
  launchCommand(
    command: string,
    args: readonly string[],
    options: { cwd: string; env?: Record<string, string> }
  ): Promise<TerminalLaunchResult>;
  sendInput(sessionId: string, data: string): void;
  stop(sessionId: string, signal?: number): number;
  onData(
    callback: (sessionId: string, data: string, decodedChunk?: TerminalDecodedData) => void
  ): () => void;
  onExit(
    callback: (sessionId: string, exitCode: number, signal: string | null) => void
  ): () => void;
  onStateChange?(
    callback: (sessionId: string, detection: TerminalStateDetection) => void
  ): () => void;
}

// ============================================================================
// Agent Adapter Interface
// ============================================================================

export interface IAgentAdapter {
  readonly provider: string;
  readonly name: string;
  readonly manifest: AdapterManifest;

  buildLaunch(context: LaunchContext): Promise<LaunchSpec>;
  onEvent(callback: (event: AgentEvent) => void): () => void;
}

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=@%+,.~-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function serializeShellCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(shellQuote).join(' ');
}

function meshAgentKindForRun(provider: string): MeshAgentKind {
  const normalized = provider.toLowerCase();
  if (normalized.includes('review')) {
    return 'reviewer';
  }
  if (normalized.includes('pi')) {
    return 'pi_agent';
  }
  if (normalized.includes('browser')) {
    return 'browser_supervisor';
  }
  if (normalized.includes('doorway')) {
    return 'doorway_brain';
  }
  return 'visible_cli';
}

export * from './compiler.js';
export * from './task-graph.js';
export * from './memory.js';
export * from './handoff-service.js';
export * from './env.js';
export * from './browser-session.js';
export * from './flight-recorder.js';
export * from './brain/index.js';
export * from './compaction.js';
export * from './auto-compactor.js';
export * from './scheduler.js';
export * from './cron.js';
export * from './event-trigger.js';
export * from './peer-protocol.js';
export * from './peer-orchestration.js';

// ============================================================================
// Orchestrator
// ============================================================================

export class Orchestrator {
  private readonly config: OrchestratorConfig;
  private readonly db: Database.Database;
  private readonly terminalManager: AgentTerminalRuntime;
  private readonly adapters: Map<string, IAgentAdapter> = new Map();
  private readonly activeRuns: Map<string, OrchestratorRun> = new Map();
  private readonly lastHandoffs: Map<string, HandoffPacket> = new Map(); // threadId -> HandoffPacket
  private readonly faultRecovery = getFaultRecoveryService();

  readonly taskGraph: TaskGraphService;
  readonly memory: ProjectMemoryLoader;
  readonly handoff: HandoffPacketService;
  readonly envOverrider: EnvironmentOverrider;
  readonly browser: BrowserSessionService;
  readonly recorder: FlightRecorderService;
  readonly brain: BrainService;
  readonly autoCompactor: AutoCompactor;
  readonly peerProtocol: PeerProtocolService;
  readonly peerOrchestration: PeerOrchestrationService;
  readonly followUp: FollowUpEngine;
  private readonly autoCompactorIntegration: ReturnType<typeof createAutoCompactorIntegration>;
  readonly clarificationHandler: ClarificationHandler;
  private readonly processSnapshotter: ProcessSnapshotter | null;

  constructor(
    db: Database.Database,
    vault: VaultProvider,
    config: OrchestratorConfig = {},
    autoCompactorConfig?: AutoCompactorConfig
  ) {
    this.config = config;
    this.db = db;
    this.terminalManager = config.terminalManager ?? createSessionManager();
    this.processSnapshotter =
      config.processSnapshotter === false ? null : (config.processSnapshotter ?? captureProcessTree);
    this.taskGraph = new TaskGraphService(db);
    this.memory = new ProjectMemoryLoader(db);
    this.handoff = new HandoffPacketService(db);
    this.envOverrider = new EnvironmentOverrider();
    this.browser = new BrowserSessionService();
    this.recorder = new FlightRecorderService(db);
    this.brain = new BrainService(db, vault);
    this.peerProtocol = new PeerProtocolService(db);
    this.peerOrchestration = createPeerOrchestration(db, this.peerProtocol);
    this.followUp = new FollowUpEngine(this.brain);

    // Initialize auto-compactor
    this.autoCompactor = new AutoCompactor(db, autoCompactorConfig ?? { threshold: 0.8 });
    this.autoCompactorIntegration = createAutoCompactorIntegration(this.autoCompactor);

    // Initialize clarification handler
    this.clarificationHandler = new ClarificationHandler({
      onClarificationDetected: (request) => {
        // Forward to renderer via terminalStreamHub if configured
        this.config.onClarificationBroadcast?.(request);
      },
    });
  }

  registerAdapter(adapter: IAgentAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  getAdapter(provider: string): IAgentAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Launch a Parallel Best-of-N Loop (V1 Hard Cap N=2)
   */
  async executeBestOfN(
    threadId: string,
    projectId: string,
    prompt: string,
    providers: string[],
    importantFiles?: readonly string[],
    executionOptions?: {
      readonly projectPath?: string;
      readonly useWorktree?: boolean;
      readonly launchOptions?: AgentLaunchOptions;
    }
  ): Promise<string[]> {
    if (providers.length > 2) {
      throw new Error('V1 limits Best-of-N to a maximum of 2 parallel agents.');
    }

    // Auto-compact context if needed (before launching agents)
    const messages = this.getThreadMessages(threadId as ThreadId);
    const wasCompacted = await this.autoCompactor.autoCompactIfNeeded(
      threadId as ThreadId,
      messages
    );
    if (wasCompacted) {
      console.log(
        `[AutoCompactor] Context compacted for thread ${threadId} before Best-of-N launch`
      );
    }

    const graph = await this.taskGraph.createTaskGraph(projectId, prompt, 'parallel', this.brain);
    const taskId = graph.id;
    const projectPath = executionOptions?.projectPath ?? this.config.cwd ?? process.cwd();
    await this.memory.loadProjectMemory(projectId, projectPath);

    const { ContextCompiler } = await import('./compiler.js');
    const runIds: string[] = [];

    const launches = providers.map(async (provider) => {
      const adapter = this.getAdapter(provider);
      if (!adapter) throw new Error(`No adapter: ${provider}`);

      const runId = generateId('run');
      let executionCwd = projectPath;
      let worktreeId: WorktreeId | undefined;
      let envOverrides: EnvOverride = {
        PORT: '',
        VITE_PORT: '',
        NEXT_PORT: '',
        DOORWAY_TASK_ID: '',
        DOORWAY_WORKTREE_ID: '',
      };

      if (executionOptions?.useWorktree !== false && this.config.worktreeManager) {
        const wt = await this.config.worktreeManager.createWorktree({
          projectPath,
          taskId,
          branchName: `run-${runId.slice(-4)}-${provider}`,
        });
        executionCwd = wt.path;
        worktreeId = wt.id;
        envOverrides = this.envOverrider.allocateWorktreeEnv(taskId, worktreeId);
      }

      const previousHandoff = this.lastHandoffs.get(threadId);
      const peerAgents = this.peerProtocol.whoIsRunning(threadId).map((p) => ({
        id: p.agentId,
        displayName: p.displayName,
        role: p.role,
      }));

      const finalPrompt = await ContextCompiler.compile({
        projectId,
        goal: prompt,
        cwd: executionCwd,
        importantFiles,
        previousSummary: previousHandoff
          ? this.handoff.formatForProvider(previousHandoff, provider)
          : undefined,
        memoryLoader: this.memory,
        peerAgents,
      });

      const run: OrchestratorRun = {
        id: runId,
        threadId: threadId as ThreadId,
        taskId: taskId as TaskId,
        provider: adapter.provider,
        status: 'launching',
        startTime: new Date(),
        events: [],
        prompt: finalPrompt,
        cwd: executionCwd,
        worktreeId,
        ...(executionOptions?.launchOptions
          ? { launchOptions: executionOptions.launchOptions }
          : {}),
      };

      this.activeRuns.set(runId, run);

      try {
        run.status = 'running';
        const result = await this.launchAdapterInTerminal(adapter, run, {
          prompt: finalPrompt,
          cwd: executionCwd,
          env: {
            ...(envOverrides as unknown as Record<string, string>),
            ...(executionOptions?.launchOptions?.modelId
              ? { DOORWAY_MODEL_ID: executionOptions.launchOptions.modelId }
              : {}),
          },
        });
      } catch (error) {
        run.status = 'failed';
        run.error = String(error);
      }

      runIds.push(runId);
      return runId;
    });

    await Promise.all(launches);
    return runIds;
  }

  async executeTask(
    threadId: string,
    projectId: string,
    prompt: string,
    options?: {
      provider?: string;
      useWorktree?: boolean;
      importantFiles?: readonly string[];
      launchOptions?: AgentLaunchOptions;
      projectPath?: string;
    }
  ): Promise<string> {
    const provider = options?.provider ?? this.config.defaultProvider ?? 'claude';
    const adapter = this.getAdapter(provider);
    if (!adapter) throw new Error(`No adapter: ${provider}`);

    // Auto-compact context if needed (before launching agent)
    const messages = this.getThreadMessages(threadId as ThreadId);
    const wasCompacted = await this.autoCompactor.autoCompactIfNeeded(
      threadId as ThreadId,
      messages
    );
    if (wasCompacted) {
      console.log(`[AutoCompactor] Context compacted for thread ${threadId} before task launch`);
    }

    const graph = await this.taskGraph.createTaskGraph(projectId, prompt, 'sequential', this.brain);
    const taskId = graph.id;
    const runId = generateId('run');

    const projectPath = options?.projectPath ?? this.config.cwd ?? process.cwd();
    let executionCwd = projectPath;
    let worktreeId: WorktreeId | undefined;

    if (options?.useWorktree && this.config.worktreeManager) {
      const wt = await this.config.worktreeManager.createWorktree({
        projectPath,
        taskId,
        branchName: `run-${runId.slice(-4)}`,
      });
      executionCwd = wt.path;
      worktreeId = wt.id;
    }

    await this.memory.loadProjectMemory(projectId, projectPath);

    const { ContextCompiler } = await import('./compiler.js');
    const previousHandoff = this.lastHandoffs.get(threadId);
    const peerAgents = this.peerProtocol.whoIsRunning(threadId).map((p) => ({
      id: p.agentId,
      displayName: p.displayName,
      role: p.role,
    }));

    const finalPrompt = await ContextCompiler.compile({
      projectId,
      goal: prompt,
      cwd: executionCwd,
      importantFiles: options?.importantFiles,
      previousSummary: previousHandoff
        ? this.handoff.formatForProvider(previousHandoff, provider)
        : undefined,
      memoryLoader: this.memory,
      peerAgents,
    });

    const run: OrchestratorRun = {
      id: runId,
      threadId: threadId as ThreadId,
      taskId: taskId as TaskId,
      provider: adapter.provider,
      status: 'launching',
      startTime: new Date(),
      events: [],
      prompt: finalPrompt,
      cwd: executionCwd,
      worktreeId,
      ...(options?.launchOptions ? { launchOptions: options.launchOptions } : {}),
    };

    this.activeRuns.set(runId, run);

    try {
      run.status = 'running';
      const result = await this.launchAdapterInTerminal(adapter, run, {
        prompt: finalPrompt,
        cwd: executionCwd,
        ...(options?.launchOptions?.modelId
          ? { env: { DOORWAY_MODEL_ID: options.launchOptions.modelId } }
          : {}),
      });
    } catch (error) {
      run.status = 'failed';
      run.error = String(error);
    }

    return runId;
  }

  private registerMeshAgentForRun(adapter: IAgentAdapter, run: OrchestratorRun): void {
    if (!run.sessionId) {
      return;
    }

    const agent = registerMeshAgent(this.db, {
      threadId: run.threadId,
      displayName: adapter.name,
      kind: meshAgentKindForRun(adapter.provider),
      toolName: adapter.provider,
      role: meshAgentKindForRun(adapter.provider) === 'reviewer' ? 'reviewer' : 'implementer',
      status: 'running',
      terminalSessionId: run.sessionId,
      ...(run.worktreeId ? { worktreeId: run.worktreeId } : {}),
      runId: run.id,
    });

    run.meshAgentId = agent.id;
    run.mailboxId = agent.mailboxId;
  }

  async finishRun(runId: string, options?: { changedFiles?: string[] }): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    // Follow-up audit and synthesis
    const audit = await this.followUp.auditCompletion(run.prompt, run.events, run.provider);
    const synthesis = await this.followUp.synthesizeResponse(run.prompt, audit);

    recordEvent(this.db, run.threadId, 'unified_thread.synthesis_created', {
      sessionId: run.sessionId ?? 'unknown',
      summary: synthesis,
      agentCount: 1,
    });

    // Notify peer orchestration of agent completion before terminating
    if (run.meshAgentId) {
      const durationMs = run.endTime
        ? run.endTime.getTime() - run.startTime.getTime()
        : undefined;
      this.peerOrchestration.onAgentCompletion({
        agentId: run.meshAgentId,
        threadId: run.threadId as string,
        summary: `Agent finished by orchestrator`,
        changedFiles: options?.changedFiles,
        durationMs,
      });
    }

    const packet = await this.handoff.createPacket({
      threadId: run.threadId,
      runId: run.id,
      goal: run.prompt,
      events: run.events,
      changedFiles: options?.changedFiles ?? [],
      providerType: run.provider || 'claude',
      brain: this.brain,
    });

    this.lastHandoffs.set(run.threadId, packet);
    this.terminateRun(runId);
  }

  interruptRun(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;
    if (run.sessionId) {
      this.terminalManager.stop(run.sessionId, 2);
    }
    // Notify peer orchestration of agent interruption
    if (run.meshAgentId) {
      this.peerOrchestration.onAgentBlocker({
        agentId: run.meshAgentId,
        threadId: run.threadId as string,
        reason: 'Agent interrupted by user',
      });
    }
    run.status = 'interrupted';
  }

  terminateRun(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;
    if (run.sessionId) {
      this.terminalManager.stop(run.sessionId, 15);
    }
    run.unsubscribe?.();
    run.stateUnsubscribe?.();
    run.exitUnsubscribe?.();
    run.status = 'terminated';
    this.activeRuns.delete(runId);
  }

  private async launchAdapterInTerminal(
    adapter: IAgentAdapter,
    run: OrchestratorRun,
    context: LaunchContext
  ): Promise<TerminalLaunchResult> {
    const spec = await adapter.buildLaunch(context);
    const result = await this.terminalManager.launch({
      cwd: spec.cwd,
      env: spec.env,
    });

    const shellCommand = serializeShellCommand(spec.command, spec.args);
    const sessionId = result.sessionId as TerminalSessionId;

    upsertAgentRunLaunch(this.db, {
      runId: run.id as AgentRunId,
      threadId: run.threadId,
      taskId: run.taskId,
      role: meshAgentKindForRun(adapter.provider) === 'reviewer' ? 'reviewer' : 'custom',
      adapterId: adapter.provider,
      ...(run.worktreeId ? { worktreeId: run.worktreeId } : {}),
      terminalSessionId: sessionId,
      status: 'terminal_launched',
      startedAt: result.startedAt,
    });
    claimTaskGraphNodeForRun(this.db, run.threadId, {
      taskId: run.taskId,
      runId: run.id as AgentRunId,
      role: meshAgentKindForRun(adapter.provider) === 'reviewer' ? 'reviewer' : 'implementer',
    });

    recordTerminalStarted(this.db, run.threadId, {
      sessionId,
      agentRunId: run.id as AgentRunId,
      runtime: 'pty',
      workingDirectory: spec.cwd,
      command: shellCommand,
      pid: result.pid,
    });
    run.sessionId = sessionId;
    await this.captureProcessSnapshot(run.threadId, sessionId, result.pid, 'started');

    this.registerMeshAgentForRun(adapter, run);

    // Register with FaultRecoveryService for monitoring
    this.faultRecovery.registerProcess({
      sessionId: run.sessionId,
      runId: run.id as import('@doorway/protocol').AgentRunId,
      threadId: run.threadId,
      provider: adapter.provider,
      startedAt: run.startTime,
      lastHeartbeat: new Date(),
      status: 'running',
    });

    // Notify peer orchestration of agent start
    if (run.meshAgentId) {
      this.peerOrchestration.onAgentStart({
        agentId: run.meshAgentId,
        threadId: run.threadId as string,
        displayName: adapter.name,
        kind: meshAgentKindForRun(adapter.provider),
        provider: adapter.provider,
        role: meshAgentKindForRun(adapter.provider) === 'reviewer' ? 'reviewer' : 'implementer',
        currentTask: run.prompt.slice(0, 100),
      });
    }

    run.unsubscribe = this.terminalManager.onData((sessionId, data, decodedChunk) => {
      if (sessionId !== result.sessionId) return;
      const semanticText = decodedChunk?.text ?? data;

      const chunk = appendTerminalChunk(this.db, run.threadId, {
        sessionId: result.sessionId as TerminalSessionId,
        text: data,
        cleanText: semanticText,
        controlEvents: decodedChunk?.controlEvents,
        screenSnapshot: decodedChunk?.screenSnapshot,
        stateDetection: decodedChunk?.stateDetection,
      });

      // Check if run is paused for clarification - if so, persist output but don't auto-respond.
      if (run.isPausedForClarification) {
        run.events.push({
          type: 'stdout',
          data,
          timestamp: new Date(),
        });
        return;
      }

      // Check for clarification requests in the output
      const clarificationRequest = this.clarificationHandler.processOutput(
        run.sessionId!,
        run.id as AgentRunId,
        run.threadId,
        semanticText
      );

      if (clarificationRequest) {
        // Pause the agent for clarification
        run.isPausedForClarification = true;
        run.clarificationRequestId = clarificationRequest.id;
        recordEvent(this.db, run.threadId, 'clarification.requested', {
          clarificationId: clarificationRequest.id,
          threadId: run.threadId,
          runId: run.id as AgentRunId,
          sessionId: result.sessionId as TerminalSessionId,
          question: clarificationRequest.question,
          context: clarificationRequest.context,
          suggestedResponses: clarificationRequest.suggestedResponses,
          requestedAt: clarificationRequest.timestamp.toISOString(),
        });
        run.events.push({
          type: 'stdout',
          data,
          timestamp: new Date(),
        });
        return;
      }

      const actionResults = routeTerminalActionBlocks(this.db, {
        threadId: run.threadId,
        terminalSessionId: result.sessionId as TerminalSessionId,
        chunkSequence: chunk.sequence,
        text: semanticText,
      });
      for (const actionResult of actionResults) {
        if (actionResult.terminalResponseText) {
          const responseInput = terminalSubmitInput(actionResult.terminalResponseText);
          recordTerminalInput(this.db, run.threadId, {
            sessionId: result.sessionId as TerminalSessionId,
            text: responseInput,
            source: 'doorway',
          });
          this.terminalManager.sendInput(result.sessionId, responseInput);
        }
      }
      run.events.push({
        type: 'stdout',
        data,
        timestamp: new Date(),
      });
    });

    run.stateUnsubscribe = this.terminalManager.onStateChange?.((sessionId, detection) => {
      if (sessionId !== result.sessionId) return;
      recordTerminalStateDetection(this.db, run.threadId, {
        sessionId: result.sessionId as TerminalSessionId,
        detection,
        source: 'silence_confirmation',
      });
    });

    run.exitUnsubscribe = this.terminalManager.onExit(async (sessionId, exitCode, signal) => {
      if (sessionId !== result.sessionId) return;
      const exitedAt = new Date();
      run.endTime = exitedAt;
      run.events.push({
        type: 'exit',
        data: signal ? `${exitCode} ${signal}` : String(exitCode),
        timestamp: exitedAt,
      });
      recordTerminalStopped(this.db, run.threadId, {
        sessionId: result.sessionId as TerminalSessionId,
        exitCode,
        signal: signal ?? undefined,
      });
      await this.captureProcessSnapshot(
        run.threadId,
        result.sessionId as TerminalSessionId,
        result.pid,
        'stopped'
      );

      // Unregister from FaultRecoveryService
      this.faultRecovery.unregisterProcess(sessionId as TerminalSessionId);

      // Get the running process info for fault recovery
      const processInfo = {
        sessionId: sessionId as TerminalSessionId,
        runId: run.id as AgentRunId,
        threadId: run.threadId,
        provider: run.provider,
        startedAt: run.startTime,
        lastHeartbeat: new Date(),
        status: 'crashed' as const,
        exitCode,
        signal: signal ?? undefined,
      };

      // Use FaultRecoveryService to detect fault and determine recovery action
      const fault = this.faultRecovery.detectFaultFromExit(exitCode, signal ?? undefined);
      console.log(`[FaultRecovery] Detected fault: ${fault.faultType} (${fault.severity}) - ${fault.reason}`);

      const action = this.faultRecovery.determineRecoveryAction(fault, processInfo);
      console.log(`[FaultRecovery] Recovery action: ${action.type} - ${action.reason}`);

      // Execute the recovery action
      const shouldRetry = await this.faultRecovery.executeRecovery(action, processInfo);

      if (shouldRetry && action.type === 'retry') {
        // Cleanup old subscriptions
        run.unsubscribe?.();
        run.stateUnsubscribe?.();
        run.exitUnsubscribe?.();

        console.log(`[FaultRecovery] Retrying run ${run.id} after ${action.delayMs}ms delay...`);
        run.status = 'launching';

        setTimeout(() => {
          this.launchAdapterInTerminal(adapter, run, context).catch((e) => {
            console.error(`[FaultRecovery] Failed to respawn session:`, e);
            run.status = 'failed';
          });
        }, action.delayMs ?? 1000);
        return;
      }

      // If action was reprompt, switch_model, or ask_user, handle accordingly
      if (action.type === 'reprompt' || action.type === 'switch_model') {
        console.log(`[FaultRecovery] ${action.type} requested - need manual intervention`);
      }

      if (action.type === 'ask_user') {
        console.log(`[FaultRecovery] Asking user: ${action.message}`);
        // TODO: Surface this to the UI for user confirmation
      }

      if (action.type === 'halt') {
        console.log(`[FaultRecovery] Halting: ${action.message}`);
      }

      completeTaskGraphNodeForRun(this.db, run.threadId, {
        runId: run.id as AgentRunId,
        exitCode,
      });

      // Notify peer orchestration of agent completion or blocker
      if (run.meshAgentId) {
        const durationMs = run.endTime
          ? run.endTime.getTime() - run.startTime.getTime()
          : undefined;

        if (exitCode === 0) {
          this.peerOrchestration.onAgentCompletion({
            agentId: run.meshAgentId,
            threadId: run.threadId as string,
            summary: `Agent completed successfully with exit code ${exitCode}`,
            durationMs,
          });
        } else {
          this.peerOrchestration.onAgentBlocker({
            agentId: run.meshAgentId,
            threadId: run.threadId as string,
            reason: `Agent failed with exit code ${exitCode}`,
          });
        }
      }

      run.status = exitCode === 0 ? 'completed' : 'failed';
    });

    const launchInput = terminalSubmitInput(shellCommand);
    recordTerminalInput(this.db, run.threadId, {
      sessionId,
      text: launchInput,
      source: 'doorway',
    });
    this.terminalManager.sendInput(result.sessionId, launchInput);

    if (spec.stdinPrompt) {
      const promptInput = terminalSubmitInput(spec.stdinPrompt);
      recordTerminalInput(this.db, run.threadId, {
        sessionId,
        text: promptInput,
        source: 'doorway',
      });
      this.terminalManager.sendInput(result.sessionId, promptInput);
    }
    await this.captureProcessSnapshot(run.threadId, sessionId, result.pid, 'running');

    return result;
  }

  private async captureProcessSnapshot(
    threadId: ThreadId,
    sessionId: TerminalSessionId,
    rootPid: number,
    phase: ProcessSnapshotPhase
  ): Promise<void> {
    if (!this.processSnapshotter) {
      return;
    }
    try {
      const snapshot = await this.processSnapshotter(rootPid);
      if (snapshot.nodes.length === 0) {
        recordProcessSnapshotFailed(this.db, threadId, {
          sessionId,
          phase,
          rootPid,
          reason: 'No process rows were visible for the terminal root pid.',
        });
        return;
      }
      recordProcessSnapshot(this.db, threadId, {
        sessionId,
        phase,
        rootPid,
        nodes: snapshot.nodes,
      });
    } catch (error) {
      recordProcessSnapshotFailed(this.db, threadId, {
        sessionId,
        phase,
        rootPid,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async recordEvent(taskId: string, type: string, data: any) {
    return this.recorder.record(taskId, type, data);
  }

  async launchBrowser(options: { url?: string } = {}) {
    return this.browser.launch(options);
  }

  toggleBrowserControl(isAgent: boolean) {
    if (isAgent) this.browser.resumeAgent();
    else this.browser.pauseAgent();
  }

  getRun(runId: string): OrchestratorRun | undefined {
    return this.activeRuns.get(runId);
  }

  listRuns(): readonly OrchestratorRun[] {
    return Array.from(this.activeRuns.values());
  }

  /**
   * Get messages for a thread (used for auto-compaction checking).
   */
  private getThreadMessages(
    threadId: ThreadId
  ): readonly import('@doorway/protocol').DoorwayMessage[] {
    try {
      const { getMessagesForThread } = require('@doorway/core');
      return getMessagesForThread(this.db, threadId);
    } catch {
      return [];
    }
  }

  /**
   * Get current context usage as a percentage (0.0-1.0+).
   */
  getContextUsagePercent(threadId: ThreadId, modelId?: string): number {
    const messages = this.getThreadMessages(threadId);
    return this.autoCompactor.getContextUsagePercent(messages, modelId);
  }

  /**
   * Get whether auto-compaction is recommended.
   */
  shouldAutoCompact(threadId: ThreadId, modelId?: string): boolean {
    const messages = this.getThreadMessages(threadId);
    return this.autoCompactor.shouldAutoCompact(messages, modelId);
  }

  /**
   * Manually trigger compaction for a thread.
   */
  async triggerCompaction(threadId: ThreadId, modelId?: string): Promise<boolean> {
    const messages = this.getThreadMessages(threadId);
    return this.autoCompactor.autoCompactIfNeeded(threadId, messages, modelId);
  }

  /**
   * Answer a clarification request and resume the agent.
   */
  answerClarification(runId: string, answer: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) {
      console.warn(`[Orchestrator] answerClarification: run not found: ${runId}`);
      return false;
    }

    if (!run.isPausedForClarification || !run.clarificationRequestId) {
      console.warn(`[Orchestrator] answerClarification: run ${runId} is not paused for clarification`);
      return false;
    }

    const clarificationResponse = this.clarificationHandler.answerRequest(
      run.clarificationRequestId,
      answer
    );

    if (!clarificationResponse) {
      console.warn(`[Orchestrator] answerClarification: failed to answer request: ${run.clarificationRequestId}`);
      return false;
    }

    // Resume the agent by sending the answer to the terminal
    const responseInput = terminalSubmitInput(answer);
    recordTerminalInput(this.db, run.threadId, {
      sessionId: run.sessionId as TerminalSessionId,
      text: responseInput,
      source: 'user',
    });
    this.terminalManager.sendInput(run.sessionId, responseInput);
    recordEvent(this.db, run.threadId, 'clarification.answered', {
      clarificationId: clarificationResponse.requestId,
      threadId: run.threadId,
      runId: run.id as AgentRunId,
      sessionId: run.sessionId as TerminalSessionId,
      answer: redactTerminalText(answer),
      answeredAt: new Date().toISOString(),
    });

    // Clear clarification state
    run.isPausedForClarification = false;
    run.clarificationRequestId = undefined;

    return true;
  }

  /**
   * Get a clarification request by ID.
   */
  getClarificationRequest(id: string): ClarificationRequest | undefined {
    return this.clarificationHandler.getClarification(id);
  }

  /**
   * Get pending clarification for a session.
   */
  getPendingClarification(sessionId: TerminalSessionId): ClarificationRequest | null {
    return this.clarificationHandler.getPendingClarification(sessionId);
  }

  /**
   * Get all pending clarifications.
   */
  getPendingClarifications(): ClarificationRequest[] {
    return this.clarificationHandler.getPendingClarifications();
  }

  /**
   * Cancel a clarification request.
   */
  cancelClarification(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run || !run.clarificationRequestId) {
      return false;
    }

    const result = this.clarificationHandler.cancelRequest(run.clarificationRequestId);
    run.isPausedForClarification = false;
    run.clarificationRequestId = undefined;
    return result;
  }
}

export interface OrchestratorRun {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly taskId: TaskId;
  readonly provider: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly worktreeId?: WorktreeId;
  readonly launchOptions?: AgentLaunchOptions;
  status: 'launching' | 'running' | 'completed' | 'failed' | 'interrupted' | 'terminated';
  readonly startTime: Date;
  endTime?: Date;
  error?: string;
  sessionId?: TerminalSessionId;
  meshAgentId?: string;
  mailboxId?: string;
  retryCount?: number;
  events: AgentEvent[];
  unsubscribe?: () => void;
  stateUnsubscribe?: () => void;
  exitUnsubscribe?: () => void;
  // Clarification handling
  isPausedForClarification?: boolean;
  clarificationRequestId?: string;
}
