import React from 'react';
import { motion } from 'framer-motion';
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
  | '/tools'
  | '/plugins'
  | '/automations'
  | '/think'
  | '/continue'
  | '/retry'
  | '/abort'
  | '/history'
  | '/context'
  | '/clear'
  | '/theme'
  | '/git'
  | '/search'
  | '/settings'
  | '/computer'
  | '/loop'
  | '/pr-review'
  | '/refactor'
  | '/security'
  | '/performance'
  | '/export'
  | '/import'
  | '/tokens'
  | '/ssh'
  | '/docker'
  | '/deploy'
  | '/monitor'
  | '/screenshot'
  | '/keyboard'
  | '/migrate';

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
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <svg
        className="empty-state__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
      <div className="empty-state__title">{title}</div>
      <div className="empty-state__body">{body}</div>
    </motion.div>
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
  onSelectFolder,
}: {
  readonly loading: boolean;
  readonly onSelectFolder: () => void;
}) {
  return (
    <motion.section
      className="first-run-panel"
      aria-label="Open local repository"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="first-run-panel__dropzone">
        <svg
          className="first-run-panel__icon"
          viewBox="0 0 48 48"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="8" y="16" width="32" height="24" rx="3" />
          <path d="M16 16v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
          <path d="M24 22v10M20 28l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>Open a local repository</h2>
        <p>Drop your project folder here, or click to browse</p>
        <button type="button" className="select-folder-btn" disabled={loading} onClick={onSelectFolder}>
          Select Folder
        </button>
      </div>
    </motion.section>
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
    <motion.section
      className="thread-starter-panel"
      aria-label="Start persisted thread"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="thread-starter-panel__project">
        <svg
          className="thread-starter-panel__icon"
          viewBox="0 0 48 48"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="6" y="10" width="36" height="30" rx="3" />
          <path d="M14 20h20M14 26h14M14 32h8" strokeLinecap="round" />
        </svg>
        <span className="section-label">Project ready</span>
        <h2>{activeProject.name}</h2>
        <small>{activeProject.path}</small>
      </div>
      <div className="thread-starter-panel__meta" aria-label="Project runtime metadata">
        <span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3l2 2" strokeLinecap="round" />
          </svg>
          {activeProject.mode}
        </span>
        {activeProject.packageManager && (
          <span>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 4l8 8M4 12l8-8" />
            </svg>
            {activeProject.packageManager}
          </span>
        )}
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
    </motion.section>
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
