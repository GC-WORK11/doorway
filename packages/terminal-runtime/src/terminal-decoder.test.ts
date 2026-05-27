import { describe, expect, it } from 'vitest';
import { TerminalDecoder, stripTerminalControls } from './terminal-decoder.js';

describe('TerminalDecoder', () => {
  it('strips SGR sequences while preserving text', () => {
    const decoder = new TerminalDecoder();

    const decoded = decoder.decode('\x1b[31mred\x1b[0m\n');

    expect(decoded.text).toBe('red\n');
    expect(decoded.events.map((event) => event.type)).toEqual(['csi', 'csi', 'newline']);
  });

  it('carries partial CSI sequences across chunks', () => {
    const decoder = new TerminalDecoder();

    expect(decoder.decode('\x1b[3').text).toBe('');
    expect(decoder.decode('2mgreen').text).toBe('green');
  });

  it('strips OSC title controls', () => {
    const decoder = new TerminalDecoder();

    const decoded = decoder.decode('before\x1b]0;Doorway\x07after');

    expect(decoded.text).toBe('beforeafter');
    expect(decoded.events.map((event) => event.type)).toContain('osc');
  });

  it('keeps carriage returns but removes erase-line controls', () => {
    const decoder = new TerminalDecoder();

    const decoded = decoder.decode('Working\r\x1b[2KDone\n');

    expect(decoded.text).toBe('Working\rDone\n');
    expect(decoded.events.map((event) => event.type)).toEqual([
      'carriage_return',
      'erase_line',
      'newline',
    ]);
    expect(decoded.screenSnapshot.visibleText).toBe('Done');
  });

  it('tracks relative cursor movement when text overwrites a line', () => {
    const decoder = new TerminalDecoder();

    const decoded = decoder.decode('abc\x1b[2DXY');

    expect(decoded.text).toBe('abcXY');
    expect(decoded.events).toEqual([
      {
        type: 'csi',
        sequence: '\x1b[2D',
        final: 'D',
      },
    ]);
    expect(decoded.screenSnapshot.visibleText).toBe('aXY');
  });

  it('tracks cursor-up plus erase-line screen updates', () => {
    const decoder = new TerminalDecoder();

    const decoded = decoder.decode('first\nsecond\x1b[1A\r\x1b[2Ktop');

    expect(decoded.text).toBe('first\nsecond\rtop');
    expect(decoded.events.map((event) => event.type)).toEqual([
      'newline',
      'csi',
      'carriage_return',
      'erase_line',
    ]);
    expect(decoded.screenSnapshot.visibleText).toBe('top\nsecond');
  });

  it('tracks display erase before cursor-home output', () => {
    const decoder = new TerminalDecoder();

    const decoded = decoder.decode('stale\ntext\x1b[2J\x1b[HHello');

    expect(decoded.events.map((event) => event.type)).toEqual(['newline', 'erase_display', 'csi']);
    expect(decoded.screenSnapshot).toMatchObject({
      cursorRow: 0,
      cursorCol: 5,
      visibleText: 'Hello',
    });
  });

  it('strips controls through the utility helper', () => {
    expect(stripTerminalControls('\x1b[1mplain\x1b[0m')).toBe('plain');
  });

  it('marks alternate-screen transitions while preserving Codex text', () => {
    const decoder = new TerminalDecoder();

    const decoded = decoder.decode(
      '\x1b[?1049h\x1b[1mCodex\x1b[0m by OpenAI\n\x1b[36m❯\x1b[0m\x1b[?1049l'
    );

    expect(decoded.text).toContain('Codex by OpenAI');
    expect(decoded.text).toContain('❯');
    expect(decoded.screenSnapshot.alternateText).toContain('Codex by OpenAI');
    expect(decoded.events).toEqual(
      expect.arrayContaining([
        {
          type: 'screen_buffer',
          sequence: '\x1b[?1049h',
          buffer: 'alternate',
          active: true,
        },
        {
          type: 'screen_buffer',
          sequence: '\x1b[?1049l',
          buffer: 'main',
          active: false,
        },
      ])
    );
  });
});
