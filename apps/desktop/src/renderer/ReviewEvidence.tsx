import React from 'react';
import type {
  DiffProjection,
  DoorwayEvent,
  MergeAssessmentProjection,
  PermissionReceiptProjection,
  ProofProjection,
} from '@doorway/protocol';
import { DiffPatch } from './SurfaceControls';
import {
  browserEvidenceActionLabel,
  browserEvidencePreview,
  diffPreviewFiles,
  evidenceTimestampLabel,
  latestApprovalReceipts,
  latestReplayVerificationEvent,
  reversePatchPreview,
  rollbackPreviewFiles,
  sortMergeAssessmentsByEvidenceTime,
  sortProofsByEvidenceTime,
  threadReplayVerificationFailureEventLabel,
  threadReplayVerificationSuccessEventLabel,
} from './App';

export function ReviewEvidence({
  activeDiff = null,
  browserActions = [],
  mergeAssessments,
  permissionReceipts = [],
  proofs,
  threadEvents = [],
}: {
  readonly activeDiff?: DiffProjection | null;
  readonly browserActions?: readonly {
    readonly timestamp: Date;
    readonly type: string;
    readonly selector?: string;
    readonly text?: string;
    readonly url?: string;
    readonly screenshot?: string;
  }[];
  readonly mergeAssessments: readonly MergeAssessmentProjection[];
  readonly permissionReceipts?: readonly PermissionReceiptProjection[];
  readonly proofs: readonly ProofProjection[];
  readonly threadEvents?: readonly DoorwayEvent[];
}) {
  const recentPermissions = latestApprovalReceipts(permissionReceipts, 3);
  const recentBrowserActions = browserEvidencePreview(browserActions, 3);
  const diffFiles = activeDiff ? diffPreviewFiles(activeDiff, 3) : [];
  const rollbackFiles = activeDiff ? rollbackPreviewFiles(activeDiff) : [];
  const hasDiffEvidence = activeDiff !== null && diffFiles.length > 0;
  const hasRollbackPreview = rollbackFiles.length > 0;
  const latestReplayEvent = latestReplayVerificationEvent(threadEvents);

  if (
    mergeAssessments.length === 0 &&
    proofs.length === 0 &&
    recentPermissions.length === 0 &&
    recentBrowserActions.length === 0 &&
    !latestReplayEvent &&
    !hasDiffEvidence &&
    !hasRollbackPreview
  ) {
    return (
      <div className="review-evidence review-evidence--empty">
        <strong>No review evidence recorded</strong>
        <span>MergeJudge assessments and test proofs appear here after real runs record them.</span>
      </div>
    );
  }

  return (
    <section className="review-evidence" aria-label="Review evidence">
      {sortMergeAssessmentsByEvidenceTime(mergeAssessments)
        .slice(0, 3)
        .map((assessment) => (
          <article className="review-card" key={assessment.id}>
            <div className="review-card__header">
              <strong>MergeJudge {assessment.score}</strong>
              <span>{assessment.testsPassed ? 'tests passed' : 'tests not passed'}</span>
            </div>
            <p>{assessment.reason}</p>
            <div className="review-checks">
              <span>{assessment.cleanApply ? 'Clean apply' : 'Apply risk'}</span>
              <span>{assessment.hasApproval ? 'Approved' : 'Approval missing'}</span>
              {assessment.highRiskFiles.length > 0 && (
                <span>{assessment.highRiskFiles.length} high-risk files</span>
              )}
            </div>
          </article>
        ))}
      {sortProofsByEvidenceTime(proofs)
        .slice(0, 3)
        .map((proof) => (
          <article className="review-card" key={proof.id}>
            <div className="review-card__header">
              <strong>{proof.label}</strong>
              <span>{proof.status}</span>
            </div>
            {proof.command && <code>{proof.command}</code>}
            {proof.summary && <p>{proof.summary}</p>}
          </article>
        ))}
      {recentPermissions.map((receipt) => (
        <article className="review-card" key={receipt.id}>
          <div className="review-card__header">
            <strong>Permission {receipt.decision}</strong>
            <span>{receipt.riskCategory}</span>
          </div>
          <code>{receipt.command}</code>
          {receipt.userNotes && <p>{receipt.userNotes}</p>}
        </article>
      ))}
      {latestReplayEvent && (
        <article className="review-card">
          <div className="review-card__header">
            <strong>
              Replay verification{' '}
              {latestReplayEvent.type === 'thread.replay_verification_succeeded'
                ? 'passed'
                : 'failed'}
            </strong>
            <span>{evidenceTimestampLabel(latestReplayEvent.timestamp)}</span>
          </div>
          <p>
            {latestReplayEvent.type === 'thread.replay_verification_succeeded'
              ? threadReplayVerificationSuccessEventLabel(latestReplayEvent)
              : threadReplayVerificationFailureEventLabel(latestReplayEvent)}
          </p>
        </article>
      )}
      {hasDiffEvidence && (
        <article className="review-card">
          <div className="review-card__header">
            <strong>Diff evidence</strong>
            <span>
              +{activeDiff.totalAdditions} -{activeDiff.totalDeletions}
            </span>
          </div>
          <div className="review-checks">
            {diffFiles.map((file) => (
              <span key={file.path}>{file.path}</span>
            ))}
          </div>
        </article>
      )}
      {hasRollbackPreview && (
        <article className="review-card">
          <div className="review-card__header">
            <strong>Rollback preview</strong>
            <span>{rollbackFiles.length} files</span>
          </div>
          {rollbackFiles.map((file) => (
            <div className="rollback-preview" key={file.path}>
              <code>{file.path}</code>
              <DiffPatch patch={reversePatchPreview(file.patch ?? '')} />
            </div>
          ))}
        </article>
      )}
      {recentBrowserActions.map((action, index) => (
        <article className="review-card" key={`${action.timestamp.toISOString()}-${index}`}>
          <div className="review-card__header">
            <strong>Browser proof</strong>
            <span>{action.type}</span>
          </div>
          <p>{browserEvidenceActionLabel(action)}</p>
        </article>
      ))}
    </section>
  );
}
