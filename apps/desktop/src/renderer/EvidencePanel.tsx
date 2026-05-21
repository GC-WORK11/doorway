import React from 'react';
import type {
  DoorwayEvent,
  HandoffCapsuleProjection,
  MergeAssessmentProjection,
  MeshMessageProjection,
  PermissionReceiptProjection,
  ProofProjection,
  TerminalProjection,
} from '@doorway/protocol';
import * as App from './App';
import { DiffPatch } from './SurfaceControls';
import { EmptyState } from './shared-ui';
import { ProcessTreePanel } from './ProcessTreePanel';
import { FileDeltaPanel } from './FileDeltaPanel';
import { ExitTaxonomyPanel } from './ExitTaxonomyPanel';

type HandoffUsageFilter = 'all' | 'used' | 'unused';
type ProofStatusFilter = 'all' | 'pass' | 'fail';
type MergeScoreFilter = 'all' | 'ready' | 'reviewable' | 'risky' | 'blocked';
type PermissionDecisionFilter = 'all' | 'approved' | 'denied';

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

function EvidenceSection({
  title,
  countLabel,
  children,
}: {
  readonly title: string;
  readonly countLabel: string;
  readonly children: React.ReactNode;
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

function peerMessageStateLabel(message: MeshMessageProjection): string {
  return message.requiresHumanApproval ? `${message.status} · human approval` : message.status;
}

export function EvidencePanel({
  loading,
  hasActiveThread,
  selectedWorktreePath,
  provider,
  handoffCapsules,
  filteredHandoffCapsules,
  handoffCopyEvents,
  filteredMergeAssessments,
  filteredPermissionReceipts,
  filteredProofs,
  mergeAssessments,
  permissionReceipts,
  peerMessages,
  proofs,
  terminalSessions,
  threadEvents,
  browserActions,
  threadReplayVerification,
  browserProofBlocked,
  browserProofBlockedReason,
  handoffFilter,
  proofFilter,
  mergeFilter,
  permissionFilter,
  setHandoffFilter,
  setProofFilter,
  setMergeFilter,
  setPermissionFilter,
  createHandoff,
  copyText,
  exportThreadReplay,
  exportBrowserEvidence,
  openPath,
}: {
  readonly loading: boolean;
  readonly hasActiveThread: boolean;
  readonly selectedWorktreePath: string | null;
  readonly provider: string;
  readonly handoffCapsules: readonly HandoffCapsuleProjection[];
  readonly filteredHandoffCapsules: readonly HandoffCapsuleProjection[];
  readonly handoffCopyEvents: readonly DoorwayEvent[];
  readonly filteredMergeAssessments: readonly MergeAssessmentProjection[];
  readonly filteredPermissionReceipts: readonly PermissionReceiptProjection[];
  readonly filteredProofs: readonly ProofProjection[];
  readonly mergeAssessments: readonly MergeAssessmentProjection[];
  readonly permissionReceipts: readonly PermissionReceiptProjection[];
  readonly peerMessages: readonly MeshMessageProjection[];
  readonly proofs: readonly ProofProjection[];
  readonly terminalSessions: readonly TerminalProjection[];
  readonly threadEvents: readonly DoorwayEvent[];
  readonly browserActions: readonly {
    readonly timestamp: Date;
    readonly type: string;
    readonly selector?: string;
    readonly text?: string;
    readonly url?: string;
    readonly screenshot?: string;
  }[];
  readonly threadReplayVerification: {
    readonly path: string;
    readonly eventCount: number;
    readonly firstSequence: number | null;
    readonly lastSequence: number | null;
    readonly threadIds: readonly string[];
  } | null;
  readonly browserProofBlocked: boolean;
  readonly browserProofBlockedReason: string | undefined;
  readonly handoffFilter: HandoffUsageFilter;
  readonly proofFilter: ProofStatusFilter;
  readonly mergeFilter: MergeScoreFilter;
  readonly permissionFilter: PermissionDecisionFilter;
  readonly setHandoffFilter: (filter: HandoffUsageFilter) => void;
  readonly setProofFilter: (filter: ProofStatusFilter) => void;
  readonly setMergeFilter: (filter: MergeScoreFilter) => void;
  readonly setPermissionFilter: (filter: PermissionDecisionFilter) => void;
  readonly createHandoff: (
    worktreePath: string | undefined,
    provider: string
  ) => void | Promise<unknown>;
  readonly copyText: (text: string, metadata: EvidenceActionMetadata) => void | Promise<unknown>;
  readonly exportThreadReplay: () => void | Promise<unknown>;
  readonly exportBrowserEvidence: () => void | Promise<unknown>;
  readonly openPath: (path: string, metadata?: EvidenceActionMetadata) => void | Promise<unknown>;
}) {
  const replayLines = App.replayPreviewEvents(threadEvents);
  const replayText = App.replayJsonl(threadEvents);
  const diffEvents = App.diffUpdatedEvents(threadEvents);
  const mergeEvents = App.mergeLifecycleEvents(threadEvents);
  const terminalEvents = App.terminalEvidenceEvents(threadEvents);
  const terminalPreviewEvents = App.terminalEvidencePreview(threadEvents);
  const testEvents = App.testLifecycleEvents(threadEvents);
  const approvalEvents = App.approvalTimelineEvents(threadEvents);
  const agentEvents = App.agentLifecycleEvents(threadEvents);
  const worktreeEvents = App.worktreeSafetyEvents(threadEvents);
  const handoffCreatedEvents = App.handoffCreationEvents(threadEvents);
  const browserBundleExportedEvents = App.browserBundleExportEvents(threadEvents);
  const replayExportedEvents = App.threadReplayExportEvents(threadEvents);
  const replayVerificationFailureEvents = App.threadReplayVerificationFailureEvents(threadEvents);
  const replayVerificationSuccessEvents = App.threadReplayVerificationSuccessEvents(threadEvents);
  const browserTimelineEvents = App.browserActionEvents(threadEvents);
  const messageEvents = App.messageAppendedEvents(threadEvents);
  const threadLifecycleTimelineEvents = App.threadLifecycleEvents(threadEvents);
  const graphUpdateEvents = App.taskGraphUpdateEvents(threadEvents);
  const sortedPeerMessages = App.sortPeerMessagesByEvidenceTime(peerMessages);
  const browserPreviewActions = App.browserEvidencePreview(browserActions);
  const browserBundle = App.browserEvidenceBundle(browserActions);
  const browserExportTitle = browserProofBlocked ? browserProofBlockedReason : undefined;

  return (
    <div className="evidence-list">
      <button
        className="review-action"
        type="button"
        disabled={loading || !hasActiveThread}
        onClick={() => void createHandoff(selectedWorktreePath ?? undefined, provider)}
      >
        Generate handoff
      </button>
      {handoffCapsules.length > 0 && (
        <EvidenceSection
          title="Handoffs"
          countLabel={App.evidenceCountLabel(filteredHandoffCapsules.length, 'capsule')}
        >
          <div className="evidence-filter" aria-label="Handoff usage filter">
            {handoffUsageFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={handoffFilter === filter}
                onClick={() => setHandoffFilter(filter)}
              >
                {handoffUsageFilterLabels[filter]}
              </button>
            ))}
          </div>
          {filteredHandoffCapsules.map((capsule) => {
            const metadata = App.handoffCapsuleMetadata(capsule);
            const nextPrompt = App.handoffNextPromptText(capsule);
            const latestUsageEvent = App.latestHandoffUsedEventForCapsule(threadEvents, capsule);
            const copiedLabel = App.handoffCopiedInlineLabel(latestUsageEvent);
            const latestActivityLabel = App.latestHandoffActivityLabel(latestUsageEvent);
            const usageCountLabel = App.handoffUsageCountLabel(threadEvents, capsule);
            const usageBreakdownLabels = App.handoffUsageBreakdownLabels(threadEvents, capsule);
            const latestOpenTarget = App.latestHandoffOpenTargetForCapsule(threadEvents, capsule);
            const worktreeOpenPath = App.handoffWorktreeOpenPath(capsule);
            const changedFilePreview = App.handoffChangedFilePreview(capsule);

            return (
              <div className="evidence-card" key={capsule.id}>
                <strong>Handoff capsule</strong>
                <span>{capsule.summary}</span>
                {(metadata.length > 0 || copiedLabel || usageCountLabel) && (
                  <div className="evidence-card__meta">
                    {metadata.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                    {usageCountLabel && <span>{usageCountLabel}</span>}
                    {usageBreakdownLabels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                    {copiedLabel && <span>{copiedLabel}</span>}
                  </div>
                )}
                {latestActivityLabel && (
                  <div className="evidence-card__activity">{latestActivityLabel}</div>
                )}
                {changedFilePreview.files.length > 0 && (
                  <div className="evidence-card__files" aria-label="Changed files">
                    {changedFilePreview.files.map((file) => {
                      const changedFileOpenPath = App.handoffChangedFileOpenPath(capsule, file);
                      return changedFileOpenPath ? (
                        <button
                          key={file}
                          type="button"
                          onClick={() =>
                            void openPath(changedFileOpenPath, {
                              threadId: capsule.threadId,
                              capsuleId: capsule.id,
                              ...(worktreeOpenPath ? { worktreePath: worktreeOpenPath } : {}),
                              filePath: file,
                            })
                          }
                        >
                          {file}
                        </button>
                      ) : (
                        <span key={file}>{file}</span>
                      );
                    })}
                    {changedFilePreview.remaining > 0 && (
                      <span>{changedFilePreview.remaining} more files</span>
                    )}
                  </div>
                )}
                <button
                  className="evidence-card__action"
                  type="button"
                  disabled={!nextPrompt}
                  onClick={() =>
                    void copyText(nextPrompt, {
                      threadId: capsule.threadId,
                      capsuleId: capsule.id,
                    })
                  }
                >
                  Copy next prompt
                </button>
                {worktreeOpenPath && (
                  <button
                    className="evidence-card__action"
                    type="button"
                    onClick={() =>
                      void openPath(worktreeOpenPath, {
                        threadId: capsule.threadId,
                        capsuleId: capsule.id,
                      })
                    }
                  >
                    Open worktree
                  </button>
                )}
                {latestOpenTarget && (
                  <div className="evidence-card__latest-open">
                    <button
                      className="evidence-card__action evidence-card__action--quiet"
                      type="button"
                      onClick={() =>
                        void openPath(latestOpenTarget.path, {
                          threadId: capsule.threadId,
                          capsuleId: capsule.id,
                          ...(latestOpenTarget.worktreePath
                            ? { worktreePath: latestOpenTarget.worktreePath }
                            : {}),
                          ...(latestOpenTarget.filePath
                            ? { filePath: latestOpenTarget.filePath }
                            : {}),
                        })
                      }
                    >
                      {latestOpenTarget.label}
                    </button>
                    <span>{latestOpenTarget.target}</span>
                  </div>
                )}
              </div>
            );
          })}
          {filteredHandoffCapsules.length === 0 && (
            <EmptyState
              title={`No ${handoffUsageFilterLabels[handoffFilter].toLowerCase()} handoffs`}
              body="The current thread has no handoff capsules in this usage state."
            />
          )}
        </EvidenceSection>
      )}
      {handoffCopyEvents.length > 0 && (
        <EvidenceSection
          title="Handoff Usage"
          countLabel={App.evidenceCountLabel(handoffCopyEvents.length, 'copy')}
        >
          {handoffCopyEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>Next prompt copied</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.handoffUsedEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {handoffCreatedEvents.length > 0 && (
        <EvidenceSection
          title="Handoff Timeline"
          countLabel={App.evidenceCountLabel(handoffCreatedEvents.length, 'event')}
        >
          {handoffCreatedEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>Handoff created</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.handoffCreationEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {peerMessages.length > 0 && (
        <EvidenceSection
          title="Agent Mesh"
          countLabel={App.evidenceCountLabel(peerMessages.length, 'message')}
        >
          {sortedPeerMessages.map((message) => (
            <div className="evidence-card" key={message.id}>
              <strong>{App.peerMessageKindLabel(message.kind)}</strong>
              <div className="evidence-card__meta">
                <span>{App.peerMessageRouteLabel(message)}</span>
                <span>{peerMessageStateLabel(message)}</span>
                <span>{App.evidenceTimestampLabel(message.createdAt)}</span>
              </div>
              <span>{message.content}</span>
              {message.evidenceRefs.length > 0 && (
                <div className="evidence-card__meta" aria-label="Peer message evidence refs">
                  {message.evidenceRefs.map((ref) => (
                    <span key={ref}>{ref}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </EvidenceSection>
      )}
      {mergeAssessments.length > 0 && (
        <EvidenceSection
          title="Merge Review"
          countLabel={App.evidenceCountLabel(filteredMergeAssessments.length, 'assessment')}
        >
          <div className="evidence-filter" aria-label="Merge score filter">
            {mergeScoreFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={mergeFilter === filter}
                onClick={() => setMergeFilter(filter)}
              >
                {mergeScoreFilterLabels[filter]}
              </button>
            ))}
          </div>
          {filteredMergeAssessments.map((assessment) => (
            <div className="evidence-card" key={assessment.id}>
              <strong>MergeJudge {assessment.score}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(assessment.createdAt)}</span>
              </div>
              <span>{assessment.reason}</span>
            </div>
          ))}
          {filteredMergeAssessments.length === 0 && (
            <EmptyState
              title={`No ${mergeScoreFilterLabels[mergeFilter].toLowerCase()} assessments`}
              body="The current thread has no MergeJudge assessments with this score."
            />
          )}
        </EvidenceSection>
      )}
      {permissionReceipts.length > 0 && (
        <EvidenceSection
          title="Permissions"
          countLabel={App.evidenceCountLabel(filteredPermissionReceipts.length, 'receipt')}
        >
          <div className="evidence-filter" aria-label="Permission decision filter">
            {permissionDecisionFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={permissionFilter === filter}
                onClick={() => setPermissionFilter(filter)}
              >
                {permissionDecisionFilterLabels[filter]}
              </button>
            ))}
          </div>
          {filteredPermissionReceipts.map((receipt) => (
            <div className="evidence-card" key={receipt.id}>
              <strong>Permission {receipt.decision}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(receipt.timestamp)}</span>
              </div>
              <span>{receipt.command}</span>
            </div>
          ))}
          {filteredPermissionReceipts.length === 0 && (
            <EmptyState
              title={`No ${permissionDecisionFilterLabels[permissionFilter].toLowerCase()} receipts`}
              body="The current thread has no permission receipts with this decision."
            />
          )}
        </EvidenceSection>
      )}
      {proofs.length > 0 && (
        <EvidenceSection
          title="Proofs"
          countLabel={App.evidenceCountLabel(filteredProofs.length, 'proof')}
        >
          <div className="evidence-filter" aria-label="Proof status filter">
            {proofStatusFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={proofFilter === filter}
                onClick={() => setProofFilter(filter)}
              >
                {proofStatusFilterLabels[filter]}
              </button>
            ))}
          </div>
          {filteredProofs.map((proof) => (
            <div className="evidence-card" key={proof.id}>
              <strong>{proof.label}</strong>
              <div className="evidence-card__meta">
                <span>{proof.status}</span>
                <span>{App.evidenceTimestampLabel(proof.finishedAt ?? proof.startedAt)}</span>
              </div>
              <span>{proof.summary}</span>
            </div>
          ))}
          {filteredProofs.length === 0 && (
            <EmptyState
              title={`No ${proofStatusFilterLabels[proofFilter].toLowerCase()} proofs`}
              body="The current thread has no proof records in this status."
            />
          )}
        </EvidenceSection>
      )}
      {threadEvents.length > 0 && (
        <EvidenceSection
          title="Replay"
          countLabel={App.evidenceCountLabel(threadEvents.length, 'event')}
        >
          <div className="evidence-card evidence-card--replay">
            <strong>Thread event JSONL</strong>
            <div className="evidence-card__meta">
              <span>{threadEvents.length} persisted events</span>
              <span>{replayLines.length} preview lines</span>
            </div>
            <pre className="replay-jsonl" aria-label="Thread replay JSONL">
              {replayLines.map(App.replayEventJsonLine).join('\n')}
            </pre>
            <button
              className="evidence-card__action"
              type="button"
              onClick={() => void copyText(replayText, {})}
            >
              Copy JSONL
            </button>
            <button
              className="evidence-card__action"
              type="button"
              onClick={() => void exportThreadReplay()}
            >
              Export JSONL
            </button>
            {threadReplayVerification && (
              <>
                <div className="review-checks" aria-label="Replay verification">
                  <span>{threadReplayVerification.eventCount} verified events</span>
                  <span>
                    seq {threadReplayVerification.firstSequence ?? '-'}-
                    {threadReplayVerification.lastSequence ?? '-'}
                  </span>
                  <span>{threadReplayVerification.threadIds.join(', ')}</span>
                </div>
                <button
                  className="evidence-card__action"
                  type="button"
                  onClick={() => void openPath(threadReplayVerification.path, {})}
                >
                  Open JSONL
                </button>
              </>
            )}
          </div>
        </EvidenceSection>
      )}
      {replayExportedEvents.length > 0 && (
        <EvidenceSection
          title="Replay Exports"
          countLabel={App.evidenceCountLabel(replayExportedEvents.length, 'event')}
        >
          {replayExportedEvents.map((event) => {
            const payload = event.payload as { readonly path?: string };
            return (
              <div className="evidence-card" key={event.id}>
                <strong>Replay exported</strong>
                <div className="evidence-card__meta">
                  <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
                </div>
                <span>{App.threadReplayExportEventLabel(event)}</span>
                {payload.path && (
                  <button
                    className="evidence-card__action"
                    type="button"
                    onClick={() => void openPath(payload.path ?? '', {})}
                  >
                    Open JSONL
                  </button>
                )}
              </div>
            );
          })}
        </EvidenceSection>
      )}
      {replayVerificationFailureEvents.length > 0 && (
        <EvidenceSection
          title="Replay Verification"
          countLabel={App.evidenceCountLabel(replayVerificationFailureEvents.length, 'event')}
        >
          {replayVerificationFailureEvents.map((event) => {
            const payload = event.payload as { readonly path?: string };
            return (
              <div className="evidence-card" key={event.id}>
                <strong>Replay verification failed</strong>
                <div className="evidence-card__meta">
                  <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
                </div>
                <span>{App.threadReplayVerificationFailureEventLabel(event)}</span>
                {payload.path && (
                  <button
                    className="evidence-card__action"
                    type="button"
                    onClick={() => void openPath(payload.path ?? '', {})}
                  >
                    Open JSONL
                  </button>
                )}
              </div>
            );
          })}
        </EvidenceSection>
      )}
      {replayVerificationSuccessEvents.length > 0 && (
        <EvidenceSection
          title="Replay Verified"
          countLabel={App.evidenceCountLabel(replayVerificationSuccessEvents.length, 'event')}
        >
          {replayVerificationSuccessEvents.map((event) => {
            const payload = event.payload as { readonly path?: string };
            return (
              <div className="evidence-card" key={event.id}>
                <strong>Replay verification passed</strong>
                <div className="evidence-card__meta">
                  <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
                </div>
                <span>{App.threadReplayVerificationSuccessEventLabel(event)}</span>
                {payload.path && (
                  <button
                    className="evidence-card__action"
                    type="button"
                    onClick={() => void openPath(payload.path ?? '', {})}
                  >
                    Open JSONL
                  </button>
                )}
              </div>
            );
          })}
        </EvidenceSection>
      )}
      {threadLifecycleTimelineEvents.length > 0 && (
        <EvidenceSection
          title="Thread Lifecycle"
          countLabel={App.evidenceCountLabel(threadLifecycleTimelineEvents.length, 'event')}
        >
          {threadLifecycleTimelineEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>{App.threadLifecycleEventLabel(event)}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.threadLifecycleEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {messageEvents.length > 0 && (
        <EvidenceSection
          title="Message Timeline"
          countLabel={App.evidenceCountLabel(messageEvents.length, 'event')}
        >
          {messageEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>Message appended</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.messageAppendedEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {terminalEvents.length > 0 && (
        <EvidenceSection
          title="Terminal Timeline"
          countLabel={App.evidenceCountLabel(terminalEvents.length, 'event')}
        >
          {terminalPreviewEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>{App.terminalEvidenceEventLabel(event)}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.terminalEvidenceEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {terminalSessions.length > 0 && (
        <EvidenceSection
          title="Process Trees"
          countLabel={App.evidenceCountLabel(
            terminalSessions.filter((s) => s.latestProcessSnapshot?.nodes.length).length,
            'snapshot'
          )}
        >
          <ProcessTreePanel terminalSessions={terminalSessions} />
        </EvidenceSection>
      )}
      {terminalSessions.length > 0 && (
        <EvidenceSection
          title="File Deltas"
          countLabel={App.evidenceCountLabel(
            terminalSessions.filter((s) => s.latestFileDeltaSnapshot?.changes.length).length,
            'snapshot'
          )}
        >
          <FileDeltaPanel terminalSessions={terminalSessions} />
        </EvidenceSection>
      )}
      {terminalSessions.length > 0 && (
        <EvidenceSection
          title="Exit Taxonomy"
          countLabel={App.evidenceCountLabel(
            terminalSessions.filter((s) => s.exitClassification).length,
            'exit'
          )}
        >
          <ExitTaxonomyPanel terminalSessions={terminalSessions} />
        </EvidenceSection>
      )}
      {testEvents.length > 0 && (
        <EvidenceSection
          title="Test Timeline"
          countLabel={App.evidenceCountLabel(testEvents.length, 'event')}
        >
          {testEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>{App.testLifecycleEventLabel(event)}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.testLifecycleEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {approvalEvents.length > 0 && (
        <EvidenceSection
          title="Approval Timeline"
          countLabel={App.evidenceCountLabel(approvalEvents.length, 'event')}
        >
          {approvalEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>{App.approvalTimelineEventLabel(event)}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.approvalTimelineEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {agentEvents.length > 0 && (
        <EvidenceSection
          title="Agent Timeline"
          countLabel={App.evidenceCountLabel(agentEvents.length, 'event')}
        >
          {agentEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>{App.agentLifecycleEventLabel(event)}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.agentLifecycleEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {graphUpdateEvents.length > 0 && (
        <EvidenceSection
          title="Task Graph Timeline"
          countLabel={App.evidenceCountLabel(graphUpdateEvents.length, 'event')}
        >
          {graphUpdateEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>Task graph updated</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.taskGraphUpdateEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {worktreeEvents.length > 0 && (
        <EvidenceSection
          title="Worktree Safety Timeline"
          countLabel={App.evidenceCountLabel(worktreeEvents.length, 'event')}
        >
          {worktreeEvents.map((event) => {
            const payload = event.payload as { readonly path?: string };
            return (
              <div className="evidence-card" key={event.id}>
                <strong>{App.worktreeSafetyEventLabel(event)}</strong>
                <div className="evidence-card__meta">
                  <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
                </div>
                <span>{App.worktreeSafetyEventLabel(event)}</span>
                {event.type === 'worktree.rollback_patch_exported' && payload.path && (
                  <button
                    className="evidence-card__action"
                    type="button"
                    onClick={() => void openPath(payload.path ?? '', {})}
                  >
                    Open rollback patch
                  </button>
                )}
              </div>
            );
          })}
        </EvidenceSection>
      )}
      {diffEvents.length > 0 && (
        <EvidenceSection
          title="Worktree Diff Loads"
          countLabel={App.evidenceCountLabel(diffEvents.length, 'event')}
        >
          {diffEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>Diff opened</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.diffUpdatedEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {mergeEvents.length > 0 && (
        <EvidenceSection
          title="Merge Timeline"
          countLabel={App.evidenceCountLabel(mergeEvents.length, 'event')}
        >
          {mergeEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>{App.mergeLifecycleEventLabel(event)}</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{event.type}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {browserBundle.length > 0 && (
        <EvidenceSection
          title="Browser evidence bundle"
          countLabel={App.evidenceCountLabel(browserPreviewActions.length, 'action')}
        >
          <div className="evidence-card evidence-card--browser">
            <div className="browser-evidence-list" aria-label="Browser evidence preview">
              {browserPreviewActions.map((action, index) => (
                <div
                  className="browser-evidence-row"
                  key={`${action.timestamp.toISOString()}-${index}`}
                >
                  <span>{action.type}</span>
                  <strong>{App.browserEvidenceActionLabel(action)}</strong>
                  <small>{action.selector ?? action.url ?? action.text ?? 'screenshot only'}</small>
                </div>
              ))}
            </div>
            <button
              className="evidence-card__action"
              type="button"
              onClick={() => void copyText(browserBundle, {})}
            >
              Copy browser bundle
            </button>
            {browserProofBlocked && browserProofBlockedReason && (
              <div className="browser-policy-status" aria-label="Browser proof policy">
                <span data-tone="blocked">{browserProofBlockedReason}</span>
              </div>
            )}
            <button
              className="evidence-card__action"
              type="button"
              disabled={!hasActiveThread || browserProofBlocked}
              title={browserExportTitle}
              onClick={() => void exportBrowserEvidence()}
            >
              Export browser bundle
            </button>
          </div>
        </EvidenceSection>
      )}
      {browserTimelineEvents.length > 0 && (
        <EvidenceSection
          title="Browser Action Timeline"
          countLabel={App.evidenceCountLabel(browserTimelineEvents.length, 'event')}
        >
          {browserTimelineEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>Browser action recorded</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.browserActionEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {browserBundleExportedEvents.length > 0 && (
        <EvidenceSection
          title="Browser Export Timeline"
          countLabel={App.evidenceCountLabel(browserBundleExportedEvents.length, 'event')}
        >
          {browserBundleExportedEvents.map((event) => (
            <div className="evidence-card" key={event.id}>
              <strong>Browser bundle exported</strong>
              <div className="evidence-card__meta">
                <span>{App.evidenceTimestampLabel(event.timestamp)}</span>
              </div>
              <span>{App.browserBundleExportEventLabel(event)}</span>
            </div>
          ))}
        </EvidenceSection>
      )}
      {!handoffCapsules.length &&
        !mergeAssessments.length &&
        !permissionReceipts.length &&
        !proofs.length &&
        !peerMessages.length &&
        !handoffCopyEvents.length &&
        !threadEvents.length &&
        !browserActions.length && (
          <EmptyState
            title="No evidence recorded"
            body="Terminal, diff, permission, proof, and handoff evidence appears here after real runs."
          />
        )}
    </div>
  );
}
