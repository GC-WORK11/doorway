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
