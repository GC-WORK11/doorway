/**
 * HeaderBar — Minimal header with project context only
 *
 * No navigation, no branding. Just project context.
 */

import React from 'react';
import { useHarnessState } from './HarnessContext';

interface HeaderBarProps {
  readonly sidebarOpen?: boolean;
  readonly onToggleSidebar?: () => void;
}

export function HeaderBar({ sidebarOpen, onToggleSidebar }: HeaderBarProps) {
  const { activeProject, activeThread } = useHarnessState();

  return (
    <header className="header-bar">
      <div className="header-bar__left">
        {activeProject && (
          <button
            className="header-bar__toggle-btn"
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
            aria-pressed={sidebarOpen}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        )}
        <div className="header-bar__context">
          {activeProject ? (
            <span className="header-bar__project">
              {activeProject.name}
            </span>
          ) : (
            <span className="header-bar__placeholder">No project</span>
          )}
          {activeThread && (
            <>
              <span className="header-bar__separator" aria-hidden="true">/</span>
              <span className="header-bar__thread">{activeThread.title || 'New thread'}</span>
            </>
          )}
        </div>
      </div>
      <div className="header-bar__actions">
        <button
          className="header-bar__cmd-btn"
          type="button"
          aria-label="Open command palette"
          title="Command palette (Cmd+K)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
