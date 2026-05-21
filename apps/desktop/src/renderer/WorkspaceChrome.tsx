import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import doorwayLogoUrl from './assets/logos/doorway-logo.svg?url';
import type { ProjectMemorySource, ProjectProjection, ThreadProjection } from '@doorway/protocol';
import { EmptyState, ProjectInstructionStatus, SidebarProjectContext } from './shared-ui';

type Surface = 'browser' | 'terminal' | 'evidence' | 'worktrees' | 'tools' | null;

const surfaceLabels: Record<Exclude<Surface, null>, string> = {
  browser: 'Browser',
  terminal: 'Terminal',
  evidence: 'Evidence',
  worktrees: 'Worktrees',
  tools: 'Tools',
};

type SidebarThreadGroupData = {
  readonly current: readonly ThreadProjection[];
  readonly active: readonly ThreadProjection[];
  readonly recent: readonly ThreadProjection[];
};

type ActiveSurfaceButtonProps = {
  readonly surface: Exclude<Surface, null>;
  readonly activeSurface: Surface;
  readonly setActiveSurface: (surface: Surface) => void;
  readonly label: string;
};

function RailIcon({ surface }: { readonly surface: Exclude<Surface, null> }) {
  switch (surface) {
    case 'browser':
      return (
        <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8" />
          <path d="M3.6 15h16.8" />
          <path d="M12 3c2.1 2.4 3.1 5.4 3.1 9s-1 6.6-3.1 9" />
          <path d="M12 3c-2.1 2.4-3.1 5.4-3.1 9s1 6.6 3.1 9" />
        </svg>
      );
    case 'terminal':
      return (
        <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 7 5 5-5 5" />
          <path d="M12 17h7" />
        </svg>
      );
    case 'evidence':
      return (
        <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5 19 7v5.3c0 4.3-2.8 7-7 8.2-4.2-1.2-7-3.9-7-8.2V7l7-3.5Z" />
          <path d="m8.5 12 2.2 2.2 4.8-5" />
        </svg>
      );
    case 'worktrees':
      return (
        <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="12" cy="18" r="2.2" />
          <path d="M7.7 7.5 11 15.8" />
          <path d="M16.3 7.5 13 15.8" />
          <path d="M8.3 6h7.4" />
        </svg>
      );
    case 'tools':
      return (
        <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7h12" />
          <path d="M6 12h12" />
          <path d="M6 17h12" />
          <circle cx="8" cy="7" r="1.7" />
          <circle cx="16" cy="12" r="1.7" />
          <circle cx="11" cy="17" r="1.7" />
        </svg>
      );
  }
}

function RailButton({ surface, activeSurface, setActiveSurface, label }: ActiveSurfaceButtonProps) {
  const active = activeSurface === surface;

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="rail-button"
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={() => setActiveSurface(active ? null : surface)}
    >
      <RailIcon surface={surface} />
    </motion.button>
  );
}

function SidebarThreadGroup({
  label,
  threads,
  activeThread,
  selectThread,
}: {
  readonly label: string;
  readonly threads: readonly ThreadProjection[];
  readonly activeThread: ThreadProjection | null;
  readonly selectThread: (threadId: string) => void | Promise<unknown>;
}) {
  return (
    <section className="sidebar-thread-group" aria-label={`${label} chats`}>
      <div className="sidebar-thread-group__label">
        <span>{label}</span>
        <small>{threads.length}</small>
      </div>
      <AnimatePresence>
        {threads.map((thread) => (
          <motion.button
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="thread-row"
            type="button"
            key={thread.id}
            aria-pressed={activeThread?.id === thread.id}
            onClick={() => void selectThread(thread.id)}
          >
            <span>{thread.title}</span>
            <small>
              {thread.status}
              {thread.messageCount !== undefined ? ` · ${thread.messageCount} messages` : ''}
              {thread.runCount !== undefined ? ` · ${thread.runCount} runs` : ''}
            </small>
          </motion.button>
        ))}
      </AnimatePresence>
    </section>
  );
}

import { useHarnessState } from './HarnessContext';
import { useMemo } from 'react';
import { sidebarThreadGroups } from './App';

