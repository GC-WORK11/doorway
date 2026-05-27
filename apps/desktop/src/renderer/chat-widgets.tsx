import React, { ReactNode } from 'react';
import type {
  CompactCheckpointProjection,
  DiffProjection,
  DoorwayEvent,
  HandoffCapsuleProjection,
  MergeAssessmentProjection,
  MeshMessageProjection,
  PermissionDecision,
  PermissionReceiptProjection,
  ProofProjection,
  TaskGraphProjection,
  TaskNodeStatus,
  TranscriptChunk,
  WorktreeProjection,
} from '@doorway/protocol';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = new RegExp('[\\x1B\\x1b]\\[[0-9;]*[a-zA-Z]', 'g');
function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

import {
  LiveAgentEvent,
  latestLaunchOptionsFromEvents,
  orchestrationLanesFromEvents,
  launchOptionLabels,
  evidenceCountLabel,
  latestTimestampedEvents,
  latestThreadEventsBySequence,
  evidenceFeedItems,
  diffPreviewFiles,
  latestInlineHandoffCapsules,
  handoffCapsuleMetadata,
  handoffChangedFilePreview,
  handoffNextPromptText,
  selectedWorktree,
  worktreeMergeScore,
  latestMergeReviewAssessments,
  latestApprovalReceipts,
  sortPeerMessagesByEvidenceTime,
  peerMessageKindLabel,
  peerMessageRouteLabel,
  latestTaskGraphs,
} from './App';
import { useHarnessState } from './HarnessContext';

export function SessionActivityCapsule({
  agentEvents,
  threadEvents,
}: {
  readonly agentEvents: readonly LiveAgentEvent[];
  readonly threadEvents: readonly DoorwayEvent[];
}) {
  let setActiveSurface: any = undefined;
  try {
    const context = useHarnessState();
    setActiveSurface = context.setActiveSurface;
  } catch {
    // Safe fallback for isolated unit tests
  }

  if (agentEvents.length === 0 && threadEvents.length === 0) {
    return null;
  }

  const launchOptions = latestLaunchOptionsFromEvents(threadEvents);
  const orchestrationLanes = orchestrationLanesFromEvents({ threadEvents, agentEvents });

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--session">
      <div className="message-meta">Doorway</div>
      <p>Current session evidence is attached to this thread.</p>
      <div className="orchestration-capsule">
        <div className="orchestration-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Doorway session activity</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              type="button" 
              onClick={() => setActiveSurface?.('terminal')}
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '500',
                cursor: 'pointer',
                color: '#111',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              Open CLI
            </button>
            <span className="orchestration-status">
              {agentEvents.length > 0 ? 'Live' : 'Recorded'}
            </span>
          </div>
        </div>
        {launchOptions && (
          <div className="orchestration-pills" aria-label="Launch options">
            {launchOptionLabels(launchOptions).map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        )}
        {orchestrationLanes.map((lane) => (
          <div className="orchestration-lane" key={lane.runId}>
            <div className="orchestration-lane__main">
              <div className="orchestration-lane__title">
                <strong>{lane.provider}</strong>
                <span>{lane.taskId}</span>
              </div>
              {lane.latestOutput ? <p>{lane.latestOutput}</p> : <p>{lane.runId}</p>}
            </div>
            <div className="orchestration-lane__meta">
              <small>{lane.status}</small>
              <small>{evidenceCountLabel(lane.evidenceCount, 'evidence')}</small>
              {lane.worktreeId && <small>{lane.worktreeId}</small>}
            </div>
          </div>
        ))}
        {latestTimestampedEvents(agentEvents, 3).map((event) => (
          <div className="agent-row" key={`${event.runId}-${event.timestamp}`}>
            <span>{event.type}</span>
            <small>{event.data}</small>
          </div>
        ))}
        {agentEvents.length === 0 &&
          orchestrationLanes.length === 0 &&
          latestThreadEventsBySequence(threadEvents, 3).map((event) => (
            <div className="agent-row" key={event.id}>
              <span>{event.type}</span>
              <small>sequence {event.sequence}</small>
            </div>
          ))}
      </div>
    </article>
  );
}

