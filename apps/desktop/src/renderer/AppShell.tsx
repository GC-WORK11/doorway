import React, { type ReactNode, useState } from 'react';
import { HeaderBar } from './HeaderBar';
import { ChatThread } from './ChatThread';
import { ComposerInput } from './ComposerInput';
import { CommandPalette } from './CommandPalette';
import { useHarnessState } from './HarnessContext';
import { AnimatePresence } from 'framer-motion';
import { WorkspaceChrome } from './WorkspaceChrome';

interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { showCommands, setShowCommands, runSlashCommand } = useHarnessState();

  return (
    <div className="app-shell" data-theme="light">
      <WorkspaceChrome />
      
      <div className="app-main-content">
        <main className="chat-viewport">
          <ChatThread />
        </main>
        <ComposerInput />
      </div>

      <div className="status-bar">
        <div className="status-bar-left">
          <div className="status-bar-item">
            <div className="status-dot"></div>
            All systems operational
          </div>
          <div className="status-bar-item">
            3 agents available
          </div>
          <div className="status-bar-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            Auto-save on
          </div>
        </div>
        <div className="status-bar-right">
          <div className="status-bar-pill">UTF-8</div>
          <div className="status-bar-pill">LF</div>
          <div className="status-bar-pill">TypeScript</div>
        </div>
      </div>

      <AnimatePresence>
        {showCommands && (
          <CommandPalette
            open={showCommands}
            onClose={() => setShowCommands(false)}
            onRunCommand={runSlashCommand}
          />
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}
