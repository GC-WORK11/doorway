import React from 'react';
import { motion } from 'framer-motion';
import { useHarnessState } from './HarnessContext';
import type {
  DoorwayEvent,
  DiffProjection,
  HandoffCapsuleProjection,
  MergeAssessmentProjection,
  MeshMessageProjection,
  OperationalMemoryProjection,
  PermissionReceiptProjection,
  ProjectProjection,
  ProofProjection,
  TerminalInputProjection,
  TerminalProjection,
  ThreadProjection,
  TranscriptChunk,
  WorktreeProjection,
  ToolCapabilityProjection,
  ToolLaneProjection,
} from '@doorway/protocol';
import { TerminalMuxPanel } from './TerminalMuxPanel';
import { EmptyState, LatestProofStatus } from './shared-ui';
import {
  surfaceDrawerStatusLabel,
  latestProof,
  worktreeCleanStatusLabel,
  worktreeMergeScore,
} from './App';
import {
  DiffPatch,
  ToolCapabilitiesPanel,
  WorktreeFirstActionCard,
  WorktreeReviewActions,
} from './SurfaceControls';
import { EvidencePanel } from './EvidencePanel';
import { ReviewEvidence } from './ReviewEvidence';

type Surface = 'browser' | 'terminal' | 'evidence' | 'worktrees' | 'tools' | null;

type BrowserStateView = {
  readonly url: string;
  readonly title: string;
  readonly isAgentControlled: boolean;
};

type ThreadReplayVerificationView = {
  readonly path: string;
  readonly eventCount: number;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly threadIds: readonly string[];
};

type BrowserEvidenceAction = {
  readonly timestamp: Date;
  readonly type: string;
  readonly selector?: string;
  readonly text?: string;
  readonly url?: string;
  readonly screenshot?: string;
};

