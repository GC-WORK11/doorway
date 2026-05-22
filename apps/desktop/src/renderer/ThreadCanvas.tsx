import React from 'react';
import { motion } from 'framer-motion';
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
  TerminalProjection,
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
  CompactCheckpointCapsule,
  DiffPreviewCapsule,
  EvidenceFeedCapsule,
  InlineHandoffCapsule,
  MergeReviewCapsule,
  PeerMessagesCapsule,
  SessionActivityCapsule,
  TaskGraphCapsule,
  WarpBlockCapsule,
} from './chat-widgets';

interface LiveAgentEvent {
  readonly runId: string;
  readonly type: string;
  readonly data: string;
  readonly timestamp: Date;
}

import { useHarnessState } from './HarnessContext';

type TimelineItem =
  | { readonly type: 'message'; readonly data: MessageProjection; readonly timestamp: number }
  | { readonly type: 'terminal'; readonly data: TerminalProjection; readonly timestamp: number };

type TimelineLane = {
  readonly id: string;
  readonly items: readonly TimelineItem[];
  readonly laneData?: ToolLaneProjection;
};

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
    compactCheckpoints = [],
    toolLanes = [],
    updateGraphNodeStatus,
    worktrees,
    selectedWorktreePath,
    worktreeAssessments,
    terminalTranscript,
    terminalSessions,
    activeDiff,
    handoffCapsules,
    proofs,
    peerMessages,
    mergeAssessments,
    permissionReceipts,
  } = useHarnessState();

  const timeline = React.useMemo(() => {
    const items: TimelineItem[] = [
      ...messages.map((m) => ({
        type: 'message' as const,
        data: m,
        timestamp: new Date(m.createdAt).getTime(),
      })),
      ...terminalSessions.map((t) => ({
        type: 'terminal' as const,
        data: t,
        timestamp: new Date(t.createdAt).getTime(),
      })),
    ];

    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, terminalSessions]);

  // Group timeline by runId for parallel lanes
  const lanes = React.useMemo<readonly TimelineLane[]>(() => {
    if (toolLanes.length <= 1) {
      return [{ id: 'main', items: timeline }];
    }

    const laneMap = new Map<string, typeof timeline>();
    for (const lane of toolLanes) {
      laneMap.set(lane.runId, []);
    }
    const unassigned: typeof timeline = [];

    for (const item of timeline) {
      if (item.type === 'terminal' && item.data.runId && laneMap.has(item.data.runId)) {
        laneMap.get(item.data.runId)!.push(item);
      } else if (item.type === 'message' && item.data.provider) {
        // Attempt to match message to lane based on provider/model
        const matchedLane = toolLanes.find((l) =>
          l.toolId.toLowerCase().includes(item.data.provider!.toLowerCase())
        );
        if (matchedLane) {
          laneMap.get(matchedLane.runId)!.push(item);
        } else {
          unassigned.push(item);
        }
      } else {
        unassigned.push(item);
      }
    }

    // Assign unassigned items to all lanes (e.g. user messages)
    for (const lane of toolLanes) {
      laneMap.set(
        lane.runId,
        [...unassigned, ...(laneMap.get(lane.runId) || [])].sort(
          (left, right) => left.timestamp - right.timestamp
        )
      );
    }

    return toolLanes.map((lane) => ({
      id: lane.runId,
      laneData: lane,
      items: laneMap.get(lane.runId) || [],
    }));
  }, [timeline, toolLanes]);

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
          ) : timeline.length === 0 ? (
            <EmptyState
              title="No thread messages"
              body="Doorway only shows messages persisted for the selected thread."
            />
          ) : lanes.length > 1 ? (
            <div className="thread-canvas-lanes">
              {lanes.map((lane) => (
                <div key={lane.id} className="lane-column">
                  <div className="lane-header">
                    <strong>{lane.laneData?.toolId ?? 'Agent'}</strong>
                    <span>{lane.laneData?.runRole ?? 'Assistant'}</span>
                  </div>
                  <motion.div
                    className="message-list__stagger"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
                    }}
                  >
                    {lane.items.map((item) => renderTimelineItem(item))}
                  </motion.div>
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              className="message-list__stagger"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.05 },
                },
              }}
            >
              {lanes[0]?.items.map((item) => renderTimelineItem(item))}
            </motion.div>
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
          <CompactCheckpointCapsule checkpoints={compactCheckpoints} />
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

function renderTimelineItem(item: TimelineItem) {
  if (item.type === 'message') {
    const message = item.data;
    return (
      <motion.article
        className={messageCapsuleClassName(message.role)}
        key={message.id}
        variants={{
          hidden: { opacity: 0, y: 8 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      >
        <div className="message-meta">{message.role === 'user' ? 'You' : 'Doorway'}</div>
        <p>
          <MentionedText text={message.content} />
        </p>
      </motion.article>
    );
  }

  const session = item.data;
  return (
    <motion.div
      key={session.id}
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    >
      <WarpBlockCapsule terminalSession={session} />
    </motion.div>
  );
}
