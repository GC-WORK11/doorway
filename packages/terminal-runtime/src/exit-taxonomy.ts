import type { TerminalExitClassification } from '@doorway/protocol';

const SIGNALS: Record<
  number,
  {
    readonly kind: TerminalExitClassification['kind'];
    readonly label: string;
    readonly summary: string;
    readonly recommendation: string;
  }
> = {
  2: {
    kind: 'interrupted',
    label: 'SIGINT',
    summary: 'Process interrupted by Ctrl+C or an interrupt signal.',
    recommendation: 'Treat this as a user or harness interruption, not a command failure.',
  },
  6: {
    kind: 'aborted',
    label: 'SIGABRT',
    summary: 'Process aborted, commonly from an assertion failure or runtime panic.',
    recommendation: 'Inspect the terminal output and crash logs around the abort.',
  },
  9: {
    kind: 'killed',
    label: 'SIGKILL',
    summary: 'Process was killed. This can indicate OOM, timeout, or an external kill.',
    recommendation: 'Check resource usage, timeout policy, and parent process evidence.',
  },
  11: {
    kind: 'segmentation_fault',
    label: 'SIGSEGV',
    summary: 'Process crashed with a segmentation fault.',
    recommendation: 'Inspect native crashes, memory access, or dependency/runtime failures.',
  },
  15: {
    kind: 'terminated',
    label: 'SIGTERM',
    summary: 'Process received a graceful termination request.',
    recommendation: 'Check whether the user, harness, or parent process requested shutdown.',
  },
};

const EXIT_CODES: Record<number, Omit<TerminalExitClassification, 'exitCode'>> = {
  0: {
    kind: 'success',
    label: 'exit 0',
    summary: 'Command exited successfully.',
    recommendation: 'No exit-code action needed.',
  },
  1: {
    kind: 'general_error',
    label: 'exit 1',
    summary: 'Command failed with a general error.',
    recommendation: 'Inspect stderr and nearby terminal output for the concrete failure.',
  },
  2: {
    kind: 'usage_error',
    label: 'exit 2',
    summary: 'Command likely failed because of invalid usage or arguments.',
    recommendation: 'Check the command syntax and help output.',
  },
  126: {
    kind: 'permission_denied',
    label: 'exit 126',
    summary: 'Command was found but could not be executed.',
    recommendation: 'Check executable permissions and shell policy.',
  },
  127: {
    kind: 'command_not_found',
    label: 'exit 127',
    summary: 'Command was not found by the shell.',
    recommendation: 'Check PATH, package installation, and the command name.',
  },
  130: {
    kind: 'interrupted',
    label: 'exit 130',
    summary: 'Command ended after SIGINT/Ctrl+C.',
    recommendation: 'Treat this as an interruption unless output shows another cause.',
  },
};

export function signalNumberFromValue(
  signal: string | number | null | undefined
): number | undefined {
  if (typeof signal === 'number') {
    return signal;
  }
  if (!signal) {
    return undefined;
  }
  const trimmed = signal.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const known = Object.entries(SIGNALS).find(([, info]) => info.label === trimmed.toUpperCase());
  return known ? Number(known[0]) : undefined;
}

export function classifyTerminalExit(options: {
  readonly exitCode?: number;
  readonly signal?: string | number | null;
}): TerminalExitClassification {
  const signalNumber = signalNumberFromValue(options.signal);
  const exitSignalNumber =
    signalNumber ??
    (options.exitCode !== undefined && options.exitCode >= 128
      ? options.exitCode - 128
      : undefined);

  if (exitSignalNumber !== undefined) {
    const info = SIGNALS[exitSignalNumber] ?? {
      kind: 'signal' as const,
      label: `signal ${exitSignalNumber}`,
      summary: `Process exited because of signal ${exitSignalNumber}.`,
      recommendation: 'Inspect process tree and terminal output for who sent the signal.',
    };
    return {
      ...info,
      ...(options.exitCode !== undefined ? { exitCode: options.exitCode } : {}),
      ...(options.signal ? { signal: String(options.signal) } : {}),
      signalNumber: exitSignalNumber,
    };
  }

  if (options.exitCode !== undefined) {
    const info =
      EXIT_CODES[options.exitCode] ??
      ({
        kind: 'unknown',
        label: `exit ${options.exitCode}`,
        summary: `Command exited with code ${options.exitCode}.`,
        recommendation: 'Inspect terminal output for command-specific meaning.',
      } satisfies Omit<TerminalExitClassification, 'exitCode'>);
    return { ...info, exitCode: options.exitCode };
  }

  return {
    kind: 'unknown',
    label: 'unknown exit',
    summary: 'Doorway did not receive an exit code or signal.',
    recommendation:
      'Check whether the session detached or the runtime failed to report exit status.',
  };
}
