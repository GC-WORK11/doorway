import { describe, expect, it } from 'vitest';
import { classifyTerminalExit } from './exit-taxonomy.js';

describe('classifyTerminalExit', () => {
  it('classifies shell command-not-found exits', () => {
    expect(classifyTerminalExit({ exitCode: 127 })).toMatchObject({
      kind: 'command_not_found',
      label: 'exit 127',
      exitCode: 127,
    });
  });

  it('classifies signal exits from 128 plus signal code', () => {
    expect(classifyTerminalExit({ exitCode: 137 })).toMatchObject({
      kind: 'killed',
      label: 'SIGKILL',
      exitCode: 137,
      signalNumber: 9,
    });
  });

  it('classifies explicit PTY signals', () => {
    expect(classifyTerminalExit({ exitCode: 1, signal: 'SIGTERM' })).toMatchObject({
      kind: 'terminated',
      label: 'SIGTERM',
      exitCode: 1,
      signal: 'SIGTERM',
      signalNumber: 15,
    });
  });
});
