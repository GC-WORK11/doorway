import React from 'react';
import type { PermissionDecision } from '@doorway/protocol';

export interface LivePermissionRequest {
  readonly sourceEventId: string;
  readonly runId?: string;
  readonly sessionId?: string;
  readonly command: string;
  readonly riskCategory: string;
  readonly reason: string;
  readonly evidence: string;
  readonly requestedAt: Date;
}

export function LivePermissionModal({
  request,
  loading,
  onDecide,
}: {
  readonly request: LivePermissionRequest;
  readonly loading: boolean;
  readonly onDecide: (
    decision: PermissionDecision,
    request: LivePermissionRequest
  ) => void | Promise<unknown>;
}) {
  return (
    <div className="live-permission-backdrop" role="presentation">
      <section
        className="live-permission-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Live permission request"
      >
        <header className="live-permission-modal__header">
          <div>
            <span className="section-label">Permission</span>
            <h2>Worker needs approval</h2>
          </div>
          <span className="live-permission-modal__risk">{request.riskCategory}</span>
        </header>
        <p className="live-permission-modal__reason">{request.reason}</p>
        <dl className="live-permission-modal__meta">
          {request.runId && (
            <>
              <dt>Run</dt>
              <dd>{request.runId}</dd>
            </>
          )}
          {request.sessionId && (
            <>
              <dt>Session</dt>
              <dd>{request.sessionId}</dd>
            </>
          )}
          <dt>Requested</dt>
          <dd>{request.requestedAt.toISOString()}</dd>
        </dl>
        <div className="live-permission-modal__evidence" aria-label="Permission evidence">
          <span>Evidence</span>
          <code>{request.evidence}</code>
        </div>
        <footer className="live-permission-modal__actions">
          <button
            type="button"
            className="live-permission-modal__deny"
            disabled={loading}
            onClick={() => void onDecide('denied', request)}
          >
            Deny
          </button>
          <button
            type="button"
            className="live-permission-modal__allow"
            disabled={loading}
            onClick={() => void onDecide('approved', request)}
          >
            Allow
          </button>
        </footer>
      </section>
    </div>
  );
}
