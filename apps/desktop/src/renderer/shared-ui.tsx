import React from 'react';
import type {
  MessageRole,
  ProjectMemorySource,
  ProjectProjection,
  ProofProjection,
  ThreadProjection,
} from '@doorway/protocol';

export type SlashCommand =
  | '/build'
  | '/debug'
  | '/review'
  | '/plan'
  | '/handoff'
  | '/compact'
  | '/test'
  | '/browser'
  | '/merge'
  | '/tools';

export type ComposerMentionTarget = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly insertText?: string;
  readonly provider?: string;
  readonly modelId?: string;
};

export type ComposerPolicySummaryItem = {
  readonly label: string;
  readonly tone: 'neutral' | 'blocked' | 'warning';
};

export type ComposerLaunchPreflight = {
  readonly canSubmit: boolean;
  readonly provider: string;
  readonly toolId: string;
  readonly reason?: string;
};
function evidenceCountLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function messageCapsuleClassName(role: MessageRole) {
  return `message-capsule message-capsule--${role === 'user' ? 'user' : 'doorway'}`;
}

export function projectInstructionPreflightLabel(
  sources: readonly Pick<ProjectMemorySource, 'sourceFile' | 'category' | 'contentLength'>[]
): string {
  if (sources.length === 0) {
    return 'No project instruction files found';
  }

  return sources
    .map((source) => `${source.sourceFile} (${source.category}, ${source.contentLength} chars)`)
    .join(', ');
}

export function EmptyState({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__title">{title}</div>
      <div className="empty-state__body">{body}</div>
    </div>
  );
}

export function ProjectInstructionStatus({
  sources,
}: {
  readonly sources: readonly ProjectMemorySource[];
}) {
  return (
    <div className="composer-policy-status" aria-label="Project instructions loaded for launch">
      <span data-tone={sources.length > 0 ? 'neutral' : 'blocked'}>
        Instructions: {projectInstructionPreflightLabel(sources)}
      </span>
    </div>
  );
}

export function FirstRunProjectPanel({
  loading,
  projectPath,
  setProjectPath,
  submitProject,
}: {
  readonly loading: boolean;
  readonly projectPath: string;
  readonly setProjectPath: (value: string) => void;
  readonly submitProject: () => void;
}) {
  return (
    <section className="first-run-panel" aria-label="Open local repository">
      <div className="first-run-panel__intro">
        <span className="section-label">Local workspace</span>
        <h2>Open a local repository</h2>
        <p>
          Doorway loads persisted threads, worktrees, terminal transcripts, diffs, approvals, and
          proof records from local state.
        </p>
      </div>
      <div className="first-run-panel__checks" aria-label="Local evidence surfaces">
        <span>SQLite ledger</span>
        <span>Git worktrees</span>
        <span>Replay evidence</span>
      </div>
      <div className="first-run-panel__form">
        <input
          value={projectPath}
          onChange={(event) => setProjectPath(event.target.value)}
          placeholder="/path/to/project"
          aria-label="Project path"
        />
        <button type="button" disabled={loading || !projectPath.trim()} onClick={submitProject}>
          Open project
        </button>
      </div>
    </section>
  );
}

export function EmptyProjectThreadPanel({
  activeProject,
  loading,
  threadTitle,
  setThreadTitle,
  submitThread,
}: {
  readonly activeProject: ProjectProjection;
  readonly loading: boolean;
  readonly threadTitle: string;
  readonly setThreadTitle: (value: string) => void;
  readonly submitThread: () => void;
}) {
  return (
    <section className="thread-starter-panel" aria-label="Start persisted thread">
      <div className="thread-starter-panel__project">
        <span className="section-label">Project ready</span>
        <h2>{activeProject.name}</h2>
        <small>{activeProject.path}</small>
      </div>
      <div className="thread-starter-panel__meta" aria-label="Project runtime metadata">
        <span>{activeProject.mode}</span>
        <span>{activeProject.packageManager}</span>
        {activeProject.framework && <span>{activeProject.framework}</span>}
      </div>
      <div className="thread-starter-panel__form">
        <input
          value={threadTitle}
          onChange={(event) => setThreadTitle(event.target.value)}
          placeholder="Thread title"
          aria-label="Thread title"
        />
        <button type="button" disabled={loading} onClick={submitThread}>
          Create thread
        </button>
      </div>
      <p>
        Create a named thread here, or send the first prompt below. Doorway creates the persisted
        thread and records messages, terminal output, approvals, diffs, and proof evidence in local
        state.
      </p>
    </section>
  );
}

export function SidebarProjectContext({
  activeProject,
  activeThread,
  projectMemorySources,
  worktreeCount,
  evidenceRecordCount,
}: {
  readonly activeProject: ProjectProjection | null;
  readonly activeThread: ThreadProjection | null;
  readonly projectMemorySources: readonly ProjectMemorySource[];
  readonly worktreeCount: number;
  readonly evidenceRecordCount: number;
}) {
  const projectLabel = activeProject ? activeProject.name : 'No project';
  const projectDetail = activeProject ? activeProject.path : 'Open a local repository';
  const threadLabel = activeThread ? activeThread.status : 'no thread';

  return (
    <section className="sidebar-context" aria-label="Sidebar project context">
      <div className="sidebar-context__header">
        <strong>{projectLabel}</strong>
        <span>{threadLabel}</span>
      </div>
      <small>{projectDetail}</small>
      <div className="sidebar-context__meta" aria-label="Project evidence counters">
        <span>{evidenceCountLabel(projectMemorySources.length, 'instruction')}</span>
        <span>{evidenceCountLabel(worktreeCount, 'worktree')}</span>
        <span>{evidenceCountLabel(evidenceRecordCount, 'record')}</span>
      </div>
    </section>
  );
}

export function MentionedText({ text }: { readonly text: string }) {
  const parts = text.split(/(@[A-Za-z][A-Za-z0-9-]*)/g);

  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('@') ? (
          <span className="mention" key={`${part}-${index}`}>
            {part}
          </span>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

export function LatestProofStatus({ proof }: { readonly proof?: ProofProjection }) {
  if (!proof) {
    return (
      <div className="proof-strip proof-strip--unknown">
        <strong>Latest test proof</strong>
        <span>No test proof recorded</span>
      </div>
    );
  }

  return (
    <div className={`proof-strip proof-strip--${proof.status}`}>
      <strong>Latest test proof</strong>
      <span>
        {proof.status}
        {proof.command ? ` · ${proof.command}` : ''}
      </span>
    </div>
  );
}
