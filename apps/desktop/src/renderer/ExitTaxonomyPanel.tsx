import React from 'react';
import type { TerminalProjection } from '@doorway/protocol';
import { EmptyState } from './shared-ui';

export function ExitTaxonomyPanel({
  terminalSessions,
}: {
  readonly terminalSessions: readonly TerminalProjection[];
}) {
  const sessionsWithExits = terminalSessions.filter((session) => session.exitClassification);

  if (sessionsWithExits.length === 0) {
    return (
      <EmptyState
        title="No terminal exits"
        body="No terminal sessions have exited with classification data yet."
      />
    );
  }

  return (
    <div className="exit-taxonomy-panel">
      {sessionsWithExits.map((session) => {
        const exit = session.exitClassification;
        if (!exit) return null;

        return (
          <div key={session.id} className="evidence-card">
            <strong>{exit.label}</strong>
            <div className="evidence-card__meta">
              <span>Session {session.id.slice(-6)}</span>
              <span>Kind: {exit.kind}</span>
              {exit.exitCode !== undefined && <span>Code: {exit.exitCode}</span>}
              {exit.signal && <span>Signal: {exit.signal}</span>}
            </div>
            <span>{exit.summary}</span>
            <div className="evidence-card__activity">
              <strong>Recommendation: </strong>
              {exit.recommendation}
            </div>
          </div>
        );
      })}
    </div>
  );
}
