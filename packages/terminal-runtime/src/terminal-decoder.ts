/**
 * Minimal VT/ANSI decoder for semantic terminal consumers.
 *
 * The xterm renderer still receives raw PTY bytes. This decoder produces a
 * control-free text stream for prompt detection, action routing, and tests.
 */

import type { TerminalControlEvent, TerminalScreenSnapshot } from '@doorway/protocol';

export type { TerminalControlEvent };

export interface DecodedTerminalChunk {
  readonly text: string;
  readonly events: readonly TerminalControlEvent[];
  readonly screenSnapshot: TerminalScreenSnapshot;
}

const ESC = '\x1b';
const BEL = '\x07';
const MAX_SCREEN_LINES = 200;

interface ScreenBufferState {
  lines: string[];
  row: number;
  col: number;
}

export class TerminalDecoder {
  private pendingControl = '';
  private activeBuffer: 'main' | 'alternate' = 'main';
  private readonly buffers: Record<'main' | 'alternate', ScreenBufferState> = {
    main: createScreenBuffer(),
    alternate: createScreenBuffer(),
  };

  decode(data: string): DecodedTerminalChunk {
    const input = this.pendingControl + data;
    this.pendingControl = '';

    let text = '';
    const events: TerminalControlEvent[] = [];
    let index = 0;

    while (index < input.length) {
      const char = input[index];

      if (char === ESC) {
        const parsed = this.consumeEscape(input, index);
        if (parsed === null) {
          this.pendingControl = input.slice(index);
          break;
        }
        events.push(parsed.event);
        this.applyControlEvent(parsed.event);
        index = parsed.nextIndex;
        continue;
      }

      if (char === BEL) {
        events.push({ type: 'bell' });
        index += 1;
        continue;
      }

      if (char === '\b') {
        text = text.length > 0 && !text.endsWith('\n') ? text.slice(0, -1) : text;
        this.backspace();
        index += 1;
        continue;
      }

      if (char === '\r') {
        text += char;
        events.push({ type: 'carriage_return' });
        this.carriageReturn();
        index += 1;
        continue;
      }

      if (char === '\n') {
        text += char;
        events.push({ type: 'newline' });
        this.newline();
        index += 1;
        continue;
      }

      if (isPrintableControl(char)) {
        index += 1;
        continue;
      }

      text += char;
      this.writeChar(char);
      index += 1;
    }

    return { text, events, screenSnapshot: this.snapshot() };
  }

  flushPending(): string {
    const pending = this.pendingControl;
    this.pendingControl = '';
    return pending;
  }

  private consumeEscape(
    input: string,
    index: number
  ): { readonly event: TerminalControlEvent; readonly nextIndex: number } | null {
    const prefix = input[index + 1];
    if (prefix === undefined) return null;

    if (prefix === '[') {
      const end = findCsiEnd(input, index + 2);
      if (end === -1) return null;
      const sequence = input.slice(index, end + 1);
      const final = input[end];
      const screenBufferEvent = this.screenBufferEvent(sequence, final);
      const event = screenBufferEvent ?? (final === 'K'
        ? ({ type: 'erase_line', sequence } as const)
        : final === 'J'
          ? ({ type: 'erase_display', sequence } as const)
        : ({ type: 'csi', sequence, final } as const));
      return { event, nextIndex: end + 1 };
    }

    if (prefix === ']') {
      const end = findStringControlEnd(input, index + 2);
      if (end === null) return null;
      return {
        event: { type: 'osc', sequence: input.slice(index, end.nextIndex) },
        nextIndex: end.nextIndex,
      };
    }

    if (prefix === 'P') {
      const end = findStringControlEnd(input, index + 2);
      if (end === null) return null;
      return {
        event: { type: 'dcs', sequence: input.slice(index, end.nextIndex) },
        nextIndex: end.nextIndex,
      };
    }

    return {
      event: { type: 'escape', sequence: input.slice(index, index + 2) },
      nextIndex: index + 2,
    };
  }

  private screenBufferEvent(sequence: string, final: string): TerminalControlEvent | null {
    if (final !== 'h' && final !== 'l') return null;
    if (!/\?\s*(47|1047|1049)[hl]$/.test(sequence)) return null;

    const active = final === 'h';
    this.activeBuffer = active ? 'alternate' : 'main';
    return {
      type: 'screen_buffer',
      sequence,
      buffer: this.activeBuffer,
      active,
    };
  }

  private applyControlEvent(event: TerminalControlEvent): void {
    if (event.type === 'erase_line') {
      this.eraseCurrentLine(csiNumberParam(event.sequence, 'K', 0));
      return;
    }
    if (event.type === 'erase_display') {
      this.eraseDisplay(csiNumberParam(event.sequence, 'J', 0));
      return;
    }
    if (event.type === 'screen_buffer') {
      if (event.active && event.buffer === 'alternate') {
        this.buffers.alternate = createScreenBuffer();
      }
      return;
    }
    if (event.type === 'csi') {
      this.applyCursorControl(event.sequence, event.final);
    }
  }

