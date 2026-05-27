/**
 * AppProviders — State management extracted from App.tsx
 *
 * Builds the context value from useDoorway() and local state.
 * All the complex state logic lives here, extracted from the layout component.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useDoorway } from './hooks';
import { HarnessStateProvider } from './HarnessContext';
import type {
  AgentLaunchMode,
  AgentPermissionProfile,
  AgentPtyMode,
  AgentWorktreeStrategy,
} from '@doorway/protocol';
import type {
  ComposerPolicySummaryItem,
  ComposerMentionTarget,
} from './shared-ui';
import type { SlashCommand } from './shared-ui';
import {
  composerMentionTargets,
  filteredMentionTargets,
  applyMentionTargetToPrompt,
  launchProviderFromMentions,
  launchModelFromMentions,
  buildComposerLaunchOptions,
  composerLaunchPreflight,
  surfaceForSlashCommand,
  latestAssessmentsByTask,
  worktreeSafetySummary,
  sortMergeAssessmentsByEvidenceTime,
  sortProofsByEvidenceTime,
  sortPermissionReceiptsByEvidenceTime,
  filterPermissionReceiptsByDecision,
  filterProofsByStatus,
  filterMergeAssessmentsByScore,
  latestThreadEventsBySequence,
  filterHandoffCapsulesByUsage,
  sortHandoffCapsulesByEvidenceTime,
  sortHandoffUsedEventsByEvidenceTime,
  surfaceDrawerStatusLabel,
  worktreeFirstActionPrompt,
  composerPolicySummary,
} from './App';
import type { PermissionDecision } from '@doorway/protocol';
import { permissionDecisionTerminalInput } from './hooks';

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
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
    launchBestOfN,
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

  // Local state
  const [prompt, setPrompt] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [provider, setProvider] = useState('agy');
  const [modelId, setModelId] = useState('');
  const [composerMode, setComposerMode] = useState<AgentLaunchMode>('/build');
  const [permissionProfile, setPermissionProfile] = useState<AgentPermissionProfile>('ask-writes');
  const [worktreeStrategy, setWorktreeStrategy] = useState<AgentWorktreeStrategy>('auto-worktree');
  const [ptyMode, setPtyMode] = useState<AgentPtyMode>('doorway-pty');
  const [showCommands, setShowCommands] = useState(false);

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

  // Keyboard shortcut for Cmd+K
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

  // Derived state
  const selectedProviderModel = useMemo(
    () => providerModels.find((model) => model.modelId === modelId),
    [modelId, providerModels]
  );

  const mentionTargets = useMemo(
    () =>
      composerMentionTargets(providerModels, {
        activeProject,
        worktrees,
        macros: ['/build', '/debug', '/review', '/plan', '/handoff', '/compact', '/test', '/browser', '/merge', '/tools', '/plugins', '/automations'] as SlashCommand[],
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
  const worktreeAssessments = useMemo(
    () => latestAssessmentsByTask(mergeAssessments),
    [mergeAssessments]
  );
  const worktreeSummary = useMemo(
    () => worktreeSafetySummary(worktrees, worktreeAssessments),
    [worktreeAssessments, worktrees]
  );
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

  const evidenceRecordCount =
    handoffCapsules.length +
    permissionReceipts.length +
    proofs.length +
    peerMessages.length +
    browserActions.length;

  // Actions
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

    await launchAgent(trimmed, launchProvider, launchOptions);

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

    setPrompt((current) => `${current.trimStart()}${current.trim() ? ' ' : ''}${command} `);
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

  // Build context value
  const contextValue = {
    ...doorwayState,
    prompt,
    setPrompt,
    projectPath,
    setProjectPath,
    threadTitle,
    setThreadTitle,
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
    showCommands,
    setShowCommands,
    activeMentionTargets,
    policySummary,
    launchPreflight,
    isComposerBlocked,
    selectedProviderModel,
    runSlashCommand,
    applyComposerMention,
    submitPrompt,
    submitProject,
    submitThread,
    worktreeFirstActionBlockedReason,
    evidenceRecordCount,
    worktreeSummary,
    agySimulatedStatus,
    setAgySimulatedStatus,
    agySteps,
    setAgySteps,
    agyEstRemaining,
    agyStepIndex,
    setAgyStepIndex,
  };

  return (
    <HarnessStateProvider value={contextValue as any}>
      {children}
    </HarnessStateProvider>
  );
}