export function EvidenceFeedCapsule({ proofs }: { readonly proofs: readonly ProofProjection[] }) {
  const items = evidenceFeedItems(proofs);
  if (items.length === 0) {
    return null;
  }

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--evidence">
      <div className="message-meta">Doorway evidence</div>
      <div className="thread-evidence-list" aria-label="Thread evidence">
        {items.map((item) => (
          <div className="thread-evidence-row" key={item.id}>
            <span>{item.kind}</span>
            <strong>{item.status}</strong>
            <small>{item.title}</small>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

export function PeerMessagesCapsule({
  peerMessages,
}: {
  readonly peerMessages: readonly MeshMessageProjection[];
}) {
  const latest = sortPeerMessagesByEvidenceTime(peerMessages).slice(0, 3);
  if (latest.length === 0) {
    return null;
  }

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--evidence">
      <div className="message-meta">Agent Mesh</div>
      <div className="thread-evidence-list" aria-label="Agent Mesh messages">
        {latest.map((message) => (
          <div className="thread-evidence-row" key={message.id}>
            <span>{peerMessageKindLabel(message.kind)}</span>
            <strong>{message.status}</strong>
            <small>{peerMessageRouteLabel(message)}</small>
            <small>{message.content}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

export function CompactCheckpointCapsule({
  checkpoints,
}: {
  readonly checkpoints: readonly CompactCheckpointProjection[];
}) {
  const checkpoint = checkpoints[checkpoints.length - 1];
  if (!checkpoint) {
    return null;
  }

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--compact">
      <div className="message-meta">Compact checkpoint</div>
      <section className="compact-checkpoint" aria-label="Latest compact checkpoint">
        <div className="compact-checkpoint__head">
          <strong>{checkpoint.currentStatus.replace(/_/g, ' ')}</strong>
          <span>{checkpoint.originalGoal}</span>
        </div>
        <div className="compact-checkpoint__grid" aria-label="Compact checkpoint evidence">
          <span>{checkpoint.filesChanged.length} files</span>
          <span>{checkpoint.commandsRun.length} commands</span>
          <span>{checkpoint.tests.length} tests</span>
          <span>{checkpoint.errors.length} errors</span>
        </div>
        <p>{checkpoint.nextAction}</p>
      </section>
    </article>
  );
}

export function WarpBlockCapsule({
  terminalSession,
}: {
  readonly terminalSession: import('@doorway/protocol').TerminalProjection;
}) {
  if (!terminalSession) return null;

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--warp-block">
      <div className="message-meta">Warp Terminal Block</div>
      <div className="warp-block-header">
        <span className="warp-block-dir">{terminalSession.workingDirectory}</span>
        <code className="warp-block-cmd">{terminalSession.command || 'Process running...'}</code>
        <span className={`warp-block-status warp-block-status--${terminalSession.status}`}>
          {terminalSession.status}
        </span>
      </div>
      {terminalSession.lastOutput && (
        <div className="warp-block-output">
          <code>{stripAnsi(terminalSession.lastOutput).trim()}</code>
        </div>
      )}
      {terminalSession.exitClassification && (
        <div className="warp-block-exit" data-kind={terminalSession.exitClassification.kind}>
          <strong>{terminalSession.exitClassification.label}</strong>:{' '}
          {terminalSession.exitClassification.summary}
        </div>
      )}
    </article>
  );
}

export function DiffPreviewCapsule({ activeDiff }: { readonly activeDiff: DiffProjection | null }) {
  if (!activeDiff) {
    return null;
  }

  const files = diffPreviewFiles(activeDiff);
  if (files.length === 0) {
    return null;
  }

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--diff">
      <div className="message-meta">Changed files</div>
      <div className="diff-feed" aria-label="Changed files preview">
        <div className="diff-feed-summary">
          <strong>{files.length} files shown</strong>
          <span>
            +{activeDiff.totalAdditions} -{activeDiff.totalDeletions}
          </span>
        </div>
        {files.map((file) => (
          <div
            className="diff-feed-row"
            data-status={file.status}
            key={`${file.status}-${file.path}`}
          >
            <span>{file.status}</span>
            <strong>{file.path}</strong>
            <small>
              +{file.additions} -{file.deletions}
            </small>
          </div>
        ))}
      </div>
    </article>
  );
}

export function InlineHandoffCapsule({
  handoffCapsules,
}: {
  readonly handoffCapsules: readonly HandoffCapsuleProjection[];
}) {
  const capsules = latestInlineHandoffCapsules(handoffCapsules);
  if (capsules.length === 0) {
    return null;
  }

  return (
    <>
      {capsules.map((capsule) => {
        const metadata = handoffCapsuleMetadata(capsule);
        const changedFilePreview = handoffChangedFilePreview(capsule, 3);
        const nextPrompt = handoffNextPromptText(capsule);
        return (
          <article
            className="message-capsule message-capsule--doorway message-capsule--handoff"
            key={capsule.id}
          >
            <div className="message-meta">Handoff capsule</div>
            <div className="handoff-feed" aria-label="Latest handoff capsule">
              <div className="handoff-feed__header">
                <strong>{capsule.summary}</strong>
                <span>{capsule.testStatus ?? 'unverified'}</span>
              </div>
              {metadata.length > 0 && (
                <div className="handoff-feed__meta">
                  {metadata.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              )}
              <p>{capsule.latestIntent}</p>
              {changedFilePreview.files.length > 0 && (
                <div className="handoff-feed__files" aria-label="Handoff changed files">
                  {changedFilePreview.files.map((file) => (
                    <span key={file}>{file}</span>
                  ))}
                  {changedFilePreview.remaining > 0 && (
                    <span>{changedFilePreview.remaining} more files</span>
                  )}
                </div>
              )}
              {capsule.openQuestions.length > 0 && <small>{capsule.openQuestions[0]}</small>}
              {nextPrompt && <code>{nextPrompt}</code>}
            </div>
          </article>
        );
      })}
    </>
  );
}

export function ActiveWorktreeCapsule({
  worktrees,
  selectedWorktreePath,
  worktreeAssessments,
}: {
  readonly worktrees: readonly WorktreeProjection[];
  readonly selectedWorktreePath: string | null;
  readonly worktreeAssessments: ReadonlyMap<string, MergeAssessmentProjection>;
}) {
  const worktree = selectedWorktree(worktrees, selectedWorktreePath);
  if (!worktree) {
    return null;
  }

  const score = worktreeMergeScore(worktree, worktreeAssessments);

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--worktree">
      <div className="message-meta">Active worktree</div>
      <div className="worktree-feed" aria-label="Active worktree">
        <div className="worktree-feed__header">
          <strong>{worktree.branch}</strong>
          <span className={`merge-badge merge-badge--${score}`}>{score}</span>
        </div>
        <small>{worktree.path}</small>
        <div className="worktree-feed__meta">
          {worktree.status && <span>{worktree.status}</span>}
          {worktree.commit && <span>{worktree.commit}</span>}
          {worktree.isActive && <span>active</span>}
        </div>
      </div>
    </article>
  );
}

export function TaskGraphCapsule({
  taskGraphs,
  updateGraphNodeStatus,
}: {
  readonly taskGraphs: readonly TaskGraphProjection[];
  readonly updateGraphNodeStatus?: (
    nodeId: string,
    status: TaskNodeStatus
  ) => void | Promise<unknown>;
}) {
  const graphs = latestTaskGraphs(taskGraphs);
  if (graphs.length === 0) {
    return null;
  }

  return (
    <>
      {graphs.map((graph) => (
        <article
          className="message-capsule message-capsule--doorway message-capsule--task-graph"
          key={graph.id}
        >
          <div className="message-meta">Task graph</div>
          <div className="task-graph-feed" aria-label="Persisted task graph">
            <div className="task-graph-feed__header">
              <strong>{graph.goal}</strong>
              <span>{graph.status}</span>
              <span>{graph.mode}</span>
            </div>
            <div className="task-graph-feed__meta">
              <span>{graph.nodes.length} nodes</span>
              <span>{graph.edges.length} edges</span>
              <span>{graph.id}</span>
            </div>
            {graph.nodes.map((node) => (
              <div className="task-graph-node" data-status={node.status} key={node.id}>
                <span>{node.role}</span>
                <strong>{node.status}</strong>
                <small>{node.acceptanceCriteria ?? node.worktreePolicy}</small>
                {updateGraphNodeStatus && (
                  <div className="task-graph-node__actions">
                    {node.status !== 'running' && (
                      <button
                        type="button"
                        onClick={() => void updateGraphNodeStatus(node.id, 'running')}
                      >
                        Mark running
                      </button>
                    )}
                    {node.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => void updateGraphNodeStatus(node.id, 'completed')}
                      >
                        Mark done
                      </button>
                    )}
                    {node.status !== 'failed' && (
                      <button
                        type="button"
                        onClick={() => void updateGraphNodeStatus(node.id, 'failed')}
                      >
                        Mark failed
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </article>
      ))}
    </>
  );
}

export function MergeReviewCapsule({
  mergeAssessments,
}: {
  readonly mergeAssessments: readonly MergeAssessmentProjection[];
}) {
  const assessments = latestMergeReviewAssessments(mergeAssessments);
  if (assessments.length === 0) {
    return null;
  }

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--merge-review">
      <div className="message-meta">Merge review</div>
      <div className="merge-review-list" aria-label="Merge review history">
        {assessments.map((assessment) => (
          <div className="merge-review-row" data-score={assessment.score} key={assessment.id}>
            <div className="merge-review-row__header">
              <strong>{assessment.score}</strong>
              <span>{assessment.cleanApply ? 'Clean apply' : 'Apply risk'}</span>
              <span>{assessment.testsPassed ? 'Tests passed' : 'Tests not passed'}</span>
              <span>{assessment.hasApproval ? 'Approved' : 'Approval missing'}</span>
            </div>
            <p>{assessment.reason}</p>
            {assessment.highRiskFiles.length > 0 && (
              <small>{assessment.highRiskFiles.length} high-risk files</small>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

export function ApprovalHistoryCapsule({
  permissionReceipts,
}: {
  readonly permissionReceipts: readonly PermissionReceiptProjection[];
}) {
  const receipts = latestApprovalReceipts(permissionReceipts);
  if (receipts.length === 0) {
    return null;
  }

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--approval">
      <div className="message-meta">Approval history</div>
      <div className="approval-list" aria-label="Approval history">
        {receipts.map((receipt) => (
          <div className="approval-row" data-decision={receipt.decision} key={receipt.id}>
            <div>
              <strong>{receipt.decision}</strong>
              <span>{receipt.riskCategory}</span>
            </div>
            <small>{receipt.command}</small>
            {receipt.userNotes && <small>{receipt.userNotes}</small>}
          </div>
        ))}
      </div>
    </article>
  );
}

export function ResultCard({
  synthesis,
}: {
  readonly synthesis: import('@doorway/protocol').UnifiedThreadSynthesisCreatedPayload;
}) {
  if (!synthesis) return null;

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--result">
      <div className="message-meta">Agent Response Synthesis</div>
      <div className="result-card" aria-label="Result summary">
        <div className="result-card__header">
          <strong>Task Completed</strong>
          <span className="result-card__badge">{synthesis.agentCount} agent(s)</span>
        </div>
        <div className="result-card__body markdown-body">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: 'transparent', border: 'none', padding: 0, margin: 0 }}>
            {synthesis.summary}
          </pre>
        </div>
      </div>
    </article>
  );
}

export function PlanCard({
  graph,
}: {
  readonly graph: import('@doorway/protocol').TaskGraphProjection;
}) {
  if (!graph || graph.nodes.length === 0) return null;
  const completed = graph.nodes.filter((n) => n.status === 'completed').length;
  const total = graph.nodes.length;

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--plan">
      <div className="message-meta">Execution Plan</div>
      <div className="plan-card" aria-label="Execution plan">
        <div className="plan-card__header">
          <strong>{graph.goal}</strong>
          <span>{completed} / {total} tasks completed</span>
        </div>
        <div className="plan-card__nodes">
          {graph.nodes.map((node, i) => (
            <div className="plan-node" data-status={node.status} key={node.id}>
              <div className="plan-node__indicator" />
              <div className="plan-node__content">
                <strong>Step {i + 1}: {node.role}</strong>
                <small>{node.acceptanceCriteria || 'Execute task'}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
