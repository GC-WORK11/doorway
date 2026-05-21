import React from 'react';
import type { TerminalProjection } from '@doorway/protocol';
import { EmptyState } from './shared-ui';

export function FileDeltaPanel({
  terminalSessions,
}: {
  readonly terminalSessions: readonly TerminalProjection[];
}) {
  const sessionsWithDeltas = terminalSessions.filter(
    (session) =>
      session.latestFileDeltaSnapshot && session.latestFileDeltaSnapshot.changes.length > 0
  );

  if (sessionsWithDeltas.length === 0) {
    return (
      <EmptyState
        title="No file deltas"
        body="No file system changes have been captured for this thread's terminal sessions."
      />
    );
  }

  return (
    <div className="file-delta-panel">
      {sessionsWithDeltas.map((session) => (
        <div key={session.id} className="evidence-card">
          <strong>File Delta</strong>
          <div className="evidence-card__meta">
            <span>Session {session.id.slice(-6)}</span>
            <span>{session.latestFileDeltaSnapshot?.phase}</span>
          </div>
          <ol className="file-delta-list">
            {session.latestFileDeltaSnapshot?.changes.map((change) => (
              <li key={`${change.changeType}-${change.path}`}>
                <span>{change.changeType}</span>
                <code>{change.path}</code>
                <small>
                  {change.previousSize === undefined && change.currentSize === undefined
                    ? 'unknown'
                    : `${change.previousSize ?? '-'} -> ${change.currentSize ?? '-'}`}
                </small>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
