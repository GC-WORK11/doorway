import { describe, expect, it } from 'vitest';
import type {
  TerminalInputProjection,
  TerminalProjection,
  TerminalSessionId,
} from '@doorway/protocol';
import {
  terminalFileEvidenceRows,
  terminalInputHistoryRows,
  terminalMuxMetadata,
  terminalProcessEvidenceRows,
} from './TerminalMuxPanel';

const sessionId = 'term_history' as TerminalSessionId;

describe('terminalInputHistoryRows', () => {
  it('coalesces xterm keystroke writes into command history rows', () => {
    expect(
      terminalInputHistoryRows([
        terminalInput(0, 'p'),
        terminalInput(1, 'w'),
        terminalInput(2, 'd'),
        terminalInput(3, '\r'),
      ])
    ).toEqual([{ sequence: 0, source: 'user', text: 'pwd' }]);
  });

  it('keeps control input and permission decisions readable', () => {
    expect(
      terminalInputHistoryRows([
        terminalInput(0, 'pnpm test\n'),
        terminalInput(1, '\u0003'),
        terminalInput(2, 'y\n', 'permission_decision'),
      ])
    ).toEqual([
      { sequence: 0, source: 'user', text: 'pnpm test' },
      { sequence: 1, source: 'user', text: '^C' },
      { sequence: 2, source: 'permission_decision', text: 'y' },
    ]);
  });

  it('handles empty input array', () => {
    expect(terminalInputHistoryRows([])).toEqual([]);
  });

  // Note: The actual implementation adds backspace chars to buffer
  // This is consistent with xterm behavior where backspace is sent as a char
  it('includes backspace character in output', () => {
    expect(
      terminalInputHistoryRows([
        terminalInput(0, 'p'),
        terminalInput(1, 'w'),
        terminalInput(2, '\b'),
        terminalInput(3, 'd'),
        terminalInput(4, '\r'),
      ])
    ).toEqual([{ sequence: 0, source: 'user', text: 'pw\bd' }]);
  });
});

describe('terminalMuxMetadata', () => {
  it('surfaces the persisted PTY pid from terminal projections', () => {
    const terminalSessions: readonly TerminalProjection[] = [terminalProjection()];

    const metadata = terminalMuxMetadata({
      activeProject: null,
      activeTerminalSessionId: sessionId,
      selectedWorktreePath: null,
      terminalSessions,
      threadEvents: [],
      worktrees: [],
    });

    expect(metadata.pid).toBe('4242');
    expect(metadata.exit).toBe('exit 127');
    expect(metadata.processes).toBe('1 observed');
    expect(metadata.files).toBe('1 changed');
  });

  it('handles missing pid and exit gracefully', () => {
    const minimalSession: TerminalProjection = {
      id: sessionId,
      runtime: 'pty',
      status: 'running',
      workingDirectory: '/repo',
    };

    const metadata = terminalMuxMetadata({
      activeProject: null,
      activeTerminalSessionId: sessionId,
      selectedWorktreePath: null,
      terminalSessions: [minimalSession],
      threadEvents: [],
      worktrees: [],
    });

    expect(metadata.pid).toBe('No pid recorded');
    expect(metadata.exit).toBe('No exit recorded');
    expect(metadata.processes).toBe('No process snapshot');
    expect(metadata.files).toBe('No file delta');
  });
});

describe('terminalProcessEvidenceRows', () => {
  it('extracts process rows from terminal projection', () => {
    const terminal = terminalProjection();

    expect(terminalProcessEvidenceRows(terminal)).toEqual([
      {
        pid: 4242,
        ppid: 1,
        command: 'bash',
        args: 'bash',
        cpu: '0.0%',
        memory: '0.1%',
      },
    ]);
  });

  it('returns empty for session without process snapshot', () => {
    const minimalSession: TerminalProjection = {
      id: sessionId,
      runtime: 'pty',
      status: 'running',
      workingDirectory: '/repo',
    };

    expect(terminalProcessEvidenceRows(minimalSession)).toEqual([]);
  });
});

describe('terminalFileEvidenceRows', () => {
  it('extracts file delta rows from terminal projection', () => {
    const terminal = terminalProjection();

    expect(terminalFileEvidenceRows(terminal)).toEqual([
      {
        path: 'src/app.ts',
        changeType: 'modified',
        size: '10 -> 20',
      },
    ]);
  });

  it('returns empty for session without file delta', () => {
    const minimalSession: TerminalProjection = {
      id: sessionId,
      runtime: 'pty',
      status: 'running',
      workingDirectory: '/repo',
    };

    expect(terminalFileEvidenceRows(minimalSession)).toEqual([]);
  });
});

function terminalProjection(): TerminalProjection {
  return {
    id: sessionId,
    runtime: 'pty',
    status: 'running',
    workingDirectory: '/repo',
    command: 'bash',
    pid: 4242,
    exitCode: 127,
    exitClassification: {
      kind: 'command_not_found',
      label: 'exit 127',
      summary: 'Command was not found by the shell.',
      recommendation: 'Check PATH, package installation, and the command name.',
      exitCode: 127,
    },
    latestProcessSnapshot: {
      id: 'proc_snapshot_1',
      sessionId,
      phase: 'running',
      rootPid: 4242,
      capturedAt: new Date('2026-05-20T01:00:00.000Z'),
      nodes: [
        {
          pid: 4242,
          ppid: 1,
          command: 'bash',
          args: 'bash',
          cpuPercent: 0,
          memoryPercent: 0.1,
        },
      ],
    },
    latestFileDeltaSnapshot: {
      id: 'file_delta_1',
      sessionId,
      phase: 'running',
      rootPath: '/repo',
      capturedAt: new Date('2026-05-20T01:00:01.000Z'),
      changes: [
        {
          path: 'src/app.ts',
          changeType: 'modified',
          previousSize: 10,
          currentSize: 20,
        },
      ],
    },
  };
}

function terminalInput(
  sequence: number,
  text: string,
  source: TerminalInputProjection['source'] = 'user'
): TerminalInputProjection {
  return {
    sessionId,
    sequence,
    timestamp: new Date('2026-05-18T01:00:00.000Z'),
    text,
    source,
  };
}
