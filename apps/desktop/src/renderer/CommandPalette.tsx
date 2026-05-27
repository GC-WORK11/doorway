import React, { useEffect, useMemo, useState } from 'react';
import type { SlashCommand } from './shared-ui';

type CommandPaletteItem = {
  readonly command: SlashCommand;
  readonly label: string;
  readonly detail: string;
  readonly keywords: readonly string[];
};

const commandPaletteItems: readonly CommandPaletteItem[] = [
  {
    command: '/build',
    label: 'Build run',
    detail: 'Launch an implementation-focused agent run.',
    keywords: ['build', 'implement', 'code'],
  },
  {
    command: '/debug',
    label: 'Debug run',
    detail: 'Open a run for failure analysis or repair.',
    keywords: ['debug', 'fix', 'repair', 'investigate'],
  },
  {
    command: '/review',
    label: 'Review run',
    detail: 'Route work into review and merge evidence.',
    keywords: ['review', 'merge', 'approve'],
  },
  {
    command: '/plan',
    label: 'Plan run',
    detail: 'Ask for a structured plan before execution.',
    keywords: ['plan', 'design', 'outline'],
  },
  {
    command: '/handoff',
    label: 'Handoff',
    detail: 'Generate a capsule for the next provider or agent.',
    keywords: ['handoff', 'transfer', 'continue'],
  },
  {
    command: '/compact',
    label: 'Compact checkpoint',
    detail: 'Checkpoint terminal evidence and prepare a follow-up prompt.',
    keywords: ['compact', 'checkpoint', 'context'],
  },
  {
    command: '/test',
    label: 'Test run',
    detail: 'Focus the thread on verification and proof.',
    keywords: ['test', 'verify', 'proof'],
  },
  {
    command: '/browser',
    label: 'Browser surface',
    detail: 'Open the browser evidence drawer.',
    keywords: ['browser', 'proof', 'web'],
  },
  {
    command: '/merge',
    label: 'Merge surface',
    detail: 'Open worktree review and merge actions.',
    keywords: ['merge', 'worktree', 'review'],
  },
  {
    command: '/tools',
    label: 'Tools surface',
    detail: 'Inspect tool capabilities and policy state.',
    keywords: ['tools', 'capabilities', 'policy'],
  },
  {
    command: '/plugins',
    label: 'Plugins surface',
    detail: 'Inspect discovered project plugin manifests and permissions.',
    keywords: ['plugins', 'manifests', 'permissions', 'mcp'],
  },
  {
    command: '/automations',
    label: 'Automations surface',
    detail: 'Schedule project commands and inspect real run history.',
    keywords: ['automations', 'schedule', 'cron', 'runs'],
  },
  {
    command: '/think',
    label: 'Think step by step',
    detail: 'Prepend thinking prompt to reason through the problem.',
    keywords: ['think', 'reason', 'step', 'analysis'],
  },
  {
    command: '/continue',
    label: 'Continue',
    detail: 'Continue the previous run or operation.',
    keywords: ['continue', 'resume', 'proceed'],
  },
  {
    command: '/retry',
    label: 'Retry',
    detail: 'Retry the last failed operation.',
    keywords: ['retry', 'again', 'repeat', 'failed'],
  },
  {
    command: '/abort',
    label: 'Abort',
    detail: 'Cancel the currently running agent operation.',
    keywords: ['abort', 'cancel', 'stop', 'kill'],
  },
  {
    command: '/history',
    label: 'History surface',
    detail: 'View command history and recent operations.',
    keywords: ['history', 'recent', 'past', 'commands'],
  },
  {
    command: '/context',
    label: 'Context surface',
    detail: 'View token usage and context window status.',
    keywords: ['context', 'tokens', 'usage', 'window'],
  },
  {
    command: '/clear',
    label: 'Clear',
    detail: 'Clear the composer and thread UI.',
    keywords: ['clear', 'reset', 'empty'],
  },
  {
    command: '/theme',
    label: 'Toggle theme',
    detail: 'Cycle between light and dark themes.',
    keywords: ['theme', 'dark', 'light', 'mode'],
  },
  {
    command: '/git',
    label: 'Git surface',
    detail: 'Open git operations panel.',
    keywords: ['git', 'version', 'control', 'branch'],
  },
  {
    command: '/search',
    label: 'Search surface',
    detail: 'Open code search panel.',
    keywords: ['search', 'find', 'grep', 'code'],
  },
  {
    command: '/settings',
    label: 'Settings surface',
    detail: 'Open application settings.',
    keywords: ['settings', 'preferences', 'config'],
  },
  {
    command: '/computer',
    label: 'Computer surface',
    detail: 'Manage remote computer connections.',
    keywords: ['computer', 'remote', 'ssh', 'connection'],
  },
  {
    command: '/loop',
    label: 'Loop',
    detail: 'Run a command on a recurring interval.',
    keywords: ['loop', 'repeat', 'interval', 'cron'],
  },
  {
    command: '/pr-review',
    label: 'PR review',
    detail: 'Review a pull request.',
    keywords: ['pr', 'pull', 'request', 'review'],
  },
  {
    command: '/refactor',
    label: 'Refactor',
    detail: 'Suggest code refactoring improvements.',
    keywords: ['refactor', 'improve', 'restructure', 'clean'],
  },
  {
    command: '/security',
    label: 'Security review',
    detail: 'Run a security audit on the codebase.',
    keywords: ['security', 'audit', 'vulnerability', 'scan'],
  },
  {
    command: '/performance',
    label: 'Performance analysis',
    detail: 'Analyze code for performance improvements.',
    keywords: ['performance', 'optimize', 'speed', 'benchmark'],
  },
  {
    command: '/export',
    label: 'Export',
    detail: 'Export thread data or evidence.',
    keywords: ['export', 'download', 'save', 'data'],
  },
  {
    command: '/import',
    label: 'Import',
    detail: 'Import data or evidence into the thread.',
    keywords: ['import', 'upload', 'load', 'data'],
  },
  {
    command: '/tokens',
    label: 'Token analysis',
    detail: 'Show token usage breakdown.',
    keywords: ['tokens', 'usage', 'cost', 'breakdown'],
  },
  {
    command: '/ssh',
    label: 'SSH connection',
    detail: 'Establish SSH connection to remote host.',
    keywords: ['ssh', 'remote', 'connection', 'server'],
  },
  {
    command: '/docker',
    label: 'Docker surface',
    detail: 'Manage Docker containers and images.',
    keywords: ['docker', 'container', 'image', 'containerize'],
  },
  {
    command: '/deploy',
    label: 'Deploy',
    detail: 'Deploy the current project.',
    keywords: ['deploy', 'release', 'publish', 'stack'],
  },
  {
    command: '/monitor',
    label: 'Monitor surface',
    detail: 'Monitor project metrics and health.',
    keywords: ['monitor', 'metrics', 'health', 'dashboard'],
  },
  {
    command: '/screenshot',
    label: 'Screenshot',
    detail: 'Capture a screenshot of the current view.',
    keywords: ['screenshot', 'capture', 'image', 'screen'],
  },
  {
    command: '/keyboard',
    label: 'Keyboard shortcuts',
    detail: 'Show available keyboard shortcuts.',
    keywords: ['keyboard', 'shortcuts', 'hotkeys', 'bindings'],
  },
  {
    command: '/migrate',
    label: 'Migrate',
    detail: 'Migrate data or project structure.',
    keywords: ['migrate', 'move', 'transfer', 'upgrade'],
  },
];

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRunCommand: (command: SlashCommand) => void;
}

export function CommandPalette({ open, onClose, onRunCommand }: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return commandPaletteItems;
    }

    return commandPaletteItems.filter((item) => {
      const haystack =
        `${item.command} ${item.label} ${item.detail} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query]);

  if (!open) {
    return null;
  }

  return (
    <div className="command-palette__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        aria-label="Command palette"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="command-palette__header">
          <strong>Command palette</strong>
          <button type="button" onClick={onClose} aria-label="Close command palette">
            ×
          </button>
        </header>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands"
          aria-label="Search commands"
          autoFocus
        />
        <div className="command-palette__list" aria-label="Available commands">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <button
                type="button"
                key={item.command}
                onClick={() => {
                  onRunCommand(item.command);
                  onClose();
                }}
              >
                <span>{item.label}</span>
                <small>
                  <code>{item.command}</code>
                  {item.detail}
                </small>
              </button>
            ))
          ) : (
            <div className="command-palette__empty">
              <strong>No matching commands</strong>
              <span>Try build, review, browser, worktree, or test.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
