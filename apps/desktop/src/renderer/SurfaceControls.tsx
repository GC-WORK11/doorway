import React from 'react';
import type {
  PermissionReceiptProjection,
  ProjectPluginProjection,
  ProjectProjection,
  ProviderModelProjection,
  OperationalMemoryProjection,
  ThreadProjection,
  ToolCapabilityProjection,
  ToolLaneProjection,
  WorktreeProjection,
} from '@doorway/protocol';
import { EmptyState } from './shared-ui';
import { evidenceTimestampLabel, worktreeFirstActionPrompt } from './App';

export function DiffPatch({ patch }: { readonly patch: string }) {
  const [activeHunk, setActiveHunk] = React.useState(1);
  const totalHunks = React.useMemo(() => {
    const count = (patch.match(/^@@/gm) || []).length;
    return count > 0 ? count : 1;
  }, [patch]);

  const hunkLines = React.useMemo(() => {
    return patch.split('\n');
  }, [patch]);

  return (
    <div className="diff-patch-container">
      {/* Monaco Hunk Navigator Header */}
      <div className="monaco-hunk-navigator">
        <div className="navigator-info">
          <span className="navigator-title">Diff hunk navigator</span>
          <span className="navigator-stats">
            Hunk {activeHunk} of {totalHunks}
          </span>
        </div>
        <div className="navigator-controls">
          <button
            type="button"
            className="hunk-control-btn"
            disabled={activeHunk <= 1}
            onClick={() => setActiveHunk((h) => Math.max(1, h - 1))}
            title="Previous Hunk (Alt+Up)"
          >
            Previous
          </button>
          <button
            type="button"
            className="hunk-control-btn"
            disabled={activeHunk >= totalHunks}
            onClick={() => setActiveHunk((h) => Math.min(totalHunks, h + 1))}
            title="Next Hunk (Alt+Down)"
          >
            Next
          </button>
        </div>
      </div>

      <pre className="diff-patch">
        {hunkLines.map((line, index) => {
          let className = 'diff-line';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            className = 'diff-line diff-line--add';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            className = 'diff-line diff-line--delete';
          } else if (line.startsWith('@@')) {
            className = 'diff-line diff-line--hunk';
          }
          return (
            <span className={className} key={`${index}-${line}`}>
              {line || ' '}
              {'\n'}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

export function ReplayVerificationPolicyStatus({
  activeThread,
  loading,
  reason,
  exportThreadReplay,
}: {
  readonly activeThread: ThreadProjection | null;
  readonly loading: boolean;
  readonly reason: string | undefined;
  readonly exportThreadReplay: () => void | Promise<unknown>;
}) {
  if (!activeThread || !reason) {
    return null;
  }

  return (
    <div className="browser-policy-status" aria-label="Replay verification policy">
      <span data-tone="warning">{reason}</span>
      <button
        className="evidence-card__action"
        type="button"
        disabled={loading}
        onClick={() => void exportThreadReplay()}
      >
        Verify replay
      </button>
    </div>
  );
}

export function WorktreeReviewActions({
  activeThread,
  loading,
  selectedWorktreePath,
  provider,
  isReviewMergeBlocked,
  reviewMergeBlockedReason,
  reviewMergePolicyTitle,
  hasReplayVerificationWarning,
  replayVerificationPolicyReason,
  forkWorktreeBlockedReason,
  archiveWorktreeBlockedReason,
  archiveMergedBranchTitle,
  evaluateMergeReadiness,
  approveWorktreeMerge,
  createIntegrationMerge,
  forkWorktree,
  archiveWorktree,
  exportRollbackPatch,
  createHandoff,
  exportThreadReplay,
}: {
  readonly activeThread: ThreadProjection | null;
  readonly loading: boolean;
  readonly selectedWorktreePath: string | null;
  readonly provider: string;
  readonly isReviewMergeBlocked: boolean;
  readonly reviewMergeBlockedReason: string | undefined;
  readonly reviewMergePolicyTitle: string | undefined;
  readonly hasReplayVerificationWarning: boolean;
  readonly replayVerificationPolicyReason: string | undefined;
  readonly forkWorktreeBlockedReason: string | undefined;
  readonly archiveWorktreeBlockedReason: string | undefined;
  readonly archiveMergedBranchTitle: string | undefined;
  readonly evaluateMergeReadiness: (worktreePath: string) => void | Promise<unknown>;
  readonly approveWorktreeMerge: (worktreePath: string) => void | Promise<unknown>;
  readonly createIntegrationMerge: (worktreePath: string) => void | Promise<unknown>;
  readonly forkWorktree: (worktreePath: string) => void | Promise<unknown>;
  readonly archiveWorktree: (
    worktreePath: string,
    archiveMergedBranch?: boolean
  ) => void | Promise<unknown>;
  readonly exportRollbackPatch: (worktreePath: string) => void | Promise<unknown>;
  readonly createHandoff: (
    worktreePath: string | undefined,
    provider: string
  ) => void | Promise<unknown>;
  readonly exportThreadReplay: () => void | Promise<unknown>;
}) {
  return (
    <div className="review-actions">
      {isReviewMergeBlocked && reviewMergeBlockedReason && (
        <div className="browser-policy-status" aria-label="Review merge policy">
          <span data-tone="blocked">{reviewMergeBlockedReason}</span>
        </div>
      )}
      {hasReplayVerificationWarning && (
        <ReplayVerificationPolicyStatus
          activeThread={activeThread}
          loading={loading}
          reason={replayVerificationPolicyReason}
          exportThreadReplay={exportThreadReplay}
        />
      )}
      <section className="review-action-group" aria-label="Readiness actions">
        <span>Readiness</span>
        <div className="review-action-group__buttons">
          <button
            className="review-action"
            type="button"
            disabled={loading || !activeThread || !selectedWorktreePath || isReviewMergeBlocked}
            title={reviewMergePolicyTitle}
            onClick={() =>
              selectedWorktreePath && void evaluateMergeReadiness(selectedWorktreePath)
            }
          >
            Evaluate merge readiness
          </button>
          <button
            className="review-action review-action--secondary"
            type="button"
            disabled={loading || !activeThread || !selectedWorktreePath || isReviewMergeBlocked}
            title={reviewMergePolicyTitle}
            onClick={() => selectedWorktreePath && void approveWorktreeMerge(selectedWorktreePath)}
          >
            Approve merge
          </button>
          <button
            className="review-action review-action--secondary"
            type="button"
            disabled={loading || !activeThread || !selectedWorktreePath || isReviewMergeBlocked}
            title={reviewMergePolicyTitle}
            onClick={() =>
              selectedWorktreePath && void createIntegrationMerge(selectedWorktreePath)
            }
          >
            Create integration branch
          </button>
        </div>
      </section>
      <section className="review-action-group" aria-label="Branch safety actions">
        <span>Branch safety</span>
        <div className="review-action-group__buttons">
          <button
            className="review-action review-action--secondary"
            type="button"
            disabled={
              loading ||
              !activeThread ||
              !selectedWorktreePath ||
              Boolean(forkWorktreeBlockedReason)
            }
            title={forkWorktreeBlockedReason}
            onClick={() => selectedWorktreePath && void forkWorktree(selectedWorktreePath)}
          >
            Fork worktree
          </button>
          <button
            className="review-action review-action--secondary"
            type="button"
            disabled={
              loading ||
              !activeThread ||
              !selectedWorktreePath ||
              Boolean(archiveWorktreeBlockedReason)
            }
            title={archiveWorktreeBlockedReason}
            onClick={() => selectedWorktreePath && void archiveWorktree(selectedWorktreePath)}
          >
            Archive worktree
          </button>
          <button
            className="review-action review-action--secondary"
            type="button"
            disabled={
              loading ||
              !activeThread ||
              !selectedWorktreePath ||
              Boolean(archiveWorktreeBlockedReason)
            }
            title={archiveMergedBranchTitle}
            onClick={() => selectedWorktreePath && void archiveWorktree(selectedWorktreePath, true)}
          >
            Archive merged branch
          </button>
        </div>
      </section>
      <section className="review-action-group" aria-label="Evidence handoff actions">
        <span>Evidence handoff</span>
        <div className="review-action-group__buttons">
          <button
            className="review-action review-action--secondary"
            type="button"
            disabled={loading || !activeThread || !selectedWorktreePath}
            title={
              selectedWorktreePath
                ? 'Export a reverse patch for the selected worktree'
                : 'Select a worktree before exporting rollback patch'
            }
            onClick={() => selectedWorktreePath && void exportRollbackPatch(selectedWorktreePath)}
          >
            Export rollback patch
          </button>
          <button
            className="review-action review-action--secondary"
            type="button"
            disabled={loading || !activeThread}
            onClick={() => void createHandoff(selectedWorktreePath ?? undefined, provider)}
          >
            Generate handoff
          </button>
        </div>
      </section>
    </div>
  );
}

export function WorktreeFirstActionCard({
  activeProject,
  activeThread,
  loading,
  blockedReason,
  onStart,
}: {
  readonly activeProject: ProjectProjection | null;
  readonly activeThread: ThreadProjection | null;
  readonly loading: boolean;
  readonly blockedReason: string | undefined;
  readonly onStart: () => void | Promise<unknown>;
}) {
  const startPrompt = worktreeFirstActionPrompt(activeThread);
  const disabled =
    loading ||
    !activeProject ||
    !activeThread ||
    !startPrompt ||
    activeProject.mode !== 'git' ||
    Boolean(blockedReason);
  const title =
    blockedReason ??
    (!activeProject
      ? 'Open a project before starting a worktree run'
      : !activeThread
        ? 'Select a thread before starting a worktree run'
        : activeProject.mode !== 'git'
          ? 'Worktrees require a Git repository.'
          : undefined);
  const isTerminalOnly = activeProject?.mode === 'non_git';

  return (
    <div className="worktree-first-action">
      <EmptyState
        title={isTerminalOnly ? 'Terminal-only project' : 'No worktrees recorded'}
        body={
          isTerminalOnly
            ? 'Doorway launches visible terminal runs for this project because no Git repository was detected.'
            : 'Start an isolated run from the active thread to create the first reviewable worktree.'
        }
      />
      <button
        className="review-action"
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => void onStart()}
      >
        {isTerminalOnly ? 'Worktrees unavailable' : 'Start isolated worktree run'}
      </button>
    </div>
  );
}

export function ProjectPluginPanel({
  plugins,
}: {
  readonly plugins: readonly ProjectPluginProjection[];
}) {
  return (
    <article className="project-plugin-panel" aria-label="Project plugins">
      <header>
        <strong>Project plugins</strong>
        <span>{plugins.length > 0 ? `${plugins.length} manifests` : 'Unconfigured'}</span>
      </header>
      {plugins.length === 0 ? (
        <EmptyState
          title="No project plugins discovered"
          body="Doorway reads .doorway/plugins/*/doorway.plugin.json before a plugin can be trusted or enabled."
        />
      ) : (
        <div className="project-plugin-panel__list">
          {plugins.map((plugin) => (
            <section
              className="project-plugin-row"
              data-status={plugin.status}
              key={plugin.manifestPath}
            >
              <div className="project-plugin-row__head">
                <strong>{plugin.name}</strong>
                <span>{plugin.status}</span>
              </div>
              <div className="project-plugin-row__meta">
                <code>{plugin.id}</code>
                <span>{plugin.version}</span>
                <span>{plugin.capabilities.length} capabilities</span>
              </div>
              {plugin.status === 'invalid' ? (
                <p>{plugin.problem}</p>
              ) : (
                <dl>
                  <div>
                    <dt>Filesystem</dt>
                    <dd>
                      {plugin.filesystemRead.length} read / {plugin.filesystemWrite.length} write
                    </dd>
                  </div>
                  <div>
                    <dt>Network</dt>
                    <dd>{plugin.networkHosts.length} allowed hosts</dd>
                  </div>
                  <div>
                    <dt>Entry</dt>
                    <dd>{plugin.entryCommand}</dd>
                  </div>
                </dl>
              )}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

export function ToolCapabilitiesPanel({
  tools,
  lanes,
  operationalMemory,
  plugins,
  worktrees = [],
  denials,
  hasActiveThread,
  onToolToggle,
  onSelectLaneTerminal,
  onLoadLaneWorktreeDiff,
}: {
  readonly tools: readonly ToolCapabilityProjection[];
  readonly lanes: readonly ToolLaneProjection[];
  readonly operationalMemory: OperationalMemoryProjection | null;
  readonly plugins: readonly ProjectPluginProjection[];
  readonly worktrees?: readonly WorktreeProjection[];
  readonly denials: readonly PermissionReceiptProjection[];
  readonly hasActiveThread: boolean;
  readonly onToolToggle: (toolId: string, enabled: boolean) => void;
  readonly onSelectLaneTerminal?: (sessionId: string) => void;
  readonly onLoadLaneWorktreeDiff?: (path: string) => void;
}) {
  if (
    tools.length === 0 &&
    lanes.length === 0 &&
    plugins.length === 0 &&
    !operationalMemory?.observedCommands.length
  ) {
    return (
      <EmptyState
        title="No tools registered"
        body="Doorway lists built-in tool capabilities after the desktop IPC bridge is available."
      />
    );
  }

  return (
    <div className="evidence-list" aria-label="Tool capability permissions">
      <article className="operational-memory-panel" aria-label="Operational memory">
        <header>
          <strong>Operational memory</strong>
          <span>
            {operationalMemory
              ? `${operationalMemory.observedCommands.length} observed · ${operationalMemory.storedPatternCount} learned`
              : 'No active thread'}
          </span>
        </header>
        {!operationalMemory || operationalMemory.observedCommands.length === 0 ? (
          <EmptyState
            title="No command patterns observed"
            body="Doorway will show commands only after they are submitted through a real thread terminal."
          />
        ) : (
          <div className="operational-memory-panel__list">
            {operationalMemory.observedCommands.slice(0, 5).map((pattern) => (
              <section className="operational-memory-row" key={pattern.command}>
                <div>
                  <code>{pattern.command}</code>
                  <span>
                    {pattern.runCount} {pattern.runCount === 1 ? 'run' : 'runs'} ·{' '}
                    {pattern.lastSessionStatus.replace(/_/g, ' ')}
                    {pattern.lastSessionExitLabel ? ` · ${pattern.lastSessionExitLabel}` : ''}
                  </span>
                </div>
                {pattern.isStoredPattern ? (
                  <strong>learned</strong>
                ) : (
                  pattern.isRepeatedWorkflow && <strong>repeatable</strong>
                )}
              </section>
            ))}
          </div>
        )}
      </article>
      <ProjectPluginPanel plugins={plugins} />
      {lanes.length > 0 && (
        <article className="tool-lane-supervisor" aria-label="Active tool lanes">
          <header>
            <strong>Active lanes</strong>
            <span>
              {lanes.length} real worker {lanes.length === 1 ? 'lane' : 'lanes'}
            </span>
          </header>
          <div className="tool-lane-supervisor__list">
            {lanes.map((lane) => {
              const worktree = lane.worktreeId
                ? worktrees.find((item) => item.id === lane.worktreeId)
                : undefined;
              return (
                <section className="tool-lane-card" data-status={lane.status} key={lane.id}>
                  <div className="tool-lane-card__head">
                    <strong>{lane.toolId}</strong>
                    <span>{lane.status.replace(/_/g, ' ')}</span>
                  </div>
                  <dl className="tool-lane-card__meta">
                    <div>
                      <dt>Role</dt>
                      <dd>{lane.role}</dd>
                    </div>
                    <div>
                      <dt>Terminal</dt>
                      <dd>
                        {lane.terminalSessionId
                          ? `term ${lane.terminalSessionId.slice(-6)}`
                          : 'No terminal'}
                      </dd>
                    </div>
                    <div>
                      <dt>Worktree</dt>
                      <dd>{worktree ? worktree.branch : (lane.worktreeId ?? 'No worktree')}</dd>
                    </div>
                  </dl>
                  <p>{lane.latestActivity}</p>
                  <footer>
                    <button
                      type="button"
                      disabled={!lane.terminalSessionId || !onSelectLaneTerminal}
                      onClick={() => {
                        if (lane.terminalSessionId) {
                          onSelectLaneTerminal?.(lane.terminalSessionId);
                        }
                      }}
                    >
                      Open terminal
                    </button>
                    <button
                      type="button"
                      disabled={!worktree || !onLoadLaneWorktreeDiff}
                      onClick={() => {
                        if (worktree) {
                          onLoadLaneWorktreeDiff?.(worktree.path);
                        }
                      }}
                    >
                      Review diff
                    </button>
                  </footer>
                </section>
              );
            })}
          </div>
        </article>
      )}
      {denials.length > 0 && (
        <article className="evidence-card" aria-label="Recent blocked tool launches">
          <strong>Blocked by tool policy</strong>
          {denials.map((receipt) => (
            <div className="approval-row" data-decision="denied" key={receipt.id}>
              <strong>{receipt.command}</strong>
              <span>
                {receipt.userNotes ?? 'Tool launch denied'} ·{' '}
                {evidenceTimestampLabel(receipt.timestamp)}
              </span>
            </div>
          ))}
        </article>
      )}
      {tools.map((tool) => (
        <article className="evidence-card" key={tool.id}>
          <strong>{tool.name}</strong>
          <div className="evidence-card__meta">
            <span>{tool.surface}</span>
            <span>{tool.status.replace(/_/g, ' ')}</span>
            <span
              className={`tool-policy-chip tool-policy-chip--${tool.enabled ? 'enabled' : 'disabled'}`}
            >
              {tool.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
          <div className="evidence-card__files" aria-label={`${tool.name} permissions`}>
            {tool.permissions.map((permission) => (
              <span key={permission}>{permission}</span>
            ))}
          </div>
          <div className="review-checks" aria-label={`${tool.name} evidence`}>
            {tool.evidence.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <button
            className="evidence-card__action"
            type="button"
            disabled={!hasActiveThread}
            onClick={() => onToolToggle(tool.id, !tool.enabled)}
          >
            {tool.enabled ? 'Disable for thread' : 'Enable for thread'}
          </button>
        </article>
      ))}
    </div>
  );
}
