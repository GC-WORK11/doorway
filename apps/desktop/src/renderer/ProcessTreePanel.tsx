import React from 'react';
import type { TerminalProjection } from '@doorway/protocol';
import { EmptyState } from './shared-ui';

export function ProcessTreePanel({
  terminalSessions,
}: {
  readonly terminalSessions: readonly TerminalProjection[];
}) {
  const sessionsWithProcesses = terminalSessions.filter(
    (session) => session.latestProcessSnapshot && session.latestProcessSnapshot.nodes.length > 0
  );

  if (sessionsWithProcesses.length === 0) {
    return (
      <EmptyState
        title="No process snapshots"
        body="No process trees have been captured for this thread's terminal sessions."
      />
    );
  }

  return (
    <div className="process-tree-panel">
      {sessionsWithProcesses.map((session) => (
        <div key={session.id} className="evidence-card">
          <strong>Process Tree</strong>
          <div className="evidence-card__meta">
            <span>Session {session.id.slice(-6)}</span>
            <span>{session.latestProcessSnapshot?.phase}</span>
          </div>
          <ol className="process-tree-list">
            {session.latestProcessSnapshot?.nodes.map((node) => (
              <li key={`${node.pid}-${node.ppid}-${node.command}`}>
                <span>{node.pid}</span>
                <code>{node.command}</code>
                <small>{node.args || 'No args recorded'}</small>
                <small>
                  cpu {node.cpuPercent === undefined ? 'unknown' : `${node.cpuPercent.toFixed(1)}%`}{' '}
                  · mem{' '}
                  {node.memoryPercent === undefined
                    ? 'unknown'
                    : `${node.memoryPercent.toFixed(1)}%`}
                </small>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