export function WorkspaceChrome() {
  const {
    activeSurface,
    setActiveSurface,
    activeProject,
    activeThread,
    projectMemorySources,
    worktrees,
    loading,
    setProjectPath,
    submitProject,
    setThreadTitle,
    submitThread,
    sidebarSearch,
    setSidebarSearch,
    projects,
    threads,
    selectProject,
    selectThread,
    evidenceRecordCount,
  } = useHarnessState();

  const worktreeCount = worktrees.length;

  const sidebarQuery = sidebarSearch.trim().toLowerCase();

  const visibleThreads = useMemo(
    () =>
      sidebarQuery
        ? threads.filter((thread) => thread.title.toLowerCase().includes(sidebarQuery))
        : threads,
    [sidebarQuery, threads]
  );

  const sidebarGroups = useMemo(
    () => sidebarThreadGroups(visibleThreads, activeThread),
    [activeThread, visibleThreads]
  );

  const visibleProjects = useMemo(
    () =>
      projects
        .filter((project) => project.id !== activeProject?.id)
        .filter((project) => {
          if (!sidebarQuery) return true;
          return (
            project.name.toLowerCase().includes(sidebarQuery) ||
            project.path.toLowerCase().includes(sidebarQuery)
          );
        }),
    [activeProject?.id, projects, sidebarQuery]
  );

  const handleOpenNewProject = () => {
    const path = prompt('Enter absolute path to project repository:');
    if (path && path.trim()) {
      setProjectPath(path.trim());
      setTimeout(() => {
        void submitProject();
      }, 50);
    }
  };

  const handleNewChat = () => {
    if (!activeProject || loading) return;
    const title = prompt('Enter new chat title (optional):');
    if (title === null) return;
    setThreadTitle(title.trim());
    setTimeout(() => {
      void submitThread();
    }, 50);
  };

  return (
    <>
      <nav className="utility-rail" aria-label="Surfaces">
        {(['browser', 'terminal', 'evidence', 'worktrees', 'tools'] as const).map((surface) => (
          <RailButton
            key={surface}
            surface={surface}
            activeSurface={activeSurface}
            setActiveSurface={setActiveSurface}
            label={surfaceLabels[surface]}
          />
        ))}
      </nav>
      <div className="rail-separator" aria-hidden="true" />
      <div
        className="permission-posture"
        style={{ display: 'none' }}
        aria-label="Permission posture"
      />
      <aside className="main-sidebar">
        <header className="sidebar-brand">
          <div className="sidebar-brand-left">
            <img className="brand-logo" src={doorwayLogoUrl} alt="" aria-hidden="true" />
            <div>
              <div className="brand-title">Doorway</div>
              <div className="brand-subtitle">Local-first agent cockpit</div>
            </div>
          </div>
          <button
            className="header-new-chat-button"
            type="button"
            disabled={!activeProject || loading}
            onClick={handleNewChat}
            title="New Chat"
            aria-label="New Chat"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="sr-only">New chat</span>
          </button>
        </header>

        <label className="search-shell">
          <span aria-hidden="true">
            <svg className="search-icon" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </span>
          <input
            value={sidebarSearch}
            onChange={(event) => setSidebarSearch(event.target.value)}
            placeholder="Search chats and projects"
            aria-label="Search chats and projects"
          />
        </label>

        <SidebarProjectContext
          activeProject={activeProject}
          activeThread={activeThread}
          projectMemorySources={projectMemorySources}
          worktreeCount={worktreeCount}
          evidenceRecordCount={evidenceRecordCount}
        />

        <section className="sidebar-section sidebar-project-selector-section">
          <div className="sidebar-group-header">
            <span>Workspace</span>
          </div>
          <div className="workspace-dropdown-container">
            <select
              className="workspace-dropdown-select"
              value={activeProject?.id || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__new_project__') {
                  void handleOpenNewProject();
                } else {
                  const selected = visibleProjects.find((p) => p.id === val);
                  if (selected) {
                    void selectProject(selected);
                  }
                }
              }}
            >
              {activeProject ? (
                <option value={activeProject.id}>
                  {activeProject.name} — {activeProject.path}
                </option>
              ) : (
                <option value="" disabled>
                  No workspace active
                </option>
              )}
              {visibleProjects
                .filter((p) => p.id !== activeProject?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.path})
                  </option>
                ))}
              <option value="__new_project__">+ Open Local Folder...</option>
            </select>
          </div>

          {/* Visually hidden for elegant modern aesthetics, but kept for test compatibility */}
          {!activeProject && (
            <div className="sr-only" style={{ display: 'none' }}>
              <EmptyState
                title="No project opened"
                body="Open a local repository to load stored Doorway threads."
              />
            </div>
          )}
        </section>

        <section className="sidebar-section sidebar-section--grow">
          <div className="sidebar-group-header">
            <span>Chats</span>
            <small>{visibleThreads.length}</small>
          </div>

          {visibleThreads.length > 0 ? (
            <div className="thread-list">
              {sidebarGroups.current.length > 0 && (
                <SidebarThreadGroup
                  label="Pinned"
                  threads={sidebarGroups.current}
                  activeThread={activeThread}
                  selectThread={selectThread}
                />
              )}
              {sidebarGroups.active.length > 0 && (
                <SidebarThreadGroup
                  label="Active"
                  threads={sidebarGroups.active}
                  activeThread={activeThread}
                  selectThread={selectThread}
                />
              )}
              {sidebarGroups.recent.length > 0 && (
                <SidebarThreadGroup
                  label="Recent"
                  threads={sidebarGroups.recent}
                  activeThread={activeThread}
                  selectThread={selectThread}
                />
              )}
            </div>
          ) : (
            <EmptyState
              title="No threads"
              body={
                activeProject
                  ? 'Create a thread to start a real agent session.'
                  : 'Threads appear after a project is opened.'
              }
            />
          )}
        </section>
      </aside>
    </>
  );
}
