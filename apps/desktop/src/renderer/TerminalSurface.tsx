import { useEffect, useMemo, useRef } from 'react';
import type { IDisposable, Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { TranscriptChunk } from '@doorway/protocol';
import '@xterm/xterm/css/xterm.css';

export function terminalSurfaceText(
  chunks: readonly TranscriptChunk[],
  fallbackText: string
): string {
  const transcriptText = [...chunks]
    .sort((left, right) => left.sequence - right.sequence)
    .map((chunk) => chunk.text)
    .join('');
  return transcriptText || fallbackText;
}

export function terminalSurfaceStatusLabel(
  chunks: readonly TranscriptChunk[],
  activeTerminalSessionId: string | null
): string {
  if (chunks.length > 0) {
    return `${chunks.length} ${chunks.length === 1 ? 'chunk' : 'chunks'} persisted`;
  }

  return activeTerminalSessionId
    ? `Terminal session ${activeTerminalSessionId}`
    : 'No terminal session';
}

interface TerminalSurfaceWriteState {
  readonly sessionId: string | null;
  readonly renderedSequences: readonly number[];
}

interface TerminalSurfaceWritePlan {
  readonly reset: boolean;
  readonly text: string;
  readonly nextState: TerminalSurfaceWriteState;
}

interface LiveTerminalDataPayload {
  readonly sessionId: string;
  readonly data: string;
}

interface LiveTerminalBridge {
  onTerminalData?(callback: (payload: LiveTerminalDataPayload) => void): () => void;
}

function terminalSurfaceWritePlan(
  state: TerminalSurfaceWriteState,
  chunks: readonly TranscriptChunk[],
  fallbackText: string,
  activeTerminalSessionId: string | null
): TerminalSurfaceWritePlan {
  const sortedChunks = [...chunks].sort((left, right) => left.sequence - right.sequence);
  const nextSequences = sortedChunks.map((chunk) => chunk.sequence);
  const sessionChanged = state.sessionId !== activeTerminalSessionId;
  const canAppend =
    !sessionChanged &&
    state.renderedSequences.length <= nextSequences.length &&
    state.renderedSequences.every((sequence, index) => nextSequences[index] === sequence);

  if (!canAppend) {
    return {
      reset: true,
      text: terminalSurfaceText(sortedChunks, fallbackText),
      nextState: {
        sessionId: activeTerminalSessionId,
        renderedSequences: nextSequences,
      },
    };
  }

  const appendedChunks = sortedChunks.slice(state.renderedSequences.length);
  return {
    reset: false,
    text: appendedChunks.map((chunk) => chunk.text).join(''),
    nextState: {
      sessionId: activeTerminalSessionId,
      renderedSequences: nextSequences,
    },
  };
}

export function TerminalSurface({
  terminalTranscript,
  fallbackText,
  activeTerminalSessionId,
  onInput,
  onResize,
}: {
  readonly terminalTranscript: readonly TranscriptChunk[];
  readonly fallbackText: string;
  readonly activeTerminalSessionId: string | null;
  readonly onInput?: (data: string) => unknown;
  readonly onResize?: (cols: number, rows: number) => unknown;
}) {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputRef = useRef(onInput);
  const resizeRef = useRef(onResize);
  const terminalTextRef = useRef('');
  const writeStateRef = useRef<TerminalSurfaceWriteState>({
    sessionId: null,
    renderedSequences: [],
  });
  const terminalText = useMemo(
    () => terminalSurfaceText(terminalTranscript, fallbackText),
    [fallbackText, terminalTranscript]
  );
  const statusLabel = terminalSurfaceStatusLabel(terminalTranscript, activeTerminalSessionId);
  const canWrite = Boolean(activeTerminalSessionId && onInput);

  useEffect(() => {
    terminalTextRef.current = terminalText;
  }, [terminalText]);

  useEffect(() => {
    inputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    resizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    let mountedTerminal: XTermTerminal | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const disposables: IDisposable[] = [];

    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(
      ([{ Terminal }, { FitAddon }]) => {
        if (disposed) {
          return;
        }

        const terminal = new Terminal({
          allowProposedApi: false,
          convertEol: true,
          cursorBlink: false,
          disableStdin: !canWrite,
          fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.35,
          scrollback: 5000,
          theme: {
            background: '#101113',
            foreground: '#eef0f3',
            cursor: '#eef0f3',
            black: '#101113',
            brightBlack: '#6f7682',
            red: '#e26d5c',
            brightRed: '#ff8f7d',
            green: '#5ebc83',
            brightGreen: '#7bd99e',
            yellow: '#d9a441',
            brightYellow: '#f0c35c',
            blue: '#6c8dd5',
            brightBlue: '#86a8f4',
            magenta: '#af8bdc',
            brightMagenta: '#c9a7f2',
            cyan: '#55b6c2',
            brightCyan: '#77d3de',
            white: '#d8dce2',
            brightWhite: '#ffffff',
          },
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        disposables.push(
          terminal.onData((data) => {
            void inputRef.current?.(data);
          }),
          terminal.onResize(({ cols, rows }) => {
            void resizeRef.current?.(cols, rows);
          })
        );
        terminal.open(host);
        fitAddon.fit();
        void resizeRef.current?.(terminal.cols, terminal.rows);
        terminal.write(terminalTextRef.current);
        writeStateRef.current = {
          sessionId: activeTerminalSessionId,
          renderedSequences: [...terminalTranscript]
            .sort((left, right) => left.sequence - right.sequence)
            .map((chunk) => chunk.sequence),
        };
        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;
        mountedTerminal = terminal;

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
          });
          resizeObserver.observe(host);
        }
      }
    );

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      for (const disposable of disposables) {
        disposable.dispose();
      }
      fitAddonRef.current = null;
      terminalRef.current = null;
      mountedTerminal?.dispose();
    };
  }, []);

  // Native 60fps Live Streaming via IPC
  useEffect(() => {
    if (!activeTerminalSessionId) return;
    const doorwayBridge = (window as unknown as { doorway?: LiveTerminalBridge }).doorway;
    const unsubscribe = doorwayBridge?.onTerminalData?.((payload) => {
      if (payload.sessionId === activeTerminalSessionId && terminalRef.current) {
        terminalRef.current.write(payload.data);
      }
    });
    return unsubscribe;
  }, [activeTerminalSessionId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.disableStdin = !canWrite;
    }
  }, [canWrite]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    const plan = terminalSurfaceWritePlan(
      writeStateRef.current,
      terminalTranscript,
      fallbackText,
      activeTerminalSessionId
    );
    // Only reset if the session changed or we lost data.
    // Live appends are handled by the native onTerminalData IPC subscriber above!
    if (plan.reset) {
      terminal.reset();
      if (plan.text) {
        terminal.write(plan.text);
      }
    }
    writeStateRef.current = plan.nextState;
  }, [activeTerminalSessionId, fallbackText, terminalTranscript]);

  return (
    <section
      className="terminal-surface"
      aria-label="Managed terminal surface"
      data-interactive={canWrite ? 'true' : 'false'}
    >
      <header className="terminal-surface__header">
        <strong>Doorway PTY</strong>
        <span>{canWrite ? `${statusLabel} - interactive` : statusLabel}</span>
      </header>
      <div
        className="terminal-surface__viewport"
        ref={terminalHostRef}
        role="region"
        aria-label="xterm terminal transcript"
      />
      <pre className="terminal-surface__text" aria-label="Terminal transcript text">
        {terminalText}
      </pre>
    </section>
  );
}
