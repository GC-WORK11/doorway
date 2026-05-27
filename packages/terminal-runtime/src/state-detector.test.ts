import { describe, expect, it } from 'vitest';
import { TerminalDecoder } from './terminal-decoder.js';
import { TerminalStateDetector } from './state-detector.js';

describe('TerminalStateDetector', () => {
  it('detects Claude awaiting input from the prompt', () => {
    const detector = new TerminalStateDetector('claude');
    const decoded = decode('\x1b[1;36mClaude\x1b[0m\n\x1b[1;32m>\x1b[0m \x1b[?25h');

    const state = detector.update({
      text: decoded.text,
      rawText: decoded.rawText,
      controlEvents: decoded.controlEvents,
    });

    expect(state).toMatchObject({
      state: 'awaiting_input',
      provider: 'claude',
    });
    expect(state.signals).toContain('prompt_pattern');
  });

  it('detects Claude thinking from spinner output', () => {
    const detector = new TerminalStateDetector('claude');
    const decoded = decode('\x1b[?25l\x1b[2K\r\x1b[2m⠋\x1b[0m Thinking...');

    const state = detector.update({
      text: decoded.text,
      rawText: decoded.rawText,
      controlEvents: decoded.controlEvents,
    });

    expect(state.state).toBe('thinking');
    expect(state.signals).toContain('thinking_indicator');
  });

  it('detects completion when output returns to prompt', () => {
    const detector = new TerminalStateDetector('claude');
    detector.update({
      text: 'Here is the fix.\n',
      rawText: 'Here is the fix.\n',
      controlEvents: [],
    });
    const decoded = decode('\n\x1b[1;32m>\x1b[0m \x1b[?25h');

    const state = detector.update({
      text: decoded.text,
      rawText: decoded.rawText,
      controlEvents: decoded.controlEvents,
    });

    expect(state.state).toBe('complete');
    expect(state.reason).toContain('returned to an input prompt');
  });

  it('keeps question prompts awaiting input after prior output', () => {
    const detector = new TerminalStateDetector('claude');
    detector.update({
      text: 'I need one decision before continuing.\n',
      rawText: 'I need one decision before continuing.\n',
      controlEvents: [],
    });
    const decoded = decode('Should I proceed? [y/n]\n\x1b[1;32m>\x1b[0m \x1b[?25h');

    const state = detector.update({
      text: decoded.text,
      rawText: decoded.rawText,
      controlEvents: decoded.controlEvents,
    });

    expect(state.state).toBe('awaiting_input');
    expect(state.signals).toContain('question_pattern');
    expect(state.reason).toContain('question prompt');
  });

  it('detects Codex awaiting input from the arrow prompt', () => {
    const detector = new TerminalStateDetector('codex');
    const decoded = decode('\x1b[1mCodex\x1b[0m by OpenAI\n\x1b[36m❯\x1b[0m');

    const state = detector.update({
      text: decoded.text,
      rawText: decoded.rawText,
      controlEvents: decoded.controlEvents,
    });

    expect(state).toMatchObject({
      state: 'awaiting_input',
      provider: 'codex',
    });
  });

  it('detects failed state from fatal output', () => {
    const detector = new TerminalStateDetector();
    const state = detector.update({
      text: 'Fatal: permission denied\n',
      rawText: 'Fatal: permission denied\n',
      controlEvents: [],
    });

    expect(state.state).toBe('failed');
    expect(state.signals).toContain('failure_pattern');
  });

  it('confirms awaiting input after a silence window', () => {
    const detector = new TerminalStateDetector('claude');
    const decoded = decode('\x1b[1;32m>\x1b[0m \x1b[?25h');

    detector.update({
      text: decoded.text,
      rawText: decoded.rawText,
      controlEvents: decoded.controlEvents,
    });

    const confirmed = detector.confirmSilence(500);

    expect(confirmed).toMatchObject({
      state: 'awaiting_input',
      confirmed: true,
    });
    expect(confirmed?.confirmationSignals).toContain('silence_500ms');
  });
});

function decode(rawText: string): {
  readonly text: string;
  readonly rawText: string;
  readonly controlEvents: ReturnType<TerminalDecoder['decode']>['events'];
} {
  const decoded = new TerminalDecoder().decode(rawText);
  return {
    text: decoded.text,
    rawText,
    controlEvents: decoded.events,
  };
}