  private applyCursorControl(sequence: string, final: string): void {
    const buffer = this.currentBuffer();

    if (final === 'H' || final === 'f') {
      const params = csiParams(sequence, final);
      const [rowParam, colParam] = params.split(';');
      const row = Math.max(0, Number(rowParam || 1) - 1);
      const col = Math.max(0, Number(colParam || 1) - 1);
      buffer.row = row;
      buffer.col = col;
      ensureLine(buffer, row);
      return;
    }

    const amount = csiNumberParam(sequence, final, 1);
    if (final === 'A') {
      buffer.row = Math.max(0, buffer.row - amount);
      ensureLine(buffer, buffer.row);
      return;
    }
    if (final === 'B') {
      buffer.row += amount;
      ensureLine(buffer, buffer.row);
      trimScreenBuffer(buffer);
      return;
    }
    if (final === 'C') {
      buffer.col += amount;
      return;
    }
    if (final === 'D') {
      buffer.col = Math.max(0, buffer.col - amount);
      return;
    }
    if (final === 'G') {
      buffer.col = Math.max(0, amount - 1);
    }
  }

  private writeChar(char: string): void {
    const buffer = this.currentBuffer();
    ensureLine(buffer, buffer.row);
    const line = buffer.lines[buffer.row] ?? '';
    buffer.lines[buffer.row] =
      line.slice(0, buffer.col).padEnd(buffer.col, ' ') + char + line.slice(buffer.col + 1);
    buffer.col += 1;
  }

  private backspace(): void {
    const buffer = this.currentBuffer();
    buffer.col = Math.max(0, buffer.col - 1);
  }

  private carriageReturn(): void {
    this.currentBuffer().col = 0;
  }

  private newline(): void {
    const buffer = this.currentBuffer();
    buffer.row += 1;
    buffer.col = 0;
    ensureLine(buffer, buffer.row);
    trimScreenBuffer(buffer);
  }

  private eraseCurrentLine(mode: number): void {
    const buffer = this.currentBuffer();
    ensureLine(buffer, buffer.row);
    const line = buffer.lines[buffer.row] ?? '';
    if (mode === 1) {
      const eraseThrough = Math.min(buffer.col + 1, line.length);
      buffer.lines[buffer.row] = ' '.repeat(eraseThrough) + line.slice(eraseThrough);
      return;
    }
    if (mode === 2) {
      buffer.lines[buffer.row] = '';
      return;
    }
    buffer.lines[buffer.row] = line.slice(0, buffer.col);
  }

  private eraseDisplay(mode: number): void {
    const buffer = this.currentBuffer();
    ensureLine(buffer, buffer.row);

    if (mode === 1) {
      for (let row = 0; row < buffer.row; row += 1) {
        buffer.lines[row] = '';
      }
      const line = buffer.lines[buffer.row] ?? '';
      const eraseThrough = Math.min(buffer.col + 1, line.length);
      buffer.lines[buffer.row] = ' '.repeat(eraseThrough) + line.slice(eraseThrough);
      return;
    }

    if (mode === 2 || mode === 3) {
      buffer.lines = [''];
      ensureLine(buffer, buffer.row);
      return;
    }

    const line = buffer.lines[buffer.row] ?? '';
    buffer.lines[buffer.row] = line.slice(0, buffer.col);
    buffer.lines = buffer.lines.slice(0, buffer.row + 1);
  }

  private currentBuffer(): ScreenBufferState {
    return this.buffers[this.activeBuffer];
  }

  private snapshot(): TerminalScreenSnapshot {
    const active = this.currentBuffer();
    const alternateText = screenText(this.buffers.alternate);
    return {
      buffer: this.activeBuffer,
      cursorRow: active.row,
      cursorCol: active.col,
      visibleText: screenText(active),
      ...(alternateText ? { alternateText } : {}),
    };
  }
}

export function stripTerminalControls(data: string): string {
  const decoder = new TerminalDecoder();
  return decoder.decode(data).text;
}

function findCsiEnd(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index;
  }
  return -1;
}

function findStringControlEnd(
  input: string,
  start: number
): { readonly nextIndex: number } | null {
  const bellIndex = input.indexOf(BEL, start);
  const stIndex = input.indexOf(`${ESC}\\`, start);

  if (bellIndex === -1 && stIndex === -1) return null;
  if (bellIndex !== -1 && (stIndex === -1 || bellIndex < stIndex)) {
    return { nextIndex: bellIndex + 1 };
  }
  return { nextIndex: stIndex + 2 };
}

function csiParams(sequence: string, final: string): string {
  return sequence.endsWith(final) ? sequence.slice(2, -1) : '';
}

function csiNumberParam(sequence: string, final: string, fallback: number): number {
  const value = Number(csiParams(sequence, final).split(';')[0] || fallback);
  return Number.isFinite(value) ? value : fallback;
}

function isPrintableControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 0x20 && char !== '\t';
}

function createScreenBuffer(): ScreenBufferState {
  return {
    lines: [''],
    row: 0,
    col: 0,
  };
}

function ensureLine(buffer: ScreenBufferState, row: number): void {
  while (buffer.lines.length <= row) {
    buffer.lines.push('');
  }
}

function trimScreenBuffer(buffer: ScreenBufferState): void {
  if (buffer.lines.length <= MAX_SCREEN_LINES) return;
  const removed = buffer.lines.length - MAX_SCREEN_LINES;
  buffer.lines = buffer.lines.slice(removed);
  buffer.row = Math.max(0, buffer.row - removed);
}

function screenText(buffer: ScreenBufferState): string {
  return buffer.lines.join('\n').replace(/\s+$/u, '');
}
