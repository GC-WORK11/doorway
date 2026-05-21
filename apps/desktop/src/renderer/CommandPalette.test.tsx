import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  it('renders searchable command actions as a real modal surface', () => {
    const html = renderToStaticMarkup(
      React.createElement(CommandPalette, {
        open: true,
        onClose: vi.fn(),
        onRunCommand: vi.fn(),
      })
    );

    expect(html).toContain('Command palette');
    expect(html).toContain('Search commands');
    expect(html).toContain('/build');
    expect(html).toContain('/browser');
    expect(html).toContain('Launch an implementation-focused agent run.');
  });
});