export function SurfaceDrawer() {
  const {
    activeSurface,
    setActiveSurface,
    activeProject,
    activeThread,
    loading,
    provider,
    terminalSessions,
    terminalTranscript,
    terminalInputs,
    threadEvents,
    worktrees,
    selectedWorktreePath,
    activeDiff,
    worktreeAssessments,
    terminalFallbackText,
    activeTerminalSessionId,
    loadWorktreeDiff,
    browserUrl,
    setBrowserUrl,
    browserPreflight,
    browserPolicyTitle,
    browserState,
    latestBrowserScreenshot,
    launchBrowser,
    toggleBrowserControl,
    browserActions,
    threadReplayVerification,
    handoffCapsules,
    filteredHandoffCapsules,
    handoffCopyEvents,
    filteredMergeAssessments,
    filteredPermissionReceipts,
    filteredProofs,
    mergeAssessments,
    permissionReceipts,
    proofs,
    peerMessages,
    worktreeSummary,
    selectTerminalSession,
    evaluateMergeReadiness,
    approveWorktreeMerge,
    createIntegrationMerge,
    forkWorktree,
    archiveWorktree,
    exportRollbackPatch,
    createHandoff,
    exportThreadReplay,
    exportBrowserEvidence,
    forkWorktreeBlockedReason,
    archiveWorktreeBlockedReason,
    archiveMergedBranchTitle,
    worktreeFirstActionBlockedReason,
    isReviewMergeBlocked,
    reviewMergeBlockedReason,
    reviewMergePolicyTitle,
    hasReplayVerificationWarning,
    replayVerificationPolicyReason,
    toolCapabilities,
    toolLanes,
    operationalMemory,
    projectPlugins,
    permissionReceiptsForTools,
    activeThreadExists,
    setToolEnabled,
    copyText,
    openPath,
    onStartWorktreeRun,
    evidenceRecordCount,
    agentEvents,
  } = useHarnessState();

  const onCloseSurface = () => setActiveSurface(null);

  const surfaceLabels = {
    browser: 'Browser',
    terminal: 'Terminal',
    evidence: 'Evidence',
    worktrees: 'Worktrees',
    tools: 'Tools',
  } as const;

  if (!activeSurface) return null;

  const activeSurfaceLabel = surfaceLabels[activeSurface as keyof typeof surfaceLabels];

  const activeSurfaceStatus = surfaceDrawerStatusLabel(activeSurface, {
    terminalChunkCount: terminalTranscript.length,
    liveAgentEventCount: agentEvents.length,
    activeTerminalSessionId,
    browserUrl: browserState.url,
    browserTitle: browserState.title,
    browserActionCount: browserActions.length,
    evidenceRecordCount,
    worktreeCount: worktrees.length,
    toolCount: toolCapabilities.length,
  });

  return (
    <motion.aside
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`surface-drawer surface-drawer--${activeSurface}`}
      aria-label={activeSurfaceLabel}
    >
      <header className="drawer-header">
        <div>
          <strong>{activeSurfaceLabel}</strong>
          {activeSurfaceStatus && <small>{activeSurfaceStatus}</small>}
        </div>
        <button type="button" onClick={onCloseSurface} aria-label="Close surface">
          ×
        </button>
      </header>

      <div className="surface-drawer__body">
        {activeSurface === 'terminal' && <TerminalMuxPanel />}

        {activeSurface === 'browser' && (
          <div className="browser-panel">
            {browserPreflight.canUse === false && browserPreflight.reason && (
              <div className="browser-policy-status" aria-label="Browser proof policy">
                <span data-tone="blocked">{browserPreflight.reason}</span>
              </div>
            )}
            <div className="input-row">
              <input
                value={browserUrl}
                onChange={(event) => setBrowserUrl(event.target.value)}
                placeholder="https://localhost:5173"
                aria-label="Browser URL"
              />
              <button
                type="button"
                disabled={!browserUrl.trim() || browserPreflight.canUse === false}
                title={browserPolicyTitle}
                onClick={() => void launchBrowser(browserUrl.trim())}
              >
                Launch
              </button>
            </div>
            <button
              type="button"
              disabled={browserPreflight.canUse === false}
              title={browserPolicyTitle}
              onClick={() => void toggleBrowserControl(!browserState.isAgentControlled)}
            >
              {browserState.isAgentControlled ? 'Take over browser' : 'Release browser'}
            </button>
            {latestBrowserScreenshot ? (
              <img src={`data:image/jpeg;base64,${latestBrowserScreenshot}`} alt="Browser" />
            ) : (
              <EmptyState
                title="No browser screenshot recorded"
                body={browserState.url || 'Launch a browser proof session to capture state.'}
              />
            )}
          </div>
        )}

        {activeSurface === 'evidence' && (
          <EvidencePanel
            loading={loading}
            hasActiveThread={Boolean(activeThread)}
            selectedWorktreePath={selectedWorktreePath}
            provider={provider}
            handoffCapsules={handoffCapsules}
            filteredHandoffCapsules={filteredHandoffCapsules}
            handoffCopyEvents={handoffCopyEvents}
            filteredMergeAssessments={filteredMergeAssessments}
            filteredPermissionReceipts={filteredPermissionReceipts}
            filteredProofs={filteredProofs}
            mergeAssessments={mergeAssessments}
            permissionReceipts={permissionReceipts}
            peerMessages={peerMessages}
            proofs={proofs}
            terminalSessions={terminalSessions}
            threadEvents={threadEvents}
            browserActions={browserActions}
            threadReplayVerification={threadReplayVerification}
            browserProofBlocked={Boolean(activeThread && !browserPreflight.canUse)}
            browserProofBlockedReason={browserPreflight.reason}
            handoffFilter="all"
            proofFilter="all"
            mergeFilter="all"
            permissionFilter="all"
            setHandoffFilter={() => undefined}
            setProofFilter={() => undefined}
            setMergeFilter={() => undefined}
            setPermissionFilter={() => undefined}
            createHandoff={createHandoff}
            copyText={copyText}
            exportThreadReplay={exportThreadReplay}
            exportBrowserEvidence={exportBrowserEvidence}
            openPath={openPath as any}
          />
        )}

        {activeSurface === 'worktrees' && (
          <div className="worktree-list">
            <section className="worktree-safety-summary" aria-label="Worktree safety summary">
              <div>
                <strong>Worktree safety</strong>
                <span>{worktrees.length} tracked worktrees</span>
              </div>
              <div className="worktree-safety-summary__meta">
                <span>{worktreeSummary.reviewableCount} reviewable</span>
                <span>{worktreeSummary.readyCount} ready</span>
                <span>{worktreeSummary.cleanCount} clean</span>
              </div>
            </section>
            {worktrees.length > 0 ? (
              worktrees.map((worktree: any) => {
                const score = worktreeMergeScore(worktree, worktreeAssessments);

                return (
                  <button
                    className="worktree-row"
                    type="button"
                    key={worktree.id}
                    onClick={() => void loadWorktreeDiff(worktree.path)}
                  >
                    <span className="worktree-row__top">
                      <span>{worktree.branch}</span>
                      <span className={`merge-badge merge-badge--${score}`}>{score}</span>
                    </span>
                    <small>{worktree.path}</small>
                    <small>{worktreeCleanStatusLabel(worktree)}</small>
                  </button>
                );
              })
            ) : (
              <WorktreeFirstActionCard
                activeProject={activeProject}
                activeThread={activeThread}
                loading={loading}
                blockedReason={worktreeFirstActionBlockedReason}
                onStart={onStartWorktreeRun}
              />
            )}
            {activeDiff && (
              <div className="diff-review">
                <header className="diff-summary">
                  <strong>Selected diff</strong>
                  <span>
                    {activeDiff.files.length} files · +{activeDiff.totalAdditions} -
                    {activeDiff.totalDeletions}
                  </span>
                </header>
                {activeDiff.files.map((file: any) => (
                  <article className="diff-file" key={`${file.status}-${file.path}`}>
                    <div className="diff-file__header">
                      <span>{file.path}</span>
                      <small>
                        {file.status} · +{file.additions} -{file.deletions}
                      </small>
                    </div>
                    {file.patch ? (
                      <DiffPatch patch={file.patch} />
                    ) : (
                      <div className="diff-empty">No unified patch returned for this file.</div>
                    )}
                  </article>
                ))}
                {activeDiff.files.length === 0 && (
                  <EmptyState
                    title="No changed files"
                    body="The selected worktree returned a real diff response with no changed files."
                  />
                )}
                <LatestProofStatus proof={latestProof(proofs)} />
                <WorktreeReviewActions
                  activeThread={activeThread}
                  loading={loading}
                  selectedWorktreePath={selectedWorktreePath}
                  provider={provider}
                  isReviewMergeBlocked={isReviewMergeBlocked}
                  reviewMergeBlockedReason={reviewMergeBlockedReason}
                  reviewMergePolicyTitle={reviewMergePolicyTitle}
                  hasReplayVerificationWarning={hasReplayVerificationWarning}
                  replayVerificationPolicyReason={replayVerificationPolicyReason}
                  forkWorktreeBlockedReason={forkWorktreeBlockedReason}
                  archiveWorktreeBlockedReason={archiveWorktreeBlockedReason}
                  archiveMergedBranchTitle={archiveMergedBranchTitle}
                  evaluateMergeReadiness={evaluateMergeReadiness}
                  approveWorktreeMerge={approveWorktreeMerge}
                  createIntegrationMerge={createIntegrationMerge}
                  forkWorktree={forkWorktree}
                  archiveWorktree={archiveWorktree}
                  exportRollbackPatch={exportRollbackPatch}
                  createHandoff={createHandoff}
                  exportThreadReplay={exportThreadReplay}
                />
                <ReviewEvidence
                  activeDiff={activeDiff}
                  browserActions={browserActions}
                  mergeAssessments={mergeAssessments}
                  permissionReceipts={permissionReceipts}
                  proofs={proofs}
                  threadEvents={threadEvents}
                />
              </div>
            )}
            {!activeDiff && worktrees.length > 0 && (
              <div className="evidence-card">
                <strong>No diff selected</strong>
                <span>Select a Doorway worktree above to load its real git diff.</span>
              </div>
            )}
          </div>
        )}

        {activeSurface === 'tools' && (
          <ToolCapabilitiesPanel
            tools={toolCapabilities}
            lanes={toolLanes}
            operationalMemory={operationalMemory}
            plugins={projectPlugins}
            worktrees={worktrees}
            denials={permissionReceiptsForTools}
            hasActiveThread={activeThreadExists}
            onToolToggle={(toolId, enabled) => void setToolEnabled(toolId, enabled)}
            onSelectLaneTerminal={(sessionId) => void selectTerminalSession(sessionId)}
            onLoadLaneWorktreeDiff={(path) => void loadWorktreeDiff(path)}
          />
        )}
      </div>
    </motion.aside>
  );
}
