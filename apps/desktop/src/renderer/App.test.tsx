import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type {
  DiffProjection,
  DoorwayEvent,
  AgentRunId,
  EventId,
  HandoffCapsuleProjection,
  MergeAssessmentProjection,
  MeshMessageProjection,
  PermissionReceiptProjection,
  ProofProjection,
  ProjectId,
  ProjectProjection,
  ProviderModelProjection,
  TaskGraphProjection,
  TaskId,
  TerminalInputProjection,
  TerminalProjection,
  TerminalSessionId,
  ThreadId,
  ThreadProjection,
  ToolCapabilityProjection,
  TranscriptChunk,
  WorktreeProjection,
} from '@doorway/protocol';

vi.mock('./hooks', () => ({
  permissionDecisionTerminalInput: (decision: 'approved' | 'denied') =>
    decision === 'approved' ? 'y\n' : 'n\n',
  useDoorway: () => ({
    projects: [],
    activeProject: null,
    projectMemorySources: [],
    providerModels: [],
    toolCapabilities: [],
    threads: [],
    activeThread: null,
    messages: [],
    threadEvents: [],
    proofs: [],
    permissionReceipts: [],
    mergeAssessments: [],
    handoffCapsules: [],
    peerMessages: [],
    taskGraphs: [],
    agentEvents: [],
    activeTerminalSessionId: null,
    terminalSessions: [],
    terminalTranscript: [],
    terminalInputs: [],
    worktrees: [],
    selectedWorktreePath: null,
    activeDiff: null,
    browserState: { url: '', title: '', isLoading: false, isAgentControlled: true },
    browserActions: [],
    loading: false,
    error: null,
    setError: vi.fn(),
    openProject: vi.fn(),
    selectProject: vi.fn(),
    createThread: vi.fn(),
    selectThread: vi.fn(),
    launchAgent: vi.fn(),
    selectTerminalSession: vi.fn(),
    writeActiveTerminal: vi.fn(),
    resizeActiveTerminal: vi.fn(),
    stopActiveTerminal: vi.fn(),
    launchBrowser: vi.fn(),
    toggleBrowserControl: vi.fn(),
    loadWorktreeDiff: vi.fn(),
    evaluateMergeReadiness: vi.fn(),
    approveWorktreeMerge: vi.fn(),
    createIntegrationMerge: vi.fn(),
    forkWorktree: vi.fn(),
    archiveWorktree: vi.fn(),
    archiveMergedWorktreeBranch: vi.fn(),
    exportRollbackPatch: vi.fn(),
    createHandoff: vi.fn(),
    updateGraphNodeStatus: vi.fn(),
    decidePermission: vi.fn(),
    copyText: vi.fn(),
    exportBrowserEvidence: vi.fn(),
    exportThreadReplay: vi.fn(),
    openPath: vi.fn(),
    setToolEnabled: vi.fn(),
  }),
}));

