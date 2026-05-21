import React from 'react';
import type {
  AgentLaunchMode,
  AgentPermissionProfile,
  AgentPtyMode,
  AgentWorktreeStrategy,
  CompactCheckpointProjection,
  DiffProjection,
  DoorwayEvent,
  HandoffCapsuleProjection,
  MeshMessageProjection,
  MergeAssessmentProjection,
  PermissionReceiptProjection,
  ProofProjection,
  ProjectMemorySource,
  ProjectProjection,
  MessageProjection,
  ProviderModelProjection,
  TaskGraphProjection,
  TaskNodeStatus,
  ThreadProjection,
  ToolLaneProjection,
  TranscriptChunk,
  WorktreeProjection,
} from '@doorway/protocol';

import {
  EmptyState,
  EmptyProjectThreadPanel,
  FirstRunProjectPanel,
  MentionedText,
  type SlashCommand,
  messageCapsuleClassName,
} from './shared-ui';
import {
  ApprovalHistoryCapsule,
  ActiveWorktreeCapsule,
  DiffPreviewCapsule,
  EvidenceFeedCapsule,
  InlineHandoffCapsule,
  MergeReviewCapsule,
  PeerMessagesCapsule,
  SessionActivityCapsule,
  TaskGraphCapsule,
  TerminalTranscriptCapsule,
} from './App';

interface LiveAgentEvent {
  readonly runId: string;
  readonly type: string;
  readonly data: string;
  readonly timestamp: Date;
}

import { useHarnessState } from './HarnessContext';

export function ThreadCanvas() {
  const {
    activeProject,
    activeThread,
    error,
    loading,
    activeSurface,
    setActiveSurface,
    projectPath,
    setProjectPath,
    submitProject,
    threadTitle,
    setThreadTitle,
    submitThread,
    messages,
    agentEvents,
    threadEvents,
    taskGraphs,
    compactCheckpoints,
    toolLanes,
    updateGraphNodeStatus,
    worktrees,
    selectedWorktreePath,
    worktreeAssessments,
    terminalTranscript,
    activeDiff,
    handoffCapsules,
    proofs,
    peerMessages,
    mergeAssessments,
    permissionReceipts,
  } = useHarnessState();
  return (
    <main className="thread-canvas">
      <div className="thread-content">
        <header className="thread-header">
          <div className="thread-header-left">
            <div className="section-label">Thread</div>
            <h1>{activeThread?.title ?? 'Open a project to begin'}</h1>
          </div>
          <div className="thread-header-right" aria-label="Surfaces">
            {selectedWorktreePath && <span className="branch-chip">{selectedWorktreePath}</span>}
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <section className="message-list" aria-label="Thread messages">
          {!activeProject ? (
            <FirstRunProjectPanel
              loading={loading}
              projectPath={projectPath}
              setProjectPath={setProjectPath}
              submitProject={submitProject}
            />
          ) : !activeThread ? (
            <EmptyProjectThreadPanel
              activeProject={activeProject}
              loading={loading}
              threadTitle={threadTitle}
              setThreadTitle={setThreadTitle}
              submitThread={submitThread}
            />
          ) : messages.length > 0 ? (
            messages.map((message) => (
              <article className={messageCapsuleClassName(message.role)} key={message.id}>
                <div className="message-meta">{message.role === 'user' ? 'You' : 'Doorway'}</div>
                <p>
                  <MentionedText text={message.content} />
                </p>
              </article>
            ))
          ) : (
            <EmptyState
              title="No thread messages"
              body="Doorway only shows messages persisted for the selected thread."
            />
          )}

          {activeThread && (
            <SessionActivityCapsule agentEvents={agentEvents} threadEvents={threadEvents} />
          )}

          <TaskGraphCapsule taskGraphs={taskGraphs} updateGraphNodeStatus={updateGraphNodeStatus} />
          <ActiveWorktreeCapsule
            worktrees={worktrees}
            selectedWorktreePath={selectedWorktreePath}
            worktreeAssessments={worktreeAssessments}
          />
          <TerminalTranscriptCapsule terminalTranscript={terminalTranscript} />
          <DiffPreviewCapsule activeDiff={activeDiff} />
          <InlineHandoffCapsule handoffCapsules={handoffCapsules} />
          <EvidenceFeedCapsule proofs={proofs} />
          <PeerMessagesCapsule peerMessages={peerMessages} />
          <MergeReviewCapsule mergeAssessments={mergeAssessments} />
          <ApprovalHistoryCapsule permissionReceipts={permissionReceipts} />
        </section>
      </div>
    </main>
  );
}