describe('App', () => {
  it('renders the real desktop shell without stale milestone or decorative nav', async () => {
    const { App } = await import('./App');
    const html = renderToStaticMarkup(React.createElement(App));

    expect(html).toContain('Local-first agent cockpit');
    expect(html).toContain('aria-label="Surfaces"');
    expect(html).toContain('Browser');
    expect(html).toContain('Terminal');
    expect(html).toContain('Evidence');
    expect(html).toContain('Worktrees');
    expect(html).toContain('Tools');
    expect(html).toContain('class="rail-icon"');
    expect(html).toContain('New chat');
    expect(html).toContain('Search chats and projects');
    expect(html).toContain('Chats');
    expect(html).toContain('<small>0</small>');
    expect(html).toContain('No project opened');
    expect(html).toContain('Open a local repository');
    expect(html).toContain('terminal transcripts');
    expect(html).toContain('Open project');
    expect(html).toContain('Ask Doorway to coordinate a coding task');
    expect(html).toContain('Use @CloudCode or @Codex for routing context.');
    expect(html).toContain('aria-label="Composer mode"');
    expect(html).toContain('aria-label="Permission posture"');
    expect(html).toContain('aria-label="Worktree strategy"');
    expect(html).toContain('aria-label="PTY mode"');
    expect(html).toContain('Doorway PTY');
    // Theme is now dark mode (premium default)
    expect(html).toContain('data-theme="dark"');
    expect(html).not.toContain('class="surface-drawer"');
    expect(html).not.toContain('M0 Reality Reset');
    // The utility rail now has a proper <nav> element for accessibility
    expect(html).not.toContain('aria-hidden="true">B</span>');
    expect(html).not.toContain('aria-hidden="true">T</span>');
    expect(html).not.toContain('Runs');
    expect(html).not.toContain('will');
    expect(html).not.toContain('appears here');
    expect(html).not.toContain('yet');
  });

  it('mounts visible Doorway UI from the renderer entrypoint', async () => {
    let mountedTree: React.ReactElement | undefined;
    const render = vi.fn((tree: React.ReactElement) => {
      mountedTree = tree;
    });
    const createRoot = vi.fn(() => ({ render, unmount: vi.fn() }));
    vi.doMock('react-dom/client', () => ({ createRoot }));
    const { mountDoorwayApp } = await import('./main');
    const container = {} as HTMLElement;

    mountDoorwayApp(container);

    expect(createRoot).toHaveBeenCalledWith(container);
    expect(render).toHaveBeenCalledTimes(1);
    expect(mountedTree).toBeDefined();
    const html = renderToStaticMarkup(mountedTree as React.ReactElement);

    expect(html).toContain('Local-first agent cockpit');
    expect(html).toContain('No project opened');
    expect(html).toContain('Open a local repository');
    expect(html).toContain('Ask Doorway to coordinate a coding task');
    expect(html).not.toBe('');
    // Theme is now dark mode (premium default)
    expect(html).toContain('data-theme="dark"');

    vi.doUnmock('react-dom/client');
  });

  it('locks the reference shell layout in CSS tokens and rendered structure', async () => {
    const { App } = await import('./App');
    const [tokensCss, stylesCss] = await Promise.all([
      readFile(new URL('./tokens.css', import.meta.url), 'utf-8'),
      readFile(new URL('./styles.css', import.meta.url), 'utf-8'),
    ]);
    const html = renderToStaticMarkup(React.createElement(App));

    expect(tokensCss).toContain('--dw-rail-width: 56px;');
    expect(tokensCss).toContain('--dw-rail-gap: 8px;');
    expect(tokensCss).toContain('--dw-sidebar-width: 284px;');
    expect(stylesCss).toContain(
      'grid-template-columns: var(--dw-rail-width) var(--dw-rail-gap) var(--dw-sidebar-width)'
    );
    expect(stylesCss).toContain('.utility-rail');
    // Theme updated to dark mode with new color tokens
    expect(stylesCss).toContain('rgba(255, 255, 255, 0.06)');
    expect(stylesCss).toContain('.rail-separator');
    expect(stylesCss).toContain('.sidebar-thread-group');
    expect(stylesCss).toContain('.sidebar-context');
    expect(stylesCss).toContain('width: min(100%, 1240px);');
    expect(stylesCss).toContain('width: min(380px, calc(100vw - 24px));');
    expect(stylesCss).toContain('.composer-dock');
    expect(stylesCss).toContain('.composer-primary-row');
    expect(stylesCss).toContain('grid-template-columns: 38px minmax(0, 1fr) 42px;');
    expect(stylesCss).toContain('border-radius: 18px;');
    expect(stylesCss).toContain('.terminal-surface');
    expect(stylesCss).toContain('.terminal-mux');
    expect(stylesCss).toContain('.review-action-group');
    expect(stylesCss).toContain('.surface-drawer');
    expect(stylesCss).toContain('position: fixed;');
    expect(html.indexOf('class="utility-rail"')).toBeLessThan(html.indexOf('class="main-sidebar"'));
    expect(html.indexOf('class="main-sidebar"')).toBeLessThan(
      html.indexOf('class="thread-canvas"')
    );
    expect(html).toContain('aria-label="Sidebar project context"');
    expect(html).toContain('class="composer-dock"');
    expect(html).toContain('class="composer-primary-row"');
    expect(html).toContain('aria-label="Open command menu"');
    expect(html).not.toContain('class="surface-drawer"');
  });

  it('groups sidebar threads from real selection, status, and timestamps', async () => {
    const { sidebarThreadGroups } = await import('./App');
    const current = {
      id: 'thread_current' as ThreadId,
      projectId: 'project_1' as ProjectId,
      title: 'Current review',
      status: 'paused',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
      updatedAt: new Date('2026-05-18T03:00:00.000Z'),
      messageCount: 7,
    } satisfies ThreadProjection;
    const activeOlder = {
      id: 'thread_active_older' as ThreadId,
      projectId: 'project_1' as ProjectId,
      title: 'Older active',
      status: 'active',
      createdAt: new Date('2026-05-18T01:30:00.000Z'),
      updatedAt: new Date('2026-05-18T02:00:00.000Z'),
    } satisfies ThreadProjection;
    const activeNewer = {
      id: 'thread_active_newer' as ThreadId,
      projectId: 'project_1' as ProjectId,
      title: 'Newer active',
      status: 'active',
      createdAt: new Date('2026-05-18T02:30:00.000Z'),
      updatedAt: new Date('2026-05-18T02:45:00.000Z'),
    } satisfies ThreadProjection;
    const completed = {
      id: 'thread_completed' as ThreadId,
      projectId: 'project_1' as ProjectId,
      title: 'Completed run',
      status: 'completed',
      createdAt: new Date('2026-05-18T00:30:00.000Z'),
      updatedAt: new Date('2026-05-18T01:45:00.000Z'),
      runCount: 2,
    } satisfies ThreadProjection;

    const groups = sidebarThreadGroups([activeOlder, completed, current, activeNewer], current);

    expect(groups.current.map((thread) => thread.id)).toEqual(['thread_current']);
    expect(groups.active.map((thread) => thread.id)).toEqual([
      'thread_active_newer',
      'thread_active_older',
    ]);
    expect(groups.recent.map((thread) => thread.id)).toEqual(['thread_completed']);
  });

  it('renders first-run project opening from real path input state', async () => {
    const { FirstRunProjectPanel } = await import('./App');
    const html = renderToStaticMarkup(
      React.createElement(FirstRunProjectPanel, {
        loading: false,
        projectPath: '/home/govinda/Doorway',
        setProjectPath: vi.fn(),
        submitProject: vi.fn(),
      })
    );
    const disabledHtml = renderToStaticMarkup(
      React.createElement(FirstRunProjectPanel, {
        loading: false,
        projectPath: '',
        setProjectPath: vi.fn(),
        submitProject: vi.fn(),
      })
    );

    expect(html).toContain('aria-label="Open local repository"');
    expect(html).toContain('value="/home/govinda/Doorway"');
    expect(html).toContain('Open project');
    expect(html).toContain('worktrees');
    expect(html).toContain('aria-label="Local evidence surfaces"');
    expect(html).toContain('SQLite ledger');
    expect(html).toContain('Replay evidence');
    expect(disabledHtml).toContain('disabled=""');
  });

  it('renders an opened-project thread starter from real project state', async () => {
    const { EmptyProjectThreadPanel } = await import('./App');
    const project = {
      id: 'project_doorway' as ProjectId,
      name: 'Doorway',
      path: '/home/govinda/Doorway',
      mode: 'git',
      packageManager: 'pnpm',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ProjectProjection;

    const html = renderToStaticMarkup(
      React.createElement(EmptyProjectThreadPanel, {
        activeProject: project,
        loading: false,
        threadTitle: 'Review merge path',
        setThreadTitle: vi.fn(),
        submitThread: vi.fn(),
      })
    );
    const disabledHtml = renderToStaticMarkup(
      React.createElement(EmptyProjectThreadPanel, {
        activeProject: project,
        loading: true,
        threadTitle: '',
        setThreadTitle: vi.fn(),
        submitThread: vi.fn(),
      })
    );

    expect(html).toContain('aria-label="Start persisted thread"');
    expect(html).toContain('Project ready');
    expect(html).toContain('/home/govinda/Doorway');
    expect(html).toContain('aria-label="Project runtime metadata"');
    expect(html).toContain('git');
    expect(html).toContain('pnpm');
    expect(html).toContain('value="Review merge path"');
    expect(html).toContain('Create thread');
    expect(html).toContain('send the first prompt below');
    expect(html).toContain('local state');
    expect(disabledHtml).toContain('disabled=""');
  });

  it('renders sidebar project context from real runtime counts', async () => {
    const { SidebarProjectContext } = await import('./App');
    const activeProject = {
      id: 'project_doorway' as ProjectId,
      name: 'Doorway',
      path: '/home/govinda/Doorway',
      mode: 'git',
      packageManager: 'pnpm',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ProjectProjection;
    const activeThread = {
      id: 'thread_review' as ThreadId,
      projectId: activeProject.id,
      title: 'Review merge path',
      status: 'active',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ThreadProjection;

    const html = renderToStaticMarkup(
      React.createElement(SidebarProjectContext, {
        activeProject,
        activeThread,
        projectMemorySources: [
          { sourceFile: 'AGENTS.md', category: 'instruction', contentLength: 1200 },
          { sourceFile: 'DOORWAY.md', category: 'instruction', contentLength: 900 },
        ],
        worktreeCount: 3,
        evidenceRecordCount: 5,
      })
    );
    const emptyHtml = renderToStaticMarkup(
      React.createElement(SidebarProjectContext, {
        activeProject: null,
        activeThread: null,
        projectMemorySources: [],
        worktreeCount: 0,
        evidenceRecordCount: 0,
      })
    );

    expect(html).toContain('aria-label="Sidebar project context"');
    expect(html).toContain('Doorway');
    expect(html).toContain('/home/govinda/Doorway');
    expect(html).toContain('active');
    expect(html).toContain('2 instructions');
    expect(html).toContain('3 worktrees');
    expect(html).toContain('5 records');
    expect(emptyHtml).toContain('No project');
    expect(emptyHtml).toContain('Open a local repository');
    expect(emptyHtml).toContain('0 instructions');
  });

  it('maps Doorway worktrees to the latest persisted merge score', async () => {
    const {
      ActiveWorktreeCapsule,
      filterMergeAssessmentsByScore,
      latestAssessmentsByTask,
      selectedWorktree,
      sortMergeAssessmentsByEvidenceTime,
      worktreeArchiveBlockedReason,
      worktreeCleanStatusLabel,
      worktreeForkBlockedReason,
      worktreeMergeScore,
      worktreeSafetySummary,
    } = await import('./App');
    const worktree = {
      id: 'wt_review',
      path: '/repo/.doorway-workspaces/task-review',
      branch: 'refs/heads/doorway/task-review/backend',
      status: 'active',
      commit: 'abc123',
      isActive: true,
      isClean: true,
    } as WorktreeProjection;
    const otherWorktree = {
      id: 'wt_other',
      path: '/repo/.doorway-workspaces/other',
      branch: 'refs/heads/doorway/other/backend',
    } as WorktreeProjection;
    const mergeAssessments = [
      {
        id: 'merge_old',
        taskId: 'task-review' as TaskId,
        score: 'reviewable',
        reason: 'Older assessment',
        cleanApply: true,
        testsPassed: false,
        highRiskFiles: [],
        hasApproval: false,
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'merge_new',
        taskId: 'task-review' as TaskId,
        score: 'ready',
        reason: 'Latest assessment',
        cleanApply: true,
        testsPassed: true,
        highRiskFiles: [],
        hasApproval: true,
        createdAt: new Date('2026-05-18T02:00:00.000Z'),
        evidence: [],
      },
    ] satisfies MergeAssessmentProjection[];
    const assessments = latestAssessmentsByTask(mergeAssessments);

    expect(selectedWorktree([otherWorktree, worktree], worktree.path)).toBe(worktree);
    expect(worktreeMergeScore(worktree, assessments)).toBe('ready');
    expect(worktreeSafetySummary([otherWorktree, worktree], assessments)).toEqual({
      reviewableCount: 2,
      readyCount: 1,
      cleanCount: 1,
    });
    expect(worktreeCleanStatusLabel(worktree)).toBe('clean');
    expect(worktreeForkBlockedReason(worktree)).toBeUndefined();
    expect(worktreeArchiveBlockedReason(worktree)).toBeUndefined();
    expect(worktreeForkBlockedReason({ ...worktree, isClean: false })).toBe(
      'Commit or stash changes in /repo/.doorway-workspaces/task-review before forking.'
    );
    expect(worktreeArchiveBlockedReason({ ...worktree, isClean: false })).toBe(
      'Commit or stash changes in /repo/.doorway-workspaces/task-review before archiving.'
    );
    expect(worktreeForkBlockedReason(undefined)).toBe('Select a worktree before forking.');
    expect(worktreeArchiveBlockedReason(undefined)).toBe('Select a worktree before archiving.');
    expect(filterMergeAssessmentsByScore(mergeAssessments, 'ready').map((item) => item.id)).toEqual(
      ['merge_new']
    );
    expect(
      filterMergeAssessmentsByScore(mergeAssessments, 'reviewable').map((item) => item.id)
    ).toEqual(['merge_old']);
    expect(sortMergeAssessmentsByEvidenceTime(mergeAssessments).map((item) => item.id)).toEqual([
      'merge_new',
      'merge_old',
    ]);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(ActiveWorktreeCapsule, {
        worktrees: [worktree],
        selectedWorktreePath: null,
        worktreeAssessments: assessments,
      })
    );
    const html = renderToStaticMarkup(
      React.createElement(ActiveWorktreeCapsule, {
        worktrees: [otherWorktree, worktree],
        selectedWorktreePath: worktree.path,
        worktreeAssessments: assessments,
      })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Active worktree"');
    expect(html).toContain('refs/heads/doorway/task-review/backend');
    expect(html).toContain('/repo/.doorway-workspaces/task-review');
    expect(html).toContain('ready');
    expect(html).toContain('abc123');
  });

  it('renders a real first action when no worktrees exist for an active thread', async () => {
    const { WorktreeFirstActionCard, worktreeFirstActionPrompt } = await import('./App');
    const activeProject = {
      id: 'project_doorway' as ProjectId,
      name: 'Doorway',
      path: '/home/govinda/Doorway',
      mode: 'git',
      packageManager: 'pnpm',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ProjectProjection;
    const activeThread = {
      id: 'thread_worktree' as ThreadId,
      projectId: activeProject.id,
      title: 'Review merge path',
      status: 'active',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ThreadProjection;

    expect(worktreeFirstActionPrompt(activeThread)).toContain(
      'Continue "Review merge path" in an isolated Doorway worktree.'
    );

    const html = renderToStaticMarkup(
      React.createElement(WorktreeFirstActionCard, {
        activeProject,
        activeThread,
        loading: false,
        blockedReason: undefined,
        onStart: vi.fn(),
      })
    );

    expect(html).toContain('Start isolated worktree run');
    expect(html).toContain('create the first reviewable worktree');
    expect(html).not.toContain('disabled=""');

    const terminalOnlyHtml = renderToStaticMarkup(
      React.createElement(WorktreeFirstActionCard, {
        activeProject: { ...activeProject, mode: 'non_git' },
        activeThread,
        loading: false,
        blockedReason: undefined,
        onStart: vi.fn(),
      })
    );

    expect(terminalOnlyHtml).toContain('Terminal-only project');
    expect(terminalOnlyHtml).toContain('no Git repository was detected');
    expect(terminalOnlyHtml).toContain('Worktrees unavailable');
    expect(terminalOnlyHtml).toContain('disabled=""');
  });

  it('renders selected worktree review action groups with real policy states', async () => {
    const { WorktreeReviewActions } = await import('./App');
    const activeThread = {
      id: 'thread_review' as ThreadId,
      projectId: 'project_doorway' as ProjectId,
      title: 'Review selected diff',
      status: 'active',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ThreadProjection;
    const handlers = {
      evaluateMergeReadiness: vi.fn(),
      approveWorktreeMerge: vi.fn(),
      createIntegrationMerge: vi.fn(),
      forkWorktree: vi.fn(),
      archiveWorktree: vi.fn(),
      exportRollbackPatch: vi.fn(),
      createHandoff: vi.fn(),
      exportThreadReplay: vi.fn(),
    };

    const html = renderToStaticMarkup(
      React.createElement(WorktreeReviewActions, {
        activeThread,
        loading: false,
        selectedWorktreePath: '/repo/.doorway-workspaces/task-review',
        provider: 'codex',
        isReviewMergeBlocked: false,
        reviewMergeBlockedReason: undefined,
        reviewMergePolicyTitle: undefined,
        hasReplayVerificationWarning: false,
        replayVerificationPolicyReason: undefined,
        forkWorktreeBlockedReason: undefined,
        archiveWorktreeBlockedReason: undefined,
        archiveMergedBranchTitle: 'Archive only after merge evidence is present',
        ...handlers,
      })
    );
    const blockedHtml = renderToStaticMarkup(
      React.createElement(WorktreeReviewActions, {
        activeThread,
        loading: false,
        selectedWorktreePath: null,
        provider: 'codex',
        isReviewMergeBlocked: true,
        reviewMergeBlockedReason: 'Enable merge tool before review.',
        reviewMergePolicyTitle: 'Enable merge tool before review.',
        hasReplayVerificationWarning: true,
        replayVerificationPolicyReason: 'Replay verification is stale.',
        forkWorktreeBlockedReason: 'Select a worktree before forking.',
        archiveWorktreeBlockedReason: 'Select a worktree before archiving.',
        archiveMergedBranchTitle: 'Select a worktree before archiving.',
        ...handlers,
      })
    );

    expect(html).toContain('aria-label="Readiness actions"');
    expect(html).toContain('aria-label="Branch safety actions"');
    expect(html).toContain('aria-label="Evidence handoff actions"');
    expect(html).toContain('Evaluate merge readiness');
    expect(html).toContain('Approve merge');
    expect(html).toContain('Create integration branch');
    expect(html).toContain('Fork worktree');
    expect(html).toContain('Archive merged branch');
    expect(html).toContain('Export rollback patch');
    expect(html).toContain('Generate handoff');
    expect(html).not.toContain('disabled=""');
    expect(blockedHtml).toContain('aria-label="Review merge policy"');
    expect(blockedHtml).toContain('Enable merge tool before review.');
    expect(blockedHtml).toContain('aria-label="Replay verification policy"');
    expect(blockedHtml).toContain('Replay verification is stale.');
    expect(blockedHtml).toContain('Select a worktree before exporting rollback patch');
    expect(blockedHtml).toContain('disabled=""');
  });

  it('selects the latest persisted proof for the worktree review strip', async () => {
    const { filterProofsByStatus, latestProof, sortProofsByEvidenceTime } = await import('./App');
    const proofs = [
      {
        id: 'proof_new',
        label: 'Post-merge test run',
        status: 'pass',
        command: 'pnpm test',
        summary: 'Test command exited with code 0.',
        startedAt: new Date('2026-05-18T01:00:00.000Z'),
        finishedAt: new Date('2026-05-18T01:01:00.000Z'),
        evidence: [],
      },
      {
        id: 'proof_old',
        label: 'Old test run',
        status: 'fail',
        command: 'pnpm test',
        startedAt: new Date('2026-05-18T00:00:00.000Z'),
        finishedAt: new Date('2026-05-18T00:01:00.000Z'),
        evidence: [],
      },
    ] satisfies ProofProjection[];

    expect(latestProof(proofs)?.id).toBe('proof_new');
    expect(filterProofsByStatus(proofs, 'pass').map((proof) => proof.id)).toEqual(['proof_new']);
    expect(filterProofsByStatus(proofs, 'fail').map((proof) => proof.id)).toEqual(['proof_old']);
    expect(sortProofsByEvidenceTime([...proofs].reverse()).map((proof) => proof.id)).toEqual([
      'proof_new',
      'proof_old',
    ]);
  });

  it('renders a review replay verification action only for active threads', async () => {
    const { ReplayVerificationPolicyStatus } = await import('./App');
    const activeThread = {
      id: 'thread_review' as ThreadId,
      projectId: 'project_doorway' as ProjectId,
      title: 'Review replay',
      status: 'active',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ThreadProjection;

    const emptyHtml = renderToStaticMarkup(
      React.createElement(ReplayVerificationPolicyStatus, {
        activeThread: null,
        loading: false,
        reason: 'No successful replay verification recorded for this thread',
        exportThreadReplay: vi.fn(),
      })
    );
    const html = renderToStaticMarkup(
      React.createElement(ReplayVerificationPolicyStatus, {
        activeThread,
        loading: false,
        reason: 'No successful replay verification recorded for this thread',
        exportThreadReplay: vi.fn(),
      })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Replay verification policy"');
    expect(html).toContain('No successful replay verification recorded for this thread');
    expect(html).toContain('Verify replay');
    expect(html).not.toContain('disabled=""');
  });

  it('renders worktree review evidence from the newest recorded proofs and assessments', async () => {
    const { latestReplayVerificationEvent, ReviewEvidence } = await import('./App');
    const mergeAssessments = [
      {
        id: 'merge_oldest',
        taskId: 'task-review' as TaskId,
        score: 'blocked',
        reason: 'Oldest merge reason',
        cleanApply: false,
        testsPassed: false,
        highRiskFiles: [],
        hasApproval: false,
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'merge_newest',
        taskId: 'task-review' as TaskId,
        score: 'ready',
        reason: 'Newest merge reason',
        cleanApply: true,
        testsPassed: true,
        highRiskFiles: [],
        hasApproval: true,
        createdAt: new Date('2026-05-18T03:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'merge_middle',
        taskId: 'task-review' as TaskId,
        score: 'reviewable',
        reason: 'Middle merge reason',
        cleanApply: true,
        testsPassed: false,
        highRiskFiles: [],
        hasApproval: false,
        createdAt: new Date('2026-05-18T02:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'merge_older',
        taskId: 'task-review' as TaskId,
        score: 'risky',
        reason: 'Older merge reason',
        cleanApply: true,
        testsPassed: false,
        highRiskFiles: [],
        hasApproval: false,
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      },
    ] satisfies MergeAssessmentProjection[];
    const proofs = [
      {
        id: 'proof_oldest',
        label: 'Oldest proof label',
        status: 'fail',
        command: 'pnpm test',
        summary: 'Oldest proof summary',
        startedAt: new Date('2026-05-18T00:10:00.000Z'),
        finishedAt: new Date('2026-05-18T00:11:00.000Z'),
        evidence: [],
      },
      {
        id: 'proof_newest',
        label: 'Newest proof label',
        status: 'pass',
        command: 'pnpm gate',
        summary: 'Newest proof summary',
        startedAt: new Date('2026-05-18T03:10:00.000Z'),
        finishedAt: new Date('2026-05-18T03:11:00.000Z'),
        evidence: [],
      },
      {
        id: 'proof_middle',
        label: 'Middle proof label',
        status: 'pass',
        command: 'pnpm test',
        summary: 'Middle proof summary',
        startedAt: new Date('2026-05-18T02:10:00.000Z'),
        finishedAt: new Date('2026-05-18T02:11:00.000Z'),
        evidence: [],
      },
      {
        id: 'proof_older',
        label: 'Older proof label',
        status: 'fail',
        command: 'pnpm test',
        summary: 'Older proof summary',
        startedAt: new Date('2026-05-18T01:10:00.000Z'),
        finishedAt: new Date('2026-05-18T01:11:00.000Z'),
        evidence: [],
      },
    ] satisfies ProofProjection[];
    const permissionReceipts = [
      {
        id: 'perm_old',
        taskId: 'task-review' as TaskId,
        command: 'rm -rf dist',
        riskCategory: 'filesystem',
        decision: 'denied',
        userNotes: 'Old permission note',
        timestamp: new Date('2026-05-18T00:20:00.000Z'),
        evidence: [],
      },
      {
        id: 'perm_new',
        taskId: 'task-review' as TaskId,
        command: 'pnpm gate',
        riskCategory: 'verification',
        decision: 'approved',
        userNotes: 'Newest permission note',
        timestamp: new Date('2026-05-18T03:20:00.000Z'),
        evidence: [],
      },
    ] satisfies PermissionReceiptProjection[];
    const activeDiff = {
      files: [
        {
          path: 'apps/desktop/src/renderer/App.tsx',
          status: 'modified',
          additions: 12,
          deletions: 3,
          patch: [
            'diff --git a/apps/desktop/src/renderer/App.tsx b/apps/desktop/src/renderer/App.tsx',
            '--- a/apps/desktop/src/renderer/App.tsx',
            '+++ b/apps/desktop/src/renderer/App.tsx',
            '@@ -1 +1 @@',
            '-old line',
            '+new line',
          ].join('\n'),
        },
        {
          path: 'apps/desktop/src/renderer/App.test.tsx',
          status: 'modified',
          additions: 9,
          deletions: 1,
        },
      ],
      totalAdditions: 21,
      totalDeletions: 4,
      evidence: [],
    } satisfies DiffProjection;
    const browserActions = [
      {
        timestamp: new Date('2026-05-18T03:21:00.000Z'),
        type: 'navigate',
        url: 'http://127.0.0.1:5173',
      },
      {
        timestamp: new Date('2026-05-18T03:22:00.000Z'),
        type: 'screenshot',
        screenshot: '/tmp/review.png',
      },
    ];
    const replayVerificationFailed = {
      id: 'evt_replay_failed',
      threadId: 'thread_1',
      type: 'thread.replay_verification_failed',
      payload: {
        path: '/tmp/old-thread.jsonl',
        error: 'old replay error',
        createdAt: '2026-05-18T03:18:00.000Z',
      },
      timestamp: new Date('2026-05-18T03:18:00.000Z'),
      sequence: 1,
    } as unknown as DoorwayEvent;
    const replayVerificationSucceeded = {
      id: 'evt_replay_passed',
      threadId: 'thread_1',
      type: 'thread.replay_verification_succeeded',
      payload: {
        path: '/tmp/thread.jsonl',
        eventCount: 2,
        firstSequence: 1,
        lastSequence: 2,
        threadIds: ['thread_1'],
        createdAt: '2026-05-18T03:23:00.000Z',
      },
      timestamp: new Date('2026-05-18T03:23:00.000Z'),
      sequence: 2,
    } as unknown as DoorwayEvent;
    const threadEvents = [replayVerificationFailed, replayVerificationSucceeded];

    const html = renderToStaticMarkup(
      React.createElement(ReviewEvidence, {
        activeDiff,
        browserActions,
        mergeAssessments,
        permissionReceipts,
        proofs,
        threadEvents,
      })
    );

    expect(html.indexOf('Newest merge reason')).toBeLessThan(html.indexOf('Middle merge reason'));
    expect(html.indexOf('Middle merge reason')).toBeLessThan(html.indexOf('Older merge reason'));
    expect(html).not.toContain('Oldest merge reason');
    expect(html.indexOf('Newest proof label')).toBeLessThan(html.indexOf('Middle proof label'));
    expect(html.indexOf('Middle proof label')).toBeLessThan(html.indexOf('Older proof label'));
    expect(html).not.toContain('Oldest proof label');
    expect(html).toContain('Permission approved');
    expect(html).toContain('Newest permission note');
    expect(html).toContain('Diff evidence');
    expect(html).toContain('+21 -4');
    expect(html).toContain('apps/desktop/src/renderer/App.tsx');
    expect(html).toContain('Rollback preview');
    expect(html).toContain('+old line');
    expect(html).toContain('-new line');
    expect(html).toContain('Browser proof');
    expect(html).toContain('navigate http://127.0.0.1:5173');
    expect(latestReplayVerificationEvent(threadEvents)?.id).toBe('evt_replay_passed');
    expect(html).toContain('Replay verification passed');
    expect(html).toContain('/tmp/thread.jsonl · 2 events · seq 1-2 · thread_1');
  });

  it('formats handoff capsule provider and worktree metadata', async () => {
    const {
      handoffCapsuleMetadata,
      handoffChangedFileOpenPath,
      handoffChangedFilePreview,
      handoffWorktreeOpenPath,
    } = await import('./App');
    const capsule = {
      id: 'hnd_1',
      threadId: 'thread_1',
      sourceRunId: 'run_1',
      targetProvider: 'codex',
      summary: 'Run summary',
      latestIntent: 'Continue',
      runSummary: 'Run summary',
      worktreePath: ' /repo/.doorway-workspaces/task ',
      branch: 'doorway/task/backend',
      changedFiles: [
        ' apps/desktop/src/renderer/App.tsx ',
        'apps/desktop/src/renderer/styles.css',
        'apps/desktop/src/main/handlers.ts',
      ],
      diffSummary: '',
      openQuestions: [],
      nextPrompt: 'Continue',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
      evidence: [],
    } as unknown as HandoffCapsuleProjection;

    expect(handoffCapsuleMetadata(capsule)).toEqual([
      'Provider codex',
      'Branch doorway/task/backend',
      'Worktree /repo/.doorway-workspaces/task',
    ]);
    expect(handoffWorktreeOpenPath(capsule)).toBe('/repo/.doorway-workspaces/task');
    expect(handoffChangedFilePreview(capsule, 2)).toEqual({
      files: ['apps/desktop/src/renderer/App.tsx', 'apps/desktop/src/renderer/styles.css'],
      remaining: 1,
    });
    expect(handoffChangedFileOpenPath(capsule, 'apps/desktop/src/renderer/App.tsx')).toBe(
      '/repo/.doorway-workspaces/task/apps/desktop/src/renderer/App.tsx'
    );
  });

  it('formats evidence section counts', async () => {
    const {
      evidenceCountLabel,
      evidenceTimestampLabel,
      filterPermissionReceiptsByDecision,
      sortPermissionReceiptsByEvidenceTime,
      toolPolicyDenials,
    } = await import('./App');
    const receipts = [
      {
        id: 'perm_approved',
        taskId: 'task-review' as TaskId,
        command: 'merge doorway/task-review/backend',
        riskCategory: 'merge_approval',
        decision: 'approved',
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'perm_denied',
        taskId: 'task-review' as TaskId,
        command: 'delete src/index.ts',
        riskCategory: 'destructive_command',
        decision: 'denied',
        timestamp: new Date('2026-05-18T02:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'perm_tool_denied',
        taskId: 'task-review' as TaskId,
        command: 'agent:launch codex',
        riskCategory: 'tool_disabled',
        decision: 'denied',
        timestamp: new Date('2026-05-18T03:00:00.000Z'),
        evidence: [],
      },
    ] satisfies PermissionReceiptProjection[];

    expect(evidenceCountLabel(1, 'proof')).toBe('1 proof');
    expect(evidenceCountLabel(2, 'proof')).toBe('2 proofs');
    expect(evidenceTimestampLabel(new Date('2026-05-18T01:00:00.000Z'))).toBe(
      'Recorded 2026-05-18T01:00:00.000Z'
    );
    expect(filterPermissionReceiptsByDecision(receipts, 'approved').map((item) => item.id)).toEqual(
      ['perm_approved']
    );
    expect(filterPermissionReceiptsByDecision(receipts, 'denied').map((item) => item.id)).toEqual([
      'perm_denied',
      'perm_tool_denied',
    ]);
    expect(sortPermissionReceiptsByEvidenceTime(receipts).map((item) => item.id)).toEqual([
      'perm_tool_denied',
      'perm_denied',
      'perm_approved',
    ]);
    expect(toolPolicyDenials(receipts).map((item) => item.id)).toEqual(['perm_tool_denied']);
  });

  it('renders newest thread evidence capsules from persisted proof records only', async () => {
    const { EvidenceFeedCapsule, evidenceFeedItems } = await import('./App');
    const proof = {
      id: 'proof_new',
      label: 'Browser proof',
      status: 'pass',
      command: 'pnpm test',
      summary: 'Login proof passed',
      startedAt: new Date('2026-05-18T01:00:00.000Z'),
      finishedAt: new Date('2026-05-18T04:00:00.000Z'),
      evidence: [],
    } satisfies ProofProjection;

    expect(evidenceFeedItems([proof]).map((item) => item.id)).toEqual(['proof_new']);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(EvidenceFeedCapsule, { proofs: [] })
    );
    const html = renderToStaticMarkup(
      React.createElement(EvidenceFeedCapsule, {
        proofs: [proof],
      })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Thread evidence"');
    expect(html).toContain('Login proof passed');
    expect(html).not.toContain('Merge');
    expect(html).not.toContain('Clean diff');
    expect(html).not.toContain('merge doorway');
  });

  it('renders newest merge review capsule from persisted assessments only', async () => {
    const { MergeReviewCapsule, latestMergeReviewAssessments } = await import('./App');
    const assessments = [
      {
        id: 'merge_old',
        taskId: 'task-review' as TaskId,
        score: 'blocked',
        reason: 'Old blocked reason',
        cleanApply: false,
        testsPassed: false,
        highRiskFiles: ['src/ledger.ts'],
        hasApproval: false,
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'merge_new',
        taskId: 'task-review' as TaskId,
        score: 'ready',
        reason: 'Newest clean diff',
        cleanApply: true,
        testsPassed: true,
        highRiskFiles: [],
        hasApproval: true,
        createdAt: new Date('2026-05-18T02:00:00.000Z'),
        evidence: [],
      },
    ] satisfies MergeAssessmentProjection[];

    expect(latestMergeReviewAssessments(assessments).map((assessment) => assessment.id)).toEqual([
      'merge_new',
      'merge_old',
    ]);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(MergeReviewCapsule, { mergeAssessments: [] })
    );
    const html = renderToStaticMarkup(
      React.createElement(MergeReviewCapsule, { mergeAssessments: assessments })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Merge review history"');
    expect(html.indexOf('Newest clean diff')).toBeLessThan(html.indexOf('Old blocked reason'));
    expect(html).toContain('Tests passed');
    expect(html).toContain('Approval missing');
    expect(html).toContain('1 high-risk files');
  });

  it('renders Agent Mesh peer messages from persisted rows only', async () => {
    const {
      PeerMessagesCapsule,
      peerMessageKindLabel,
      peerMessageRouteLabel,
      sortPeerMessagesByEvidenceTime,
    } = await import('./App');
    const threadId = 'thread_mesh' as ThreadId;
    const peerMessages = [
      {
        id: 'mesh_old',
        threadId,
        fromAgentId: 'mesh_agent_a',
        fromDisplayName: 'Claude Implementer',
        fromAgentKind: 'visible_cli',
        toAgentId: 'mesh_agent_b',
        toDisplayName: 'Codex Reviewer',
        toAgentKind: 'reviewer',
        kind: 'question',
        content: 'Can you inspect the persistence path?',
        evidenceRefs: [],
        status: 'handled',
        requiresHumanApproval: false,
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'mesh_new',
        threadId,
        fromAgentId: 'mesh_agent_b',
        fromDisplayName: 'Codex Reviewer',
        fromAgentKind: 'reviewer',
        toAgentId: 'mesh_agent_a',
        toDisplayName: 'Claude Implementer',
        toAgentKind: 'visible_cli',
        kind: 'verification_result',
        content: 'Persistence path passes with [REDACTED] token removed.',
        evidenceRefs: ['terminal:term_review:7'],
        status: 'unhandled',
        requiresHumanApproval: true,
        createdAt: new Date('2026-05-18T02:00:00.000Z'),
        evidence: [],
      },
    ] satisfies MeshMessageProjection[];

    expect(sortPeerMessagesByEvidenceTime(peerMessages).map((message) => message.id)).toEqual([
      'mesh_new',
      'mesh_old',
    ]);
    const newestPeerMessage = peerMessages[1];
    if (!newestPeerMessage) {
      throw new Error('Expected peer message fixture');
    }
    expect(peerMessageKindLabel('verification_result')).toBe('verification result');
    expect(peerMessageRouteLabel(newestPeerMessage)).toBe('Codex Reviewer -> Claude Implementer');

    const emptyHtml = renderToStaticMarkup(
      React.createElement(PeerMessagesCapsule, { peerMessages: [] })
    );
    const html = renderToStaticMarkup(React.createElement(PeerMessagesCapsule, { peerMessages }));

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Agent Mesh messages"');
    expect(html.indexOf('Persistence path passes')).toBeLessThan(html.indexOf('Can you inspect'));
    expect(html).toContain('verification result');
    expect(html).toContain('Codex Reviewer -&gt; Claude Implementer');
  });

  it('renders newest terminal transcript chunks from persisted terminal output only', async () => {
    const { TerminalTranscriptCapsule, latestTerminalTranscriptChunks } = await import('./App');
    const { TerminalSurface, terminalSurfaceStatusLabel, terminalSurfaceText } =
      await import('./TerminalSurface');
    const sessionId = 'term_1' as TerminalSessionId;
    const approvalSessionId = 'term_approval' as TerminalSessionId;
    const chunks = [
      {
        sessionId,
        sequence: 1,
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
        text: 'pnpm test\n',
        isStdout: true,
        isStderr: false,
      },
      {
        sessionId,
        sequence: 3,
        timestamp: new Date('2026-05-18T01:00:02.000Z'),
        text: 'tests passed\n',
        isStdout: true,
        isStderr: false,
      },
      {
        sessionId,
        sequence: 2,
        timestamp: new Date('2026-05-18T01:00:01.000Z'),
        text: 'warning\n',
        isStdout: false,
        isStderr: true,
      },
    ] satisfies TranscriptChunk[];

    expect(latestTerminalTranscriptChunks(chunks, 2).map((chunk) => chunk.sequence)).toEqual([
      3, 2,
    ]);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(TerminalTranscriptCapsule, { terminalTranscript: [] })
    );
    const html = renderToStaticMarkup(
      React.createElement(TerminalTranscriptCapsule, { terminalTranscript: chunks })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Terminal transcript preview"');
    expect(html.indexOf('tests passed')).toBeLessThan(html.indexOf('warning'));
    expect(html).toContain('data-stream="stderr"');
    expect(html).toContain('stdout');

    const terminalHtml = renderToStaticMarkup(
      React.createElement(TerminalSurface, {
        terminalTranscript: chunks,
        fallbackText: 'No terminal session is active.',
        activeTerminalSessionId: sessionId,
        onInput: vi.fn(),
        onResize: vi.fn(),
      })
    );

    expect(terminalSurfaceText(chunks, 'No terminal session is active.')).toBe(
      'pnpm test\nwarning\ntests passed\n'
    );
    expect(terminalSurfaceStatusLabel(chunks, sessionId)).toBe('3 chunks persisted');
    expect(terminalSurfaceStatusLabel([], sessionId)).toBe('Terminal session term_1');
    expect(terminalHtml).toContain('aria-label="Managed terminal surface"');
    expect(terminalHtml).toContain('aria-label="xterm terminal transcript"');
    expect(terminalHtml).toContain('aria-label="Terminal transcript text"');
    expect(terminalHtml).toContain('data-interactive="true"');
    expect(terminalHtml).toContain('3 chunks persisted - interactive');
  });

  it('computes terminal mux sessions and metadata from persisted run evidence', async () => {
    const { terminalMuxMetadata, terminalSessionSummaries } = await import('./TerminalMuxPanel');
    const sessionId = 'term_1' as TerminalSessionId;
    const approvalSessionId = 'term_approval' as TerminalSessionId;
    const threadId = 'thread_1' as ThreadId;
    const events = [
      {
        id: 'evt_created' as EventId,
        threadId,
        type: 'terminal.created',
        payload: {
          sessionId,
          agentRunId: 'run_1' as AgentRunId,
          runtime: 'pty',
          command: 'pnpm test',
        },
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
        sequence: 1,
      },
      {
        id: 'evt_started' as EventId,
        threadId,
        type: 'terminal.started',
        payload: {
          sessionId,
          pid: 42,
        },
        timestamp: new Date('2026-05-18T01:00:01.000Z'),
        sequence: 2,
      },
      {
        id: 'evt_output' as EventId,
        threadId,
        type: 'terminal.output',
        payload: {
          sessionId,
          sequence: 0,
          text: 'tests passed\n',
          isStdout: true,
          isStderr: false,
        },
        timestamp: new Date('2026-05-18T01:00:02.000Z'),
        sequence: 3,
      },
      {
        id: 'evt_attention' as EventId,
        threadId,
        type: 'agent.attention',
        payload: {
          sessionId: approvalSessionId,
          state: 'needs_approval',
          source: 'terminal_output',
          reason: 'Terminal output requested permission or approval.',
          outputPreview: 'Permission required: allow command? [y/N]',
        },
        timestamp: new Date('2026-05-18T01:00:03.000Z'),
        sequence: 4,
      },
    ] satisfies DoorwayEvent[];
    const activeProject = {
      id: 'project_1' as ProjectId,
      path: '/repo',
      name: 'Doorway',
      mode: 'git',
      packageManager: 'pnpm',
    } satisfies ProjectProjection;
    const worktrees = [
      {
        id: 'wt_1' as WorktreeProjection['id'],
        path: '/repo/.doorway-workspaces/task-review',
        branch: 'refs/heads/doorway/task-review/backend',
        isActive: true,
      },
    ] satisfies WorktreeProjection[];
    const chunks = [
      {
        sessionId,
        sequence: 0,
        timestamp: new Date('2026-05-18T01:00:02.000Z'),
        text: 'tests passed\n',
        isStdout: true,
        isStderr: false,
      },
    ] satisfies TranscriptChunk[];
    const terminalSessions = [
      {
        id: sessionId,
        runtime: 'pty',
        status: 'running',
        workingDirectory: '/repo/.doorway-workspaces/task-review/backend',
        command: 'pnpm test',
        lastOutput: 'tests passed\n',
      },
      {
        id: approvalSessionId,
        runtime: 'pty',
        status: 'running',
        workingDirectory: '/repo/.doorway-workspaces/task-review/backend',
        command: 'claude code',
        lastOutput: 'awaiting worker signal\n',
      },
    ] satisfies TerminalProjection[];
    const terminalInputs = [
      {
        sessionId,
        sequence: 0,
        timestamp: new Date('2026-05-18T01:00:01.500Z'),
        text: 'pnpm test\n',
        source: 'user',
      },
      {
        sessionId,
        sequence: 1,
        timestamp: new Date('2026-05-18T01:00:02.500Z'),
        text: 'y\n',
        source: 'permission_decision',
      },
    ] satisfies TerminalInputProjection[];

    const sessions = terminalSessionSummaries({
      activeTerminalSessionId: sessionId,
      terminalSessions,
      terminalTranscript: chunks,
      threadEvents: events,
    });
    const metadata = terminalMuxMetadata({
      activeProject,
      activeTerminalSessionId: sessionId,
      selectedWorktreePath: null,
      terminalSessions,
      threadEvents: events,
      worktrees,
    });
    // Note: TerminalMuxPanel component rendering requires HarnessStateProvider context.
    // Full component rendering tests are in TerminalMuxPanel.test.tsx

    expect(sessions[0]).toMatchObject({
      id: sessionId,
      status: 'running',
      command: 'pnpm test',
      attention: 'running',
    });
    expect(sessions.find((session) => session.id === approvalSessionId)).toMatchObject({
      status: 'running',
      command: 'claude code',
      attention: 'needs-approval',
    });
    // terminalMuxMetadata now returns extended fields; use toMatchObject for partial check
    expect(metadata).toMatchObject({
      worktree: 'wt_1',
      branch: 'doorway/task-review/backend',
      cwd: '/repo/.doorway-workspaces/task-review/backend',
      latestCommand: 'pnpm test',
      ports: 'No ports reported',
    });
  });

  it('renders changed files from the selected real diff only', async () => {
    const { DiffPreviewCapsule, diffPreviewFiles, reversePatchPreview, rollbackPreviewFiles } =
      await import('./App');
    const diff = {
      files: [
        {
          path: 'apps/desktop/src/renderer/App.tsx',
          status: 'modified',
          additions: 12,
          deletions: 4,
          patch: '@@ -1 +1 @@',
        },
        {
          path: 'packages/core/src/thread-service.ts',
          status: 'created',
          additions: 20,
          deletions: 0,
        },
      ],
      totalAdditions: 32,
      totalDeletions: 4,
      evidence: [],
    } satisfies DiffProjection;

    expect(diffPreviewFiles(diff, 1).map((file) => file.path)).toEqual([
      'apps/desktop/src/renderer/App.tsx',
    ]);
    expect(rollbackPreviewFiles(diff, 1).map((file) => file.path)).toEqual([
      'apps/desktop/src/renderer/App.tsx',
    ]);
    expect(reversePatchPreview('--- a/app.ts\n+++ b/app.ts\n-old\n+new')).toBe(
      '--- b/app.ts\n+++ a/app.ts\n+old\n-new'
    );

    const nullHtml = renderToStaticMarkup(
      React.createElement(DiffPreviewCapsule, { activeDiff: null })
    );
    const emptyHtml = renderToStaticMarkup(
      React.createElement(DiffPreviewCapsule, {
        activeDiff: { ...diff, files: [] },
      })
    );
    const html = renderToStaticMarkup(
      React.createElement(DiffPreviewCapsule, { activeDiff: diff })
    );

    expect(nullHtml).toBe('');
    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Changed files preview"');
    expect(html).toContain('apps/desktop/src/renderer/App.tsx');
    expect(html).toContain('packages/core/src/thread-service.ts');
    expect(html).toContain('+32 -4');
    expect(html).toContain('data-status="created"');
  });

  it('renders latest inline handoff capsule from persisted handoff state only', async () => {
    const { InlineHandoffCapsule, latestInlineHandoffCapsules } = await import('./App');
    const capsules = [
      {
        id: 'hnd_old',
        threadId: 'thread_1',
        sourceRunId: 'run_1',
        summary: 'Older handoff',
        latestIntent: 'Old intent',
        runSummary: 'Old run',
        changedFiles: [],
        diffSummary: 'Old diff',
        openQuestions: [],
        nextPrompt: 'Continue old work',
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'hnd_new',
        threadId: 'thread_1',
        sourceRunId: 'run_2',
        targetProvider: 'codex',
        summary: 'Newest handoff',
        latestIntent: 'Continue review',
        runSummary: 'New run',
        worktreePath: '/repo/.doorway-workspaces/task',
        branch: 'doorway/task/backend',
        changedFiles: ['apps/desktop/src/renderer/App.tsx', 'packages/core/src/thread.ts'],
        diffSummary: 'New diff',
        testStatus: 'pass',
        openQuestions: ['Should review merge policy?'],
        nextPrompt: 'Pick up from the review capsule',
        createdAt: new Date('2026-05-18T02:00:00.000Z'),
        evidence: [],
      },
    ] as unknown as HandoffCapsuleProjection[];

    expect(latestInlineHandoffCapsules(capsules).map((capsule) => capsule.id)).toEqual(['hnd_new']);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(InlineHandoffCapsule, { handoffCapsules: [] })
    );
    const html = renderToStaticMarkup(
      React.createElement(InlineHandoffCapsule, { handoffCapsules: capsules })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Latest handoff capsule"');
    expect(html).toContain('Newest handoff');
    expect(html).toContain('Provider codex');
    expect(html).toContain('apps/desktop/src/renderer/App.tsx');
    expect(html).toContain('Should review merge policy?');
    expect(html).toContain('Pick up from the review capsule');
    expect(html).not.toContain('Older handoff');
  });

  it('renders the newest persisted task graph only', async () => {
    const { TaskGraphCapsule, latestTaskGraphs } = await import('./App');
    const updateGraphNodeStatus = vi.fn();
    const graphs = [
      {
        id: 'task_old' as TaskId,
        projectId: 'proj_1' as ProjectId,
        goal: 'Older graph',
        mode: 'sequential',
        status: 'planned',
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
        nodes: [],
        edges: [],
        evidence: [],
      },
      {
        id: 'task_new' as TaskId,
        projectId: 'proj_1' as ProjectId,
        goal: 'Ship task graph UI',
        mode: 'parallel',
        status: 'planned',
        createdAt: new Date('2026-05-18T02:00:00.000Z'),
        nodes: [
          {
            id: 'node_1',
            taskId: 'task_new' as TaskId,
            role: 'implementer',
            status: 'pending',
            agentTarget: 'claude',
            worktreePolicy: 'isolated',
            acceptanceCriteria: 'Code implemented and verified by agent.',
          },
          {
            id: 'node_2',
            taskId: 'task_new' as TaskId,
            role: 'reviewer',
            status: 'pending',
            agentTarget: 'claude',
            worktreePolicy: 'isolated',
            acceptanceCriteria: 'Code reviewed for correctness.',
          },
        ],
        edges: [
          {
            id: 'edge_1',
            taskId: 'task_new' as TaskId,
            fromNodeId: 'node_1',
            toNodeId: 'node_2',
          },
        ],
        evidence: [],
      },
    ] satisfies TaskGraphProjection[];

    expect(latestTaskGraphs(graphs).map((graph) => graph.id)).toEqual(['task_new']);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(TaskGraphCapsule, { taskGraphs: [] })
    );
    const html = renderToStaticMarkup(
      React.createElement(TaskGraphCapsule, { taskGraphs: graphs })
    );
    const actionableHtml = renderToStaticMarkup(
      React.createElement(TaskGraphCapsule, { taskGraphs: graphs, updateGraphNodeStatus })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Persisted task graph"');
    expect(html).toContain('Ship task graph UI');
    expect(html).toContain('2 nodes');
    expect(html).toContain('1 edges');
    expect(html).toContain('implementer');
    expect(html).not.toContain('Older graph');
    expect(actionableHtml).toContain('Mark running');
    expect(actionableHtml).toContain('Mark done');
    expect(actionableHtml).toContain('Mark failed');
  });

  it('renders newest approval history from persisted permission receipts only', async () => {
    const { ApprovalHistoryCapsule, latestApprovalReceipts } = await import('./App');
    const receipts = [
      {
        id: 'perm_old',
        taskId: 'task-review' as TaskId,
        command: 'delete src/index.ts',
        riskCategory: 'destructive_command',
        decision: 'denied',
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      },
      {
        id: 'perm_new',
        taskId: 'task-review' as TaskId,
        command: 'merge doorway/task-review/backend',
        riskCategory: 'merge_approval',
        decision: 'approved',
        userNotes: 'Reviewed clean diff',
        timestamp: new Date('2026-05-18T02:00:00.000Z'),
        evidence: [],
      },
    ] satisfies PermissionReceiptProjection[];

    expect(latestApprovalReceipts(receipts).map((receipt) => receipt.id)).toEqual([
      'perm_new',
      'perm_old',
    ]);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(ApprovalHistoryCapsule, { permissionReceipts: [] })
    );
    const html = renderToStaticMarkup(
      React.createElement(ApprovalHistoryCapsule, { permissionReceipts: receipts })
    );

    expect(emptyHtml).toBe('');
    expect(html).toContain('aria-label="Approval history"');
    expect(html.indexOf('merge_approval')).toBeLessThan(html.indexOf('destructive_command'));
    expect(html).toContain('Reviewed clean diff');
  });

  it('projects unresolved permission events into a live decision request', async () => {
    const { LivePermissionModal, livePermissionRequest } = await import('./App');
    const approvalRequested = {
      id: 'evt_approval_requested',
      threadId: 'thread_1',
      type: 'approval.requested',
      payload: {
        runId: 'run_review',
        prompt: 'Approve package install?',
        requiresUserInput: true,
      },
      timestamp: new Date('2026-05-18T02:00:00.000Z'),
      sequence: 1,
    } as unknown as DoorwayEvent;
    const approvalGranted = {
      id: 'evt_approval_granted',
      threadId: 'thread_1',
      type: 'approval.granted',
      payload: {
        runId: 'run_review',
        receiptId: 'perm_approved',
        taskId: 'task-review',
        command: 'Approve package install?',
        riskCategory: 'approval_request',
        userResponse: 'Approved evt_approval_requested',
      },
      timestamp: new Date('2026-05-18T02:01:00.000Z'),
      sequence: 2,
    } as unknown as DoorwayEvent;
    const terminalAttention = {
      id: 'evt_terminal_attention',
      threadId: 'thread_1',
      type: 'agent.attention',
      payload: {
        runId: 'run_review',
        sessionId: 'term_review',
        state: 'needs_approval',
        source: 'terminal_output',
        reason: 'Terminal output requested permission or approval.',
        outputPreview: 'Permission required: allow command? [y/N]',
      },
      timestamp: new Date('2026-05-18T02:02:00.000Z'),
      sequence: 3,
    } as unknown as DoorwayEvent;

    expect(livePermissionRequest([approvalRequested])).toMatchObject({
      sourceEventId: 'evt_approval_requested',
      runId: 'run_review',
      command: 'Approve package install?',
      riskCategory: 'approval_request',
      reason: 'Worker is waiting for user input.',
      evidence: 'Approve package install?',
    });
    expect(livePermissionRequest([approvalRequested, approvalGranted])).toBeUndefined();

    const terminalRequest = livePermissionRequest([terminalAttention]);
    if (!terminalRequest) {
      throw new Error('Expected terminal attention to create a live permission request');
    }
    expect(terminalRequest).toMatchObject({
      sourceEventId: 'evt_terminal_attention',
      runId: 'run_review',
      sessionId: 'term_review',
      command: 'Permission required: allow command? [y/N]',
      riskCategory: 'live_terminal_permission',
    });

    const html = renderToStaticMarkup(
      React.createElement(LivePermissionModal, {
        request: terminalRequest,
        loading: false,
        onDecide: vi.fn(),
      })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Live permission request"');
    expect(html).toContain('Worker needs approval');
    expect(html).toContain('live_terminal_permission');
    expect(html).toContain('Permission required: allow command? [y/N]');
    expect(html).toContain('term_review');
    expect(html).toContain('Deny');
    expect(html).toContain('Allow');
  });

  it('selects newest activity preview events explicitly', async () => {
    const { latestThreadEventsBySequence, latestTimestampedEvents } = await import('./App');
    const liveEvents = [
      {
        runId: 'run_older',
        type: 'agent.output',
        data: 'Older live output',
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
      },
      {
        runId: 'run_newest',
        type: 'agent.output',
        data: 'Newest live output',
        timestamp: new Date('2026-05-18T03:00:00.000Z'),
      },
      {
        runId: 'run_middle',
        type: 'agent.output',
        data: 'Middle live output',
        timestamp: new Date('2026-05-18T02:00:00.000Z'),
      },
    ];
    const threadEvents = [
      {
        id: 'evt_middle',
        threadId: 'thread_1',
        type: 'agent.exited',
        payload: {},
        timestamp: new Date('2026-05-18T02:00:00.000Z'),
        sequence: 2,
      },
      {
        id: 'evt_newest',
        threadId: 'thread_1',
        type: 'agent.started',
        payload: {},
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
        sequence: 3,
      },
      {
        id: 'evt_older',
        threadId: 'thread_1',
        type: 'message.created',
        payload: {},
        timestamp: new Date('2026-05-18T03:00:00.000Z'),
        sequence: 1,
      },
    ] as unknown as DoorwayEvent[];

    expect(latestTimestampedEvents(liveEvents, 2).map((event) => event.runId)).toEqual([
      'run_newest',
      'run_middle',
    ]);
    expect(latestThreadEventsBySequence(threadEvents, 2).map((event) => event.id)).toEqual([
      'evt_newest',
      'evt_middle',
    ]);
  });

  it('renders session activity rows in newest-first order', async () => {
    const { SessionActivityCapsule } = await import('./App');
    const emptyHtml = renderToStaticMarkup(
      React.createElement(SessionActivityCapsule, {
        agentEvents: [],
        threadEvents: [],
      })
    );
    const liveHtml = renderToStaticMarkup(
      React.createElement(SessionActivityCapsule, {
        agentEvents: [
          {
            runId: 'run_older',
            type: 'agent.output',
            data: 'Older live output',
            timestamp: new Date('2026-05-18T01:00:00.000Z'),
          },
          {
            runId: 'run_newest',
            type: 'agent.output',
            data: 'Newest live output',
            timestamp: new Date('2026-05-18T03:00:00.000Z'),
          },
          {
            runId: 'run_middle',
            type: 'agent.output',
            data: 'Middle live output',
            timestamp: new Date('2026-05-18T02:00:00.000Z'),
          },
        ],
        threadEvents: [],
      })
    );
    const recordedHtml = renderToStaticMarkup(
      React.createElement(SessionActivityCapsule, {
        agentEvents: [],
        threadEvents: [
          {
            id: 'evt_middle',
            threadId: 'thread_1',
            type: 'agent.exited',
            payload: {},
            timestamp: new Date('2026-05-18T02:00:00.000Z'),
            sequence: 2,
          },
          {
            id: 'evt_newest',
            threadId: 'thread_1',
            type: 'agent_run.created',
            payload: {
              runId: 'run_newest',
              taskId: 'task_newest',
              adapterId: 'claude',
              worktreeId: 'wt_newest',
              launchOptions: {
                mode: '/debug',
                permissionProfile: 'worktree-only',
                worktreeStrategy: 'fork-current',
                ptyMode: 'external-pty',
              },
            },
            timestamp: new Date('2026-05-18T01:00:00.000Z'),
            sequence: 3,
          },
          {
            id: 'evt_older',
            threadId: 'thread_1',
            type: 'message.created',
            payload: {},
            timestamp: new Date('2026-05-18T03:00:00.000Z'),
            sequence: 1,
          },
        ] as unknown as DoorwayEvent[],
      })
    );

    expect(emptyHtml).toBe('');
    expect(liveHtml).toContain('message-capsule--session');
    expect(liveHtml).toContain('orchestration-status');
    expect(liveHtml.indexOf('Newest live output')).toBeLessThan(
      liveHtml.indexOf('Middle live output')
    );
    expect(liveHtml.indexOf('Middle live output')).toBeLessThan(
      liveHtml.indexOf('Older live output')
    );
    expect(recordedHtml).toContain('aria-label="Launch options"');
    expect(recordedHtml).toContain('/debug');
    expect(recordedHtml).toContain('Worktree only');
    expect(recordedHtml).toContain('Fork current');
    expect(recordedHtml).toContain('External PTY');
    expect(recordedHtml).toContain('claude');
    expect(recordedHtml).toContain('task_newest');
    expect(recordedHtml).toContain('run_newest');
    expect(recordedHtml).toContain('wt_newest');
    expect(recordedHtml).toContain('1 evidence');
    expect(recordedHtml).not.toContain('sequence 3');
  });

  it('extracts latest structured launch options from recorded events', async () => {
    const { latestLaunchOptionsFromEvents, launchOptionLabels } = await import('./App');
    const options = latestLaunchOptionsFromEvents([
      {
        id: 'evt_old',
        threadId: 'thread_1',
        type: 'agent_run.created',
        payload: {
          launchOptions: {
            mode: '/plan',
            permissionProfile: 'ask-writes',
            worktreeStrategy: 'auto-worktree',
            ptyMode: 'doorway-pty',
          },
        },
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
        sequence: 1,
      },
      {
        id: 'evt_new',
        threadId: 'thread_1',
        type: 'agent_run.created',
        payload: {
          launchOptions: {
            mode: '/review',
            permissionProfile: 'review-first',
            worktreeStrategy: 'selected-worktree',
            ptyMode: 'protocol',
            modelId: 'gpt-5.2',
          },
        },
        timestamp: new Date('2026-05-18T02:00:00.000Z'),
        sequence: 2,
      },
    ] as unknown as DoorwayEvent[]);

    expect(options?.mode).toBe('/review');
    expect(options ? launchOptionLabels(options) : []).toEqual([
      '/review',
      'Review first',
      'Use selected',
      'Protocol',
      'Model gpt-5.2',
    ]);
  });

  it('builds newest-first orchestration lanes from run and live events', async () => {
    const { orchestrationLanesFromEvents } = await import('./App');

    const lanes = orchestrationLanesFromEvents({
      threadEvents: [
        {
          id: 'evt_old',
          threadId: 'thread_1',
          type: 'agent_run.created',
          payload: {
            runId: 'run_old',
            taskId: 'task_old',
            adapterId: 'codex',
          },
          timestamp: new Date('2026-05-18T01:00:00.000Z'),
          sequence: 1,
        },
        {
          id: 'evt_new',
          threadId: 'thread_1',
          type: 'agent_run.created',
          payload: {
            runId: 'run_new',
            taskId: 'task_new',
            adapterId: 'claude',
            worktreeId: 'wt_new',
          },
          timestamp: new Date('2026-05-18T02:00:00.000Z'),
          sequence: 2,
        },
      ] as unknown as DoorwayEvent[],
      agentEvents: [
        {
          runId: 'run_new',
          type: 'agent.output',
          data: 'Working',
          timestamp: new Date('2026-05-18T03:00:00.000Z'),
        },
      ],
    });

    expect(lanes[0]).toEqual({
      runId: 'run_new',
      provider: 'claude',
      taskId: 'task_new',
      worktreeId: 'wt_new',
      status: 'agent.output',
      latestOutput: 'Working',
      evidenceCount: 2,
    });
    expect(lanes[1]?.provider).toBe('codex');
  });

  it('assigns conversation capsule alignment from persisted message role', async () => {
    const { messageCapsuleClassName } = await import('./App');

    expect(messageCapsuleClassName('user')).toBe('message-capsule message-capsule--user');
    expect(messageCapsuleClassName('assistant')).toBe('message-capsule message-capsule--doorway');
    expect(messageCapsuleClassName('agent')).toBe('message-capsule message-capsule--doorway');
  });

  it('extracts the copyable handoff next prompt', async () => {
    const { handoffNextPromptText } = await import('./App');

    expect(
      handoffNextPromptText({
        id: 'hnd_1',
        threadId: 'thread_1',
        sourceRunId: 'run_1',
        summary: 'Run summary',
        latestIntent: 'Continue',
        runSummary: 'Run summary',
        changedFiles: [],
        diffSummary: '',
        openQuestions: [],
        nextPrompt: '  Continue in the selected worktree\n',
        createdAt: new Date('2026-05-18T01:00:00.000Z'),
        evidence: [],
      } as unknown as HandoffCapsuleProjection)
    ).toBe('Continue in the selected worktree');
  });

  it('formats persisted handoff usage events for Evidence', async () => {
    const {
      handoffCopiedInlineLabel,
      handoffUsageBreakdownLabels,
      handoffUsageCountLabel,
      filterHandoffCapsulesByUsage,
      sortHandoffCapsulesByEvidenceTime,
      sortHandoffUsedEventsByEvidenceTime,
      latestHandoffActivityLabel,
      latestHandoffOpenTargetForCapsule,
      handoffUsedEventLabel,
      handoffUsedEvents,
      latestHandoffUsedEventForCapsule,
    } = await import('./App');
    const copied = {
      id: 'evt_used',
      threadId: 'thread_1',
      type: 'handoff.used',
      payload: {
        capsuleId: 'hnd_1',
        threadId: 'thread_1',
        action: 'copy_next_prompt',
      },
      timestamp: new Date('2026-05-18T01:00:00.000Z'),
      sequence: 2,
    } as unknown as DoorwayEvent;
    const laterCopied = {
      ...copied,
      id: 'evt_later_used',
      timestamp: new Date('2026-05-18T02:00:00.000Z'),
      sequence: 3,
    } as unknown as DoorwayEvent;
    const laterOpened = {
      ...copied,
      id: 'evt_later_opened',
      payload: {
        capsuleId: 'hnd_1',
        threadId: 'thread_1',
        action: 'open_worktree',
        worktreePath: '/repo/.doorway-workspaces/task',
      },
      timestamp: new Date('2026-05-18T03:00:00.000Z'),
      sequence: 4,
    } as unknown as DoorwayEvent;
    const laterOpenedFile = {
      ...copied,
      id: 'evt_later_opened_file',
      payload: {
        capsuleId: 'hnd_1',
        threadId: 'thread_1',
        action: 'open_changed_file',
        worktreePath: '/repo/.doorway-workspaces/task',
        filePath: 'apps/desktop/src/renderer/App.tsx',
      },
      timestamp: new Date('2026-05-18T04:00:00.000Z'),
      sequence: 5,
    } as unknown as DoorwayEvent;
    const created = {
      ...copied,
      id: 'evt_created',
      type: 'handoff.created',
      sequence: 1,
    } as unknown as DoorwayEvent;
    const capsule = {
      id: 'hnd_1',
      threadId: 'thread_1',
      sourceRunId: 'run_1',
      summary: 'Run summary',
      latestIntent: 'Continue',
      runSummary: 'Run summary',
      changedFiles: [],
      diffSummary: '',
      openQuestions: [],
      nextPrompt: 'Continue',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
      evidence: [],
    } as unknown as HandoffCapsuleProjection;
    const unusedCapsule = {
      ...capsule,
      id: 'hnd_unused',
    } as unknown as HandoffCapsuleProjection;

    expect(handoffUsedEvents([created, copied])).toEqual([copied]);
    expect(
      sortHandoffUsedEventsByEvidenceTime([copied, laterCopied, laterOpened]).map(
        (event) => event.id
      )
    ).toEqual(['evt_later_opened', 'evt_later_used', 'evt_used']);
    expect(
      filterHandoffCapsulesByUsage(
        [capsule, unusedCapsule],
        [created, copied, laterCopied, laterOpened, laterOpenedFile],
        'used'
      )
    ).toEqual([capsule]);
    expect(
      filterHandoffCapsulesByUsage(
        [capsule, unusedCapsule],
        [created, copied, laterCopied, laterOpened, laterOpenedFile],
        'unused'
      )
    ).toEqual([unusedCapsule]);
    expect(
      sortHandoffCapsulesByEvidenceTime(
        [capsule, unusedCapsule],
        [created, copied, laterCopied, laterOpened, laterOpenedFile]
      ).map((item) => item.id)
    ).toEqual(['hnd_1', 'hnd_unused']);
    expect(handoffUsedEventLabel(copied)).toBe('hnd_1 copied at 2026-05-18T01:00:00.000Z');
    expect(handoffUsedEventLabel(laterOpened)).toBe(
      'hnd_1 opened /repo/.doorway-workspaces/task at 2026-05-18T03:00:00.000Z'
    );
    expect(handoffUsedEventLabel(laterOpenedFile)).toBe(
      'hnd_1 opened file apps/desktop/src/renderer/App.tsx at 2026-05-18T04:00:00.000Z'
    );
    expect(
      latestHandoffUsedEventForCapsule(
        [created, copied, laterCopied, laterOpened, laterOpenedFile],
        capsule
      )
    ).toEqual(laterOpenedFile);
    expect(latestHandoffActivityLabel(laterOpenedFile)).toBe(
      'Latest activity: Opened file apps/desktop/src/renderer/App.tsx'
    );
    expect(
      handoffUsageCountLabel([created, copied, laterCopied, laterOpened, laterOpenedFile], capsule)
    ).toBe('4 uses');
    expect(
      handoffUsageBreakdownLabels(
        [created, copied, laterCopied, laterOpened, laterOpenedFile],
        capsule
      )
    ).toEqual(['2 prompt copies', '1 worktree open', '1 file open']);
    expect(
      latestHandoffOpenTargetForCapsule(
        [created, copied, laterCopied, laterOpened, laterOpenedFile],
        capsule
      )
    ).toEqual({
      label: 'Reopen latest file',
      path: '/repo/.doorway-workspaces/task/apps/desktop/src/renderer/App.tsx',
      target: 'apps/desktop/src/renderer/App.tsx',
      worktreePath: '/repo/.doorway-workspaces/task',
      filePath: 'apps/desktop/src/renderer/App.tsx',
    });
    expect(handoffCopiedInlineLabel(laterCopied)).toBe('Copied 2026-05-18T02:00:00.000Z');
    expect(handoffCopiedInlineLabel(laterOpened)).toBe('Opened 2026-05-18T03:00:00.000Z');
    expect(handoffCopiedInlineLabel(laterOpenedFile)).toBe('Opened file 2026-05-18T04:00:00.000Z');
  });

  it('renders Evidence cards in newest-first recorded order', async () => {
    const {
      agentLifecycleEventLabel,
      agentLifecycleEvents,
      agentMemorySourceLabel,
      approvalTimelineEventLabel,
      approvalTimelineEvents,
      browserActionEventLabel,
      browserActionEvents,
      browserBundleExportEventLabel,
      browserBundleExportEvents,
      diffUpdatedEventLabel,
      diffUpdatedEvents,
      handoffCreationEventLabel,
      handoffCreationEvents,
      messageAppendedEventLabel,
      messageAppendedEvents,
      mergeLifecycleEventLabel,
      mergeLifecycleEvents,
      sortHandoffCapsulesByEvidenceTime,
      sortHandoffUsedEventsByEvidenceTime,
      sortMergeAssessmentsByEvidenceTime,
      sortPermissionReceiptsByEvidenceTime,
      sortProofsByEvidenceTime,
      taskGraphUpdateEventLabel,
      taskGraphUpdateEvents,
      terminalEvidenceEventLabel,
      terminalEvidenceEvents,
      terminalEvidencePreview,
      testLifecycleEventLabel,
      testLifecycleEvents,
      threadLifecycleEventLabel,
      threadLifecycleEvents,
      threadReplayExportEventLabel,
      threadReplayExportEvents,
      threadReplayVerificationFailureEventLabel,
      threadReplayVerificationFailureEvents,
      threadReplayVerificationSuccessEventLabel,
      threadReplayVerificationSuccessEvents,
      worktreeSafetyEventLabel,
      worktreeSafetyEvents,
    } = await import('./App');
    const { EvidencePanel } = await import('./EvidencePanel');
    const { projectInstructionPreflightLabel } = await import('./shared-ui');
    const threadCreated = {
      id: 'evt_thread_created',
      threadId: 'thread_1',
      type: 'thread.created',
      payload: {
        threadId: 'thread_1',
        projectId: 'project_doorway',
        title: 'Review merge path',
        goal: 'Review the merge path and capture browser proof.',
      },
      timestamp: new Date('2026-05-18T02:00:00.000Z'),
      sequence: 0,
    } as unknown as DoorwayEvent;
    const olderCapsule = {
      id: 'hnd_old',
      threadId: 'thread_1',
      sourceRunId: 'run_1',
      summary: 'Older handoff summary',
      latestIntent: 'Continue old work',
      runSummary: 'Old run',
      changedFiles: [],
      diffSummary: '',
      openQuestions: [],
      nextPrompt: 'Continue old work',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
      evidence: [],
    } as unknown as HandoffCapsuleProjection;
    const newerCapsule = {
      ...olderCapsule,
      id: 'hnd_new',
      summary: 'Newest handoff summary',
      latestIntent: 'Continue new work',
      runSummary: 'New run',
      nextPrompt: 'Continue new work',
      createdAt: new Date('2026-05-18T02:00:00.000Z'),
    } as unknown as HandoffCapsuleProjection;
    const olderUsage = {
      id: 'evt_old',
      threadId: 'thread_1',
      type: 'handoff.used',
      payload: {
        capsuleId: 'hnd_old',
        threadId: 'thread_1',
        action: 'copy_next_prompt',
      },
      timestamp: new Date('2026-05-18T01:30:00.000Z'),
      sequence: 1,
    } as unknown as DoorwayEvent;
    const newerUsage = {
      ...olderUsage,
      id: 'evt_new',
      payload: {
        capsuleId: 'hnd_new',
        threadId: 'thread_1',
        action: 'copy_next_prompt',
      },
      timestamp: new Date('2026-05-18T02:30:00.000Z'),
      sequence: 2,
    } as unknown as DoorwayEvent;
    const handoffCreated = {
      id: 'evt_handoff_created',
      threadId: 'thread_1',
      type: 'handoff.created',
      payload: {
        capsuleId: 'hnd_new',
        threadId: 'thread_1',
        sourceRunId: 'run_review',
        targetProvider: 'codex',
      },
      timestamp: new Date('2026-05-18T02:44:00.000Z'),
      sequence: 3,
    } as unknown as DoorwayEvent;
    const messageAppended = {
      id: 'evt_message_appended',
      threadId: 'thread_1',
      type: 'message.appended',
      payload: {
        messageId: 'msg_1',
        threadId: 'thread_1',
        role: 'user',
        content: 'Review the merge path and capture browser proof.',
        provider: 'codex',
      },
      timestamp: new Date('2026-05-18T02:44:30.000Z'),
      sequence: 4,
    } as unknown as DoorwayEvent;
    const diffUpdated = {
      id: 'evt_diff',
      threadId: 'thread_1',
      type: 'diff.updated',
      payload: {
        path: '/repo/.doorway-workspaces/task-review',
        filesChanged: 2,
        totalAdditions: 12,
        totalDeletions: 4,
      },
      timestamp: new Date('2026-05-18T02:45:00.000Z'),
      sequence: 5,
    } as unknown as DoorwayEvent;
    const mergeStarted = {
      id: 'evt_merge_started',
      threadId: 'thread_1',
      type: 'merge.started',
      payload: {
        taskId: 'task-review',
        integrationBranch: 'doorway/integration/task-review-abc',
        branches: ['doorway/task-review/backend'],
      },
      timestamp: new Date('2026-05-18T02:46:00.000Z'),
      sequence: 6,
    } as unknown as DoorwayEvent;
    const mergeCompleted = {
      id: 'evt_merge_completed',
      threadId: 'thread_1',
      type: 'merge.completed',
      payload: {
        taskId: 'task-review',
        integrationBranch: 'doorway/integration/task-review-abc',
        mergedBranches: ['doorway/task-review/backend'],
        conflicts: [],
      },
      timestamp: new Date('2026-05-18T02:47:00.000Z'),
      sequence: 7,
    } as unknown as DoorwayEvent;
    const mergeEvaluated = {
      id: 'evt_merge_evaluated',
      threadId: 'thread_1',
      type: 'merge.evaluated',
      payload: {
        assessmentId: 'merge_new',
        taskId: 'task-review',
        score: 'ready',
        reason: 'Latest assessment',
      },
      timestamp: new Date('2026-05-18T02:47:30.000Z'),
      sequence: 8,
    } as unknown as DoorwayEvent;
    const mergeConflict = {
      id: 'evt_merge_conflict',
      threadId: 'thread_1',
      type: 'merge.conflict',
      payload: {
        taskId: 'task-review',
        file: 'apps/desktop/src/renderer/App.tsx',
        conflictDetails: 'conflict markers',
      },
      timestamp: new Date('2026-05-18T02:48:00.000Z'),
      sequence: 9,
    } as unknown as DoorwayEvent;
    const terminalCreated = {
      id: 'evt_terminal_created',
      threadId: 'thread_1',
      type: 'terminal.created',
      payload: {
        sessionId: 'term_1',
        agentRunId: 'run_review',
        runtime: 'pty',
        command: 'pnpm test',
      },
      timestamp: new Date('2026-05-18T02:48:30.000Z'),
      sequence: 10,
    } as unknown as DoorwayEvent;
    const terminalStarted = {
      id: 'evt_terminal_started',
      threadId: 'thread_1',
      type: 'terminal.started',
      payload: {
        sessionId: 'term_1',
        pid: 4242,
      },
      timestamp: new Date('2026-05-18T02:49:00.000Z'),
      sequence: 11,
    } as unknown as DoorwayEvent;
    const terminalInput = {
      id: 'evt_terminal_input',
      threadId: 'thread_1',
      type: 'terminal.input',
      payload: {
        sessionId: 'term_1',
        sequence: 0,
        text: 'y\n',
        source: 'permission_decision',
      },
      timestamp: new Date('2026-05-18T02:49:30.000Z'),
      sequence: 12,
    } as unknown as DoorwayEvent;
    const terminalOutput = {
      id: 'evt_terminal_output',
      threadId: 'thread_1',
      type: 'terminal.output',
      payload: {
        sessionId: 'term_1',
        sequence: 1,
        text: 'pnpm test passed',
        isStdout: true,
        isStderr: false,
      },
      timestamp: new Date('2026-05-18T02:50:00.000Z'),
      sequence: 13,
    } as unknown as DoorwayEvent;
    const terminalStopped = {
      id: 'evt_terminal_stopped',
      threadId: 'thread_1',
      type: 'terminal.stopped',
      payload: {
        sessionId: 'term_1',
        exitCode: 0,
      },
      timestamp: new Date('2026-05-18T02:51:00.000Z'),
      sequence: 14,
    } as unknown as DoorwayEvent;
    const terminalAttention = {
      id: 'evt_terminal_attention',
      threadId: 'thread_1',
      type: 'agent.attention',
      payload: {
        sessionId: 'term_1',
        state: 'needs_approval',
        source: 'terminal_output',
        reason: 'Terminal output requested permission or approval.',
        outputPreview: 'Permission required: allow command? [y/N]',
      },
      timestamp: new Date('2026-05-18T02:51:10.000Z'),
      sequence: 14,
    } as unknown as DoorwayEvent;
    const completionConfidence = {
      id: 'evt_completion_confidence',
      threadId: 'thread_1',
      type: 'completion.confidence_updated',
      payload: {
        sessionId: 'term_1',
        score: 0.5,
        recommendedState: 'waiting_for_user',
        signals: ['permission_prompt'],
      },
      timestamp: new Date('2026-05-18T02:51:20.000Z'),
      sequence: 15,
    } as unknown as DoorwayEvent;
    const testStarted = {
      id: 'evt_test_started',
      threadId: 'thread_1',
      type: 'test.started',
      payload: {
        proofId: 'proof_new',
        terminalSessionId: 'term_1',
        command: 'pnpm test',
      },
      timestamp: new Date('2026-05-18T02:52:00.000Z'),
      sequence: 14,
    } as unknown as DoorwayEvent;
    const testFinished = {
      id: 'evt_test_finished',
      threadId: 'thread_1',
      type: 'test.finished',
      payload: {
        proofId: 'proof_new',
        terminalSessionId: 'term_1',
        status: 'pass',
        exitCode: 0,
        summary: 'Tests passed',
      },
      timestamp: new Date('2026-05-18T02:53:00.000Z'),
      sequence: 15,
    } as unknown as DoorwayEvent;
    const approvalRequested = {
      id: 'evt_approval_requested',
      threadId: 'thread_1',
      type: 'approval.requested',
      payload: {
        runId: 'run_review',
        prompt: 'Approve merge command',
        requiresUserInput: true,
      },
      timestamp: new Date('2026-05-18T02:54:00.000Z'),
      sequence: 16,
    } as unknown as DoorwayEvent;
    const approvalGranted = {
      id: 'evt_approval_granted',
      threadId: 'thread_1',
      type: 'approval.granted',
      payload: {
        receiptId: 'perm_new',
        taskId: 'task-review',
        command: 'merge doorway/task-review/backend',
        riskCategory: 'merge_approval',
        userResponse: 'Reviewed clean diff',
      },
      timestamp: new Date('2026-05-18T02:55:00.000Z'),
      sequence: 17,
    } as unknown as DoorwayEvent;
    const approvalDenied = {
      id: 'evt_approval_denied',
      threadId: 'thread_1',
      type: 'approval.denied',
      payload: {
        receiptId: 'perm_denied',
        taskId: 'task-review',
        command: 'agent:launch codex',
        riskCategory: 'tool_disabled',
        reason: 'Blocked by thread tool policy: tool.codex-cli',
      },
      timestamp: new Date('2026-05-18T02:56:00.000Z'),
      sequence: 18,
    } as unknown as DoorwayEvent;
    const agentRunCreated = {
      id: 'evt_agent_created',
      threadId: 'thread_1',
      type: 'agent_run.created',
      payload: {
        runId: 'run_review',
        threadId: 'thread_1',
        taskId: 'task-review',
        role: 'reviewer',
        adapterId: 'codex',
        worktreeId: 'wt_review',
        memorySources: [
          { sourceFile: 'AGENTS.md', category: 'instruction', contentLength: 18 },
          { sourceFile: 'DOORWAY.md', category: 'instruction', contentLength: 28 },
        ],
      },
      timestamp: new Date('2026-05-18T02:57:00.000Z'),
      sequence: 19,
    } as unknown as DoorwayEvent;
    const agentRunStatusChanged = {
      id: 'evt_agent_status',
      threadId: 'thread_1',
      type: 'agent_run.status_changed',
      payload: {
        runId: 'run_review',
        previousStatus: 'running',
        newStatus: 'completed',
        reason: 'terminal exited',
      },
      timestamp: new Date('2026-05-18T02:58:00.000Z'),
      sequence: 20,
    } as unknown as DoorwayEvent;
    const agentRunCompleted = {
      id: 'evt_agent_completed',
      threadId: 'thread_1',
      type: 'agent_run.completed',
      payload: {
        runId: 'run_review',
        exitCode: 0,
      },
      timestamp: new Date('2026-05-18T02:59:00.000Z'),
      sequence: 21,
    } as unknown as DoorwayEvent;
    const worktreeCreated = {
      id: 'evt_worktree_created',
      threadId: 'thread_1',
      type: 'worktree.created',
      payload: {
        worktreeId: 'wt_review',
        projectId: 'project_doorway',
        taskId: 'task-review',
        path: '/repo/.doorway-workspaces/task-review',
        branch: 'doorway/task-review/backend',
      },
      timestamp: new Date('2026-05-18T03:00:00.000Z'),
      sequence: 22,
    } as unknown as DoorwayEvent;
    const fileChangeDetected = {
      id: 'evt_file_change',
      threadId: 'thread_1',
      type: 'file_change.detected',
      payload: {
        fileChangeId: 'fc_1',
        worktreeId: 'wt_review',
        agentRunId: 'run_review',
        path: 'apps/desktop/src/renderer/App.tsx',
        changeType: 'modified',
      },
      timestamp: new Date('2026-05-18T03:01:00.000Z'),
      sequence: 23,
    } as unknown as DoorwayEvent;
    const worktreeArchived = {
      id: 'evt_worktree_archived',
      threadId: 'thread_1',
      type: 'worktree.archived',
      payload: {
        worktreeId: 'wt_review',
        path: '/repo/.doorway-workspaces/task-review',
        branch: 'doorway/task-review/backend',
        branchDeleted: false,
        reason: 'removed worktree; kept branch doorway/task-review/backend',
      },
      timestamp: new Date('2026-05-18T03:02:00.000Z'),
      sequence: 24,
    } as unknown as DoorwayEvent;
    const rollbackPatchExported = {
      id: 'evt_rollback_patch',
      threadId: 'thread_1',
      type: 'worktree.rollback_patch_exported',
      payload: {
        worktreeId: 'wt_review',
        path: '/repo/evidence/thread_1/rollback/rollback-abcd.patch',
        worktreePath: '/repo/.doorway-workspaces/task-review',
        branch: 'doorway/task-review/backend',
        patchBytes: 2048,
        createdAt: '2026-05-18T03:03:00.000Z',
      },
      timestamp: new Date('2026-05-18T03:03:00.000Z'),
      sequence: 25,
    } as unknown as DoorwayEvent;
    const browserBundleExported = {
      id: 'evt_browser_bundle_exported',
      threadId: 'thread_1',
      type: 'browser.bundle_exported',
      payload: {
        path: '/repo/.doorway-evidence/browser/thread_1-2026-05-18.json',
        actionCount: 2,
        screenshotCount: 1,
        createdAt: '2026-05-18T03:03:00.000Z',
      },
      timestamp: new Date('2026-05-18T03:04:00.000Z'),
      sequence: 26,
    } as unknown as DoorwayEvent;
    const taskGraphUpdated = {
      id: 'evt_task_graph_updated',
      threadId: 'thread_1',
      type: 'task_graph.updated',
      payload: {
        taskId: 'task-review',
        nodeId: 'node-review',
        previousStatus: 'running',
        newStatus: 'completed',
      },
      timestamp: new Date('2026-05-18T03:05:00.000Z'),
      sequence: 27,
    } as unknown as DoorwayEvent;
    const browserAction = {
      id: 'evt_browser_action',
      threadId: 'thread_1',
      type: 'browser.action',
      payload: {
        type: 'click',
        selector: '[aria-label="Send prompt"]',
        screenshot: 'jpeg-base64',
      },
      timestamp: new Date('2026-05-18T03:05:00.000Z'),
      sequence: 27,
    } as unknown as DoorwayEvent;
    const threadStatusChanged = {
      id: 'evt_thread_status_changed',
      threadId: 'thread_1',
      type: 'thread.status_changed',
      payload: {
        threadId: 'thread_1',
        previousStatus: 'active',
        newStatus: 'paused',
      },
      timestamp: new Date('2026-05-18T03:06:00.000Z'),
      sequence: 28,
    } as unknown as DoorwayEvent;
    const threadReplayExported = {
      id: 'evt_thread_replay_exported',
      threadId: 'thread_1',
      type: 'thread.replay_exported',
      payload: {
        path: '/repo/.doorway-evidence/thread_1/replay/thread.jsonl',
        eventCount: 29,
        createdAt: '2026-05-18T03:07:00.000Z',
      },
      timestamp: new Date('2026-05-18T03:07:00.000Z'),
      sequence: 29,
    } as unknown as DoorwayEvent;
    const threadReplayVerificationFailed = {
      id: 'evt_thread_replay_verification_failed',
      threadId: 'thread_1',
      type: 'thread.replay_verification_failed',
      payload: {
        path: '/repo/.doorway-evidence/thread_1/replay/bad-thread.jsonl',
        error: 'Replay JSONL line has an unknown event type.',
        createdAt: '2026-05-18T03:08:00.000Z',
      },
      timestamp: new Date('2026-05-18T03:08:00.000Z'),
      sequence: 30,
    } as unknown as DoorwayEvent;
    const threadReplayVerificationSucceeded = {
      id: 'evt_thread_replay_verification_succeeded',
      threadId: 'thread_1',
      type: 'thread.replay_verification_succeeded',
      payload: {
        path: '/repo/.doorway-evidence/thread_1/replay/thread.jsonl',
        eventCount: 29,
        firstSequence: 1,
        lastSequence: 29,
        threadIds: ['thread_1'],
        createdAt: '2026-05-18T03:09:00.000Z',
      },
      timestamp: new Date('2026-05-18T03:09:00.000Z'),
      sequence: 31,
    } as unknown as DoorwayEvent;
    const mergeAssessments = [
      {
        id: 'merge_old',
        taskId: 'task-review' as TaskId,
        score: 'reviewable',
        reason: 'Older merge reason',
        cleanApply: true,
        testsPassed: false,
        highRiskFiles: [],
        hasApproval: false,
        createdAt: new Date('2026-05-18T01:10:00.000Z'),
        evidence: [],
      },
      {
        id: 'merge_new',
        taskId: 'task-review' as TaskId,
        score: 'ready',
        reason: 'Newest merge reason',
        cleanApply: true,
        testsPassed: true,
        highRiskFiles: [],
        hasApproval: true,
        createdAt: new Date('2026-05-18T02:10:00.000Z'),
        evidence: [],
      },
    ] satisfies MergeAssessmentProjection[];
    const receipts = [
      {
        id: 'perm_old',
        taskId: 'task-review' as TaskId,
        command: 'older permission command',
        riskCategory: 'merge_approval',
        decision: 'approved',
        timestamp: new Date('2026-05-18T01:20:00.000Z'),
        evidence: [],
      },
      {
        id: 'perm_new',
        taskId: 'task-review' as TaskId,
        command: 'newest permission command',
        riskCategory: 'merge_approval',
        decision: 'approved',
        timestamp: new Date('2026-05-18T02:20:00.000Z'),
        evidence: [],
      },
    ] satisfies PermissionReceiptProjection[];
    const proofs = [
      {
        id: 'proof_old',
        label: 'Older proof label',
        status: 'fail',
        command: 'pnpm test',
        summary: 'Older proof summary',
        startedAt: new Date('2026-05-18T01:40:00.000Z'),
        finishedAt: new Date('2026-05-18T01:41:00.000Z'),
        evidence: [],
      },
      {
        id: 'proof_new',
        label: 'Newest proof label',
        status: 'pass',
        command: 'pnpm test',
        summary: 'Newest proof summary',
        startedAt: new Date('2026-05-18T02:40:00.000Z'),
        finishedAt: new Date('2026-05-18T02:41:00.000Z'),
        evidence: [],
      },
    ] satisfies ProofProjection[];
    const handoffCapsules = [olderCapsule, newerCapsule];
    const threadEvents = [
      threadCreated,
      olderUsage,
      newerUsage,
      handoffCreated,
      messageAppended,
      diffUpdated,
      mergeStarted,
      mergeCompleted,
      mergeEvaluated,
      mergeConflict,
      terminalCreated,
      terminalStarted,
      terminalInput,
      terminalOutput,
      terminalStopped,
      terminalAttention,
      completionConfidence,
      testStarted,
      testFinished,
      approvalRequested,
      approvalGranted,
      approvalDenied,
      agentRunCreated,
      agentRunStatusChanged,
      agentRunCompleted,
      worktreeCreated,
      fileChangeDetected,
      worktreeArchived,
      rollbackPatchExported,
      browserBundleExported,
      taskGraphUpdated,
      browserAction,
      threadStatusChanged,
      threadReplayExported,
      threadReplayVerificationFailed,
      threadReplayVerificationSucceeded,
    ];
    const browserActions = [
      {
        timestamp: new Date('2026-05-18T03:00:00.000Z'),
        type: 'goto',
        url: 'https://localhost:5173',
        screenshot: 'jpeg-base64',
      },
      {
        timestamp: new Date('2026-05-18T03:01:00.000Z'),
        type: 'click',
        selector: '[aria-label="Send prompt"]',
      },
    ];
    const noop = vi.fn();

    const html = renderToStaticMarkup(
      React.createElement(EvidencePanel, {
        loading: false,
        hasActiveThread: true,
        selectedWorktreePath: null,
        provider: 'codex',
        handoffCapsules,
        filteredHandoffCapsules: sortHandoffCapsulesByEvidenceTime(handoffCapsules, threadEvents),
        handoffCopyEvents: sortHandoffUsedEventsByEvidenceTime(threadEvents),
        filteredMergeAssessments: sortMergeAssessmentsByEvidenceTime(mergeAssessments),
        filteredPermissionReceipts: sortPermissionReceiptsByEvidenceTime(receipts),
        filteredProofs: sortProofsByEvidenceTime(proofs),
        mergeAssessments,
        permissionReceipts: receipts,
        peerMessages: [],
        proofs,
        terminalSessions: [],
        threadEvents,
        browserActions,
        threadReplayVerification: {
          path: '/tmp/thread.jsonl',
          eventCount: 29,
          firstSequence: 1,
          lastSequence: 29,
          threadIds: ['thread_1'],
        },
        browserProofBlocked: true,
        browserProofBlockedReason: 'Browser proof is disabled for this thread',
        handoffFilter: 'all',
        proofFilter: 'all',
        mergeFilter: 'all',
        permissionFilter: 'all',
        setHandoffFilter: noop,
        setProofFilter: noop,
        setMergeFilter: noop,
        setPermissionFilter: noop,
        createHandoff: noop,
        copyText: noop,
        exportThreadReplay: noop,
        exportBrowserEvidence: noop,
        openPath: noop,
      })
    );

    expect(html.indexOf('Newest handoff summary')).toBeLessThan(
      html.indexOf('Older handoff summary')
    );
    expect(html.indexOf('hnd_new copied')).toBeLessThan(html.indexOf('hnd_old copied'));
    expect(html.indexOf('Newest merge reason')).toBeLessThan(html.indexOf('Older merge reason'));
    expect(html.indexOf('newest permission command')).toBeLessThan(
      html.indexOf('older permission command')
    );
    expect(html.indexOf('Newest proof label')).toBeLessThan(html.indexOf('Older proof label'));
    expect(html).toContain('Thread event JSONL');
    expect(html).toContain('36 persisted events');
    expect(html).toContain('aria-label="Thread replay JSONL"');
    expect(html).toContain('Copy JSONL');
    expect(html).toContain('Export JSONL');
    expect(html).toContain('29 verified events');
    expect(html).toContain('seq 1-29');
    expect(html).toContain('Open JSONL');
    expect(threadReplayExportEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_thread_replay_exported',
    ]);
    expect(threadReplayExportEventLabel(threadReplayExported)).toBe(
      '/repo/.doorway-evidence/thread_1/replay/thread.jsonl · 29 events · 2026-05-18T03:07:00.000Z'
    );
    expect(html).toContain('Replay Exports');
    expect(html).toContain('Replay exported');
    expect(html).toContain('/repo/.doorway-evidence/thread_1/replay/thread.jsonl');
    expect(threadReplayVerificationFailureEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_thread_replay_verification_failed',
    ]);
    expect(threadReplayVerificationFailureEventLabel(threadReplayVerificationFailed)).toBe(
      '/repo/.doorway-evidence/thread_1/replay/bad-thread.jsonl · Replay JSONL line has an unknown event type. · 2026-05-18T03:08:00.000Z'
    );
    expect(html).toContain('Replay Verification');
    expect(html).toContain('Replay verification failed');
    expect(html).toContain('/repo/.doorway-evidence/thread_1/replay/bad-thread.jsonl');
    expect(threadReplayVerificationSuccessEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_thread_replay_verification_succeeded',
    ]);
    expect(threadReplayVerificationSuccessEventLabel(threadReplayVerificationSucceeded)).toBe(
      '/repo/.doorway-evidence/thread_1/replay/thread.jsonl · 29 events · seq 1-29 · thread_1 · 2026-05-18T03:09:00.000Z'
    );
    expect(html).toContain('Replay Verified');
    expect(html).toContain('Replay verification passed');
    expect(handoffCreationEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_handoff_created',
    ]);
    expect(handoffCreationEventLabel(handoffCreated)).toBe('hnd_new · run_review · codex');
    expect(html).toContain('Handoff Timeline');
    expect(html).toContain('Handoff created');
    expect(html).toContain('hnd_new · run_review · codex');
    expect(threadLifecycleEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_thread_status_changed',
      'evt_thread_created',
    ]);
    expect(threadLifecycleEventLabel(threadCreated)).toBe(
      'thread_1 · project_doorway · Review merge path · Review the merge path and capture browser proof.'
    );
    expect(threadLifecycleEventLabel(threadStatusChanged)).toBe('thread_1 · active -> paused');
    expect(html).toContain('Thread Lifecycle');
    expect(html).toContain('thread_1 · project_doorway · Review merge path');
    expect(html).toContain('thread_1 · active -&gt; paused');
    expect(html).toContain('thread_1 · active -&gt; paused');
    expect(messageAppendedEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_message_appended',
    ]);
    expect(messageAppendedEventLabel(messageAppended)).toBe(
      'msg_1 · user · codex · Review the merge path and capture browser proof.'
    );
    expect(html).toContain('Message Timeline');
    expect(html).toContain('Message appended');
    expect(html).toContain(
      'msg_1 · user · codex · Review the merge path and capture browser proof.'
    );
    expect(terminalEvidenceEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_completion_confidence',
      'evt_terminal_attention',
      'evt_terminal_stopped',
      'evt_terminal_output',
      'evt_terminal_input',
      'evt_terminal_started',
      'evt_terminal_created',
    ]);
    expect(terminalEvidencePreview(threadEvents, 2).map((event) => event.id)).toEqual([
      'evt_completion_confidence',
      'evt_terminal_attention',
    ]);
    expect(terminalEvidenceEventLabel(terminalCreated)).toBe(
      'term_1 · run_review · pty · pnpm test'
    );
    expect(terminalEvidenceEventLabel(terminalStarted)).toBe('term_1 · pid 4242');
    expect(terminalEvidenceEventLabel(terminalInput)).toBe('term_1 · #0 · permission_decision · y');
    expect(terminalEvidenceEventLabel(terminalOutput)).toBe(
      'term_1 · #1 · stdout · pnpm test passed'
    );
    expect(terminalEvidenceEventLabel(terminalStopped)).toBe('term_1 · exit 0');
    expect(terminalEvidenceEventLabel(terminalAttention)).toBe(
      'term_1 · needs_approval · Terminal output requested permission or approval.'
    );
    expect(terminalEvidenceEventLabel(completionConfidence)).toBe(
      'term_1 · 50% · waiting_for_user · permission_prompt'
    );
    expect(html).toContain('Terminal Timeline');
    expect(html).toContain('term_1 · 50% · waiting_for_user · permission_prompt');
    expect(html).toContain('term_1 · needs_approval');
    expect(html).toContain('term_1 · exit 0');
    expect(html).toContain('term_1 · #1 · stdout · pnpm test passed');
    expect(html).toContain('term_1 · #0 · permission_decision · y');
    expect(testLifecycleEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_test_finished',
      'evt_test_started',
    ]);
    expect(testLifecycleEventLabel(testStarted)).toBe('proof_new · term_1 · pnpm test');
    expect(testLifecycleEventLabel(testFinished)).toBe('proof_new · pass · exit 0 · Tests passed');
    expect(html).toContain('Test Timeline');
    expect(html).toContain('proof_new · term_1 · pnpm test');
    expect(html).toContain('proof_new · pass · exit 0 · Tests passed');
    expect(approvalTimelineEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_approval_denied',
      'evt_approval_granted',
      'evt_approval_requested',
    ]);
    expect(approvalTimelineEventLabel(approvalRequested)).toBe(
      'run_review · requires user input · Approve merge command'
    );
    expect(approvalTimelineEventLabel(approvalGranted)).toBe(
      'perm_new · task-review · merge_approval · merge doorway/task-review/backend · Reviewed clean diff'
    );
    expect(approvalTimelineEventLabel(approvalDenied)).toBe(
      'perm_denied · task-review · tool_disabled · agent:launch codex · Blocked by thread tool policy: tool.codex-cli'
    );
    expect(html).toContain('Approval Timeline');
    expect(html).toContain('run_review · requires user input · Approve merge command');
    expect(html).toContain('perm_new · task-review · merge_approval');
    expect(html).toContain('perm_denied · task-review · tool_disabled');
    expect(agentLifecycleEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_agent_completed',
      'evt_agent_status',
      'evt_agent_created',
    ]);
    expect(
      agentMemorySourceLabel([
        { sourceFile: 'AGENTS.md', category: 'instruction', contentLength: 18 },
        { sourceFile: 'DOORWAY.md', category: 'instruction', contentLength: 28 },
      ])
    ).toBe('AGENTS.md (instruction, 18 chars), DOORWAY.md (instruction, 28 chars)');
    expect(
      projectInstructionPreflightLabel([
        { sourceFile: 'AGENTS.md', category: 'instruction', contentLength: 18 },
        { sourceFile: 'DOORWAY.md', category: 'instruction', contentLength: 28 },
      ])
    ).toBe('AGENTS.md (instruction, 18 chars), DOORWAY.md (instruction, 28 chars)');
    expect(projectInstructionPreflightLabel([])).toBe('No project instruction files found');
    expect(agentLifecycleEventLabel(agentRunCreated)).toBe(
      'run_review · task-review · codex · reviewer · wt_review · instructions AGENTS.md (instruction, 18 chars), DOORWAY.md (instruction, 28 chars)'
    );
    expect(agentLifecycleEventLabel(agentRunStatusChanged)).toBe(
      'run_review · running -> completed · terminal exited'
    );
    expect(agentLifecycleEventLabel(agentRunCompleted)).toBe('run_review · exit 0');
    expect(html).toContain('Agent Timeline');
    expect(html).toContain('run_review · exit 0');
    expect(html).toContain('run_review · running -&gt; completed');
    expect(html).toContain('run_review · task-review · codex');
    expect(taskGraphUpdateEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_task_graph_updated',
    ]);
    expect(taskGraphUpdateEventLabel(taskGraphUpdated)).toBe(
      'task-review · node-review · running -> completed'
    );
    expect(html).toContain('Task Graph Timeline');
    expect(html).toContain('Task graph updated');
    expect(html).toContain('task-review · node-review · running -&gt; completed');
    expect(worktreeSafetyEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_rollback_patch',
      'evt_worktree_archived',
      'evt_file_change',
      'evt_worktree_created',
    ]);
    expect(worktreeSafetyEventLabel(worktreeCreated)).toBe(
      'wt_review · task-review · doorway/task-review/backend · /repo/.doorway-workspaces/task-review'
    );
    expect(worktreeSafetyEventLabel(fileChangeDetected)).toBe(
      'wt_review · run_review · modified · apps/desktop/src/renderer/App.tsx'
    );
    expect(worktreeSafetyEventLabel(worktreeArchived)).toBe(
      'wt_review · doorway/task-review/backend · /repo/.doorway-workspaces/task-review · branch kept · removed worktree; kept branch doorway/task-review/backend'
    );
    expect(worktreeSafetyEventLabel(rollbackPatchExported)).toBe(
      'wt_review · doorway/task-review/backend · /repo/.doorway-workspaces/task-review · 2048 bytes · /repo/evidence/thread_1/rollback/rollback-abcd.patch'
    );
    expect(html).toContain('Worktree Safety Timeline');
    expect(html).toContain('Open rollback patch');
    expect(diffUpdatedEvents(threadEvents).map((event) => event.id)).toEqual(['evt_diff']);
    expect(diffUpdatedEventLabel(diffUpdated)).toBe(
      '/repo/.doorway-workspaces/task-review · 2 files · +12 -4'
    );
    expect(html).toContain('Worktree Diff Loads');
    expect(html).toContain('Diff opened');
    expect(html).toContain('/repo/.doorway-workspaces/task-review · 2 files · +12 -4');
    expect(mergeLifecycleEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_merge_conflict',
      'evt_merge_evaluated',
      'evt_merge_completed',
      'evt_merge_started',
    ]);
    expect(mergeLifecycleEventLabel(mergeCompleted)).toBe(
      'task-review · doorway/integration/task-review-abc · doorway/task-review/backend'
    );
    expect(mergeLifecycleEventLabel(mergeConflict)).toBe(
      'task-review · apps/desktop/src/renderer/App.tsx'
    );
    expect(mergeLifecycleEventLabel(mergeEvaluated)).toBe(
      'merge_new · task-review · ready · Latest assessment'
    );
    expect(html).toContain('Merge Timeline');
    expect(html).toContain('merge.started');
    expect(html).toContain('Browser evidence bundle');
    expect(html).toContain('2 actions');
    expect(html).toContain('aria-label="Browser evidence preview"');
    expect(html).toContain('Copy browser bundle');
    expect(html).toContain('Export browser bundle');
    expect(browserActionEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_browser_action',
    ]);
    expect(browserActionEventLabel(browserAction)).toBe(
      'click [aria-label="Send prompt"] · screenshot attached'
    );
    expect(html).toContain('Browser Action Timeline');
    expect(html).toContain('Browser action recorded');
    expect(html).toContain('click [aria-label=&quot;Send prompt&quot;] · screenshot attached');
    expect(browserBundleExportEvents(threadEvents).map((event) => event.id)).toEqual([
      'evt_browser_bundle_exported',
    ]);
    expect(browserBundleExportEventLabel(browserBundleExported)).toBe(
      '/repo/.doorway-evidence/browser/thread_1-2026-05-18.json · 2 actions · 1 screenshot · 2026-05-18T03:03:00.000Z'
    );
    expect(html).toContain('Browser Export Timeline');
    expect(html).toContain('Browser bundle exported');
    expect(html).toContain('/repo/.doorway-evidence/browser/thread_1-2026-05-18.json');
    expect(html).toContain('Browser proof is disabled for this thread');
    expect(html).toContain('disabled=""');
  });

  it('formats persisted thread events as deterministic replay JSONL', async () => {
    const { replayEventJsonLine, replayJsonl, replayPreviewEvents } = await import('./App');
    const first = {
      id: 'evt_1',
      threadId: 'thread_1',
      type: 'message.appended',
      payload: { messageId: 'msg_1' },
      timestamp: new Date('2026-05-18T01:00:00.000Z'),
      sequence: 1,
    } as unknown as DoorwayEvent;
    const second = {
      id: 'evt_2',
      threadId: 'thread_1',
      type: 'agent_run.created',
      payload: { runId: 'run_1' },
      timestamp: new Date('2026-05-18T01:01:00.000Z'),
      sequence: 2,
    } as unknown as DoorwayEvent;

    expect(replayPreviewEvents([second, first]).map((event) => event.id)).toEqual([
      'evt_1',
      'evt_2',
    ]);
    expect(replayEventJsonLine(first)).toBe(
      '{"id":"evt_1","threadId":"thread_1","sequence":1,"timestamp":"2026-05-18T01:00:00.000Z","type":"message.appended","payload":{"messageId":"msg_1"}}'
    );
    expect(replayJsonl([second, first])).toBe(
      `${replayEventJsonLine(first)}\n${replayEventJsonLine(second)}`
    );
  });

  it('formats browser actions as a deterministic evidence bundle', async () => {
    const { browserEvidenceActionLabel, browserEvidenceBundle, browserEvidencePreview } =
      await import('./App');
    const actions = [
      {
        timestamp: new Date('2026-05-18T01:00:00.000Z'),
        type: 'goto',
        url: 'https://localhost:5173',
        screenshot: 'screen-one',
      },
      {
        timestamp: new Date('2026-05-18T01:01:00.000Z'),
        type: 'click',
        selector: '[data-testid="send"]',
      },
    ];

    expect(browserEvidencePreview(actions, 1).map((action) => action.type)).toEqual(['click']);
    expect(browserEvidenceActionLabel(actions[0])).toBe('goto https://localhost:5173');
    expect(JSON.parse(browserEvidenceBundle(actions))).toEqual({
      kind: 'browser-evidence',
      actions: [
        {
          sequence: 1,
          timestamp: '2026-05-18T01:00:00.000Z',
          type: 'goto',
          url: 'https://localhost:5173',
          screenshot: 'screen-one',
        },
        {
          sequence: 2,
          timestamp: '2026-05-18T01:01:00.000Z',
          type: 'click',
          selector: '[data-testid="send"]',
        },
      ],
    });
  });

  it('maps slash commands to real Doorway surfaces', async () => {
    const { slashCommands, surfaceForSlashCommand } = await import('./App');

    expect(slashCommands).toContain('/merge');
    expect(slashCommands).toContain('/tools');
    expect(surfaceForSlashCommand('/merge')).toBe('worktrees');
    expect(surfaceForSlashCommand('/review')).toBe('worktrees');
    expect(surfaceForSlashCommand('/browser')).toBe('browser');
    expect(surfaceForSlashCommand('/handoff')).toBe('evidence');
    expect(surfaceForSlashCommand('/tools')).toBe('tools');
    expect(surfaceForSlashCommand('/build')).toBeNull();
  });

  it('renders tool capability permissions from the IPC projection', async () => {
    const { ToolCapabilitiesPanel } = await import('./App');
    const tools = [
      {
        id: 'tool.claude-code',
        name: 'Claude Code',
        surface: 'agent',
        status: 'available',
        enabled: true,
        permissions: ['pty_execution', 'worktree_write'],
        evidence: ['terminal_transcript', 'worktree_diff'],
      },
      {
        id: 'tool.browser-proof',
        name: 'Browser proof',
        surface: 'browser',
        status: 'requires_thread',
        enabled: false,
        permissions: ['browser_automation', 'evidence_export'],
        evidence: ['browser_action', 'browser_bundle'],
      },
    ] satisfies ToolCapabilityProjection[];

    const html = renderToStaticMarkup(
      React.createElement(ToolCapabilitiesPanel, {
        tools,
        lanes: [],
        operationalMemory: null,
        plugins: [
          {
            id: 'doorway.review-gate',
            name: 'Review gate',
            version: '1.2.0',
            manifestPath: '/repo/.doorway/plugins/review-gate/doorway.plugin.json',
            status: 'ready',
            capabilities: ['slash_command'],
            filesystemRead: ['docs/**'],
            filesystemWrite: [],
            networkHosts: ['api.example.test'],
            entryCommand: 'pnpm review:gate',
          },
          {
            id: 'invalid:/repo/.doorway/plugins/broken/doorway.plugin.json',
            name: 'broken',
            version: 'invalid',
            manifestPath: '/repo/.doorway/plugins/broken/doorway.plugin.json',
            status: 'invalid',
            capabilities: [],
            filesystemRead: [],
            filesystemWrite: [],
            networkHosts: [],
            problem: 'Manifest name is required.',
          },
        ],
        worktrees: [],
        denials: [
          {
            id: 'perm_tool_denied',
            taskId: 'task-review' as TaskId,
            command: 'agent:launch codex',
            riskCategory: 'tool_disabled',
            decision: 'denied',
            userNotes: 'Blocked by thread tool policy: tool.codex-cli',
            timestamp: new Date('2026-05-18T03:00:00.000Z'),
            evidence: [],
          },
        ],
        hasActiveThread: true,
        onToolToggle: vi.fn(),
      })
    );

    expect(html).toContain('aria-label="Tool capability permissions"');
    expect(html).toContain('Claude Code');
    expect(html).toContain('available');
    expect(html).toContain('tool-policy-chip--enabled');
    expect(html).toContain('pty_execution');
    expect(html).toContain('terminal_transcript');
    expect(html).toContain('Browser proof');
    expect(html).toContain('requires thread');
    expect(html).toContain('tool-policy-chip--disabled');
    expect(html).toContain('browser_bundle');
    expect(html).toContain('Blocked by tool policy');
    expect(html).toContain('agent:launch codex');
    expect(html).toContain('Blocked by thread tool policy: tool.codex-cli');
    expect(html).toContain('Project plugins');
    expect(html).toContain('Review gate');
    expect(html).toContain('pnpm review:gate');
    expect(html).toContain('Manifest name is required.');
    expect(html).toContain('Disable for thread');
    expect(html).toContain('Enable for thread');
  });

  it('builds structured composer launch options for the agent contract', async () => {
    const {
      applyMentionTargetToPrompt,
      buildComposerLaunchOptions,
      browserProofPreflight,
      composerLaunchPreflight,
      composerMentionTargets,
      composerPolicySummary,
      filteredMentionTargets,
      launchModelFromMentions,
      launchProviderFromMentions,
      mentionLabelFromText,
      providerModelCapabilityLabel,
      providerModelLabel,
      replayVerificationPreflight,
      reviewMergePreflight,
      toolIdForProvider,
    } = await import('./App');
    const model = {
      id: 'model_1',
      providerProfileId: 'provider_openai',
      providerId: 'openai',
      providerName: 'OpenAI',
      modelId: 'gpt-5.2',
      displayName: 'GPT-5.2',
      contextWindow: 200000,
      supportsStreaming: true,
      supportsJsonSchema: true,
      supportsToolCalling: true,
      supportsVision: false,
    } satisfies ProviderModelProjection;
    const targets = composerMentionTargets([model]);
    const project = {
      id: 'project_doorway' as ProjectId,
      name: 'Doorway',
      path: '/home/govinda/Doorway',
      mode: 'git',
      packageManager: 'pnpm',
      createdAt: new Date('2026-05-18T01:00:00.000Z'),
    } satisfies ProjectProjection;
    const worktree = {
      id: 'wt_review',
      path: '/repo/.doorway-workspaces/task-review',
      branch: 'refs/heads/doorway/task-review/backend',
      status: 'active',
      isActive: true,
    } as WorktreeProjection;
    const fullTargets = composerMentionTargets([model], {
      activeProject: project,
      worktrees: [worktree],
      macros: ['/build', '/review'],
    });
    const policyTools = [
      {
        id: 'tool.claude-code',
        name: 'Claude Code',
        surface: 'agent',
        status: 'available',
        enabled: true,
        permissions: [],
        evidence: [],
      },
      {
        id: 'tool.codex-cli',
        name: 'Codex CLI',
        surface: 'agent',
        status: 'available',
        enabled: false,
        permissions: [],
        evidence: [],
      },
    ] satisfies ToolCapabilityProjection[];

    expect(
      buildComposerLaunchOptions({
        mode: '/debug',
        permissionProfile: 'worktree-only',
        worktreeStrategy: 'fork-current',
        ptyMode: 'external-pty',
        modelId: model.modelId,
      })
    ).toEqual({
      mode: '/debug',
      permissionProfile: 'worktree-only',
      worktreeStrategy: 'fork-current',
      ptyMode: 'external-pty',
      modelId: 'gpt-5.2',
    });
    expect(providerModelLabel(model)).toBe('GPT-5.2 · OpenAI');
    expect(providerModelCapabilityLabel(model)).toBe('streaming / tools');
    expect(
      composerPolicySummary({
        permissionProfile: 'review-first',
        worktreeStrategy: 'selected-worktree',
        ptyMode: 'doorway-pty',
        tools: policyTools,
      }).map((item) => item.label)
    ).toEqual(['Review first', 'Use selected', 'Doorway PTY', '1 disabled tool']);
    expect(
      composerPolicySummary({
        activeProject: project,
        permissionProfile: 'review-first',
        worktreeStrategy: 'selected-worktree',
        ptyMode: 'doorway-pty',
        tools: policyTools,
      }).map((item) => item.label)
    ).toEqual([
      'Review first',
      'Use selected',
      'Git worktrees enabled',
      'Doorway PTY',
      '1 disabled tool',
    ]);
    expect(
      composerPolicySummary({
        activeProject: { ...project, mode: 'non_git' },
        permissionProfile: 'worktree-only',
        worktreeStrategy: 'auto-worktree',
        ptyMode: 'doorway-pty',
        tools: [],
      })
    ).toContainEqual({ label: 'Terminal-only execution', tone: 'warning' });
    expect(toolIdForProvider('codex')).toBe('tool.codex-cli');
    expect(
      composerLaunchPreflight({
        provider: 'claude',
        prompt: '@Codex verify the worker routing',
        mentionTargets: targets,
        tools: policyTools,
      })
    ).toEqual({
      canSubmit: false,
      provider: 'codex',
      toolId: 'tool.codex-cli',
      reason: 'Codex CLI is disabled for this thread',
    });
    expect(
      composerLaunchPreflight({
        provider: 'claude',
        prompt: '@CloudCode build this',
        mentionTargets: targets,
        tools: policyTools,
      }).canSubmit
    ).toBe(true);
    expect(browserProofPreflight(policyTools)).toEqual({ canUse: true });
    expect(
      browserProofPreflight([
        ...policyTools,
        {
          id: 'tool.browser-proof',
          name: 'Browser proof',
          surface: 'browser',
          status: 'available',
          enabled: false,
          permissions: [],
          evidence: [],
        },
      ])
    ).toEqual({
      canUse: false,
      reason: 'Browser proof is disabled for this thread',
    });
    expect(
      reviewMergePreflight([
        ...policyTools,
        {
          id: 'tool.review-merge',
          name: 'Review merge',
          surface: 'worktree',
          status: 'available',
          enabled: false,
          permissions: [],
          evidence: [],
        },
      ])
    ).toEqual({
      canUse: false,
      reason: 'Review merge is disabled for this thread',
    });
    expect(replayVerificationPreflight([])).toEqual({
      canUse: false,
      reason: 'No successful replay verification recorded for this thread',
    });
    expect(
      replayVerificationPreflight([
        {
          id: 'evt_replay_passed',
          threadId: 'thread_1',
          type: 'thread.replay_verification_succeeded',
          payload: {
            path: '/tmp/thread.jsonl',
            eventCount: 1,
            firstSequence: 1,
            lastSequence: 1,
            threadIds: ['thread_1'],
            createdAt: '2026-05-18T01:00:00.000Z',
          },
          timestamp: new Date('2026-05-18T01:00:00.000Z'),
          sequence: 1,
        } as unknown as DoorwayEvent,
      ])
    ).toEqual({ canUse: true });
    expect(mentionLabelFromText('GPT-5.2')).toBe('@GPT-5-2');
    expect(targets.map((target) => target.label)).toEqual(['@CloudCode', '@Codex', '@GPT-5-2']);
    expect(fullTargets.map((target) => target.label)).toEqual([
      '@CloudCode',
      '@Codex',
      '@GPT-5-2',
      '@Doorway',
      '@doorway-task-review-backend',
      '@build',
      '@review',
    ]);
    expect(filteredMentionTargets('ask @g', targets).map((target) => target.label)).toEqual([
      '@GPT-5-2',
    ]);
    expect(applyMentionTargetToPrompt('ask @g', targets[2])).toBe('ask @GPT-5-2 ');
    expect(applyMentionTargetToPrompt('please @b', fullTargets[5])).toBe('please /build ');
    expect(launchProviderFromMentions('@CloudCode fix tests', 'generic', targets)).toBe('claude');
    expect(launchProviderFromMentions('@Codex verify tests', 'generic', targets)).toBe('codex');
    expect(launchModelFromMentions('verify with @GPT-5-2', undefined, targets)).toBe('gpt-5.2');
  });

  it('summarizes inspector drawer status from real persisted surface state', async () => {
    const { surfaceDrawerStatusLabel } = await import('./App');
    const baseStatus = {
      terminalChunkCount: 0,
      liveAgentEventCount: 0,
      activeTerminalSessionId: null,
      browserUrl: '',
      browserTitle: '',
      browserActionCount: 0,
      evidenceRecordCount: 0,
      worktreeCount: 0,
      toolCount: 0,
    };

    expect(
      surfaceDrawerStatusLabel('terminal', {
        ...baseStatus,
        terminalChunkCount: 2,
      })
    ).toBe('2 chunks');
    expect(surfaceDrawerStatusLabel('terminal', baseStatus)).toBe('Idle');
    expect(
      surfaceDrawerStatusLabel('browser', {
        ...baseStatus,
        browserUrl: 'https://localhost:5173',
      })
    ).toBe('https://localhost:5173');
    expect(surfaceDrawerStatusLabel('evidence', { ...baseStatus, evidenceRecordCount: 3 })).toBe(
      '3 records'
    );
    expect(surfaceDrawerStatusLabel('worktrees', { ...baseStatus, worktreeCount: 1 })).toBe(
      '1 worktree'
    );
    expect(surfaceDrawerStatusLabel('tools', { ...baseStatus, toolCount: 4 })).toBe('4 tools');
  });
});
