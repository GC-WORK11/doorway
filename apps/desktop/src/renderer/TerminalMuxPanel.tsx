import type {
  DoorwayEvent,
  ProjectProjection,
  TerminalInputProjection,
  TerminalProjection,
  TerminalSessionId,
  TranscriptChunk,
  WorktreeProjection,
} from '@doorway/protocol';
import { TerminalSurface } from './TerminalSurface';
import { motion, AnimatePresence } from 'framer-motion';
import { ProcessTreePanel } from './ProcessTreePanel';
import { FileDeltaPanel } from './FileDeltaPanel';
import { ExitTaxonomyPanel } from './ExitTaxonomyPanel';

type TerminalAttention =
  | 'running'
  | 'needs-input'
  | 'needs-approval'
  | 'quiet'
  | 'possibly-stuck'
  | 'stuck'
  | 'completed'
  | 'failed';

const terminalAttentionLabels: Record<TerminalAttention, string> = {
  running: 'running',
  'needs-input': 'needs input',
  'needs-approval': 'needs approval',
  quiet: 'quiet',
  'possibly-stuck': 'possibly stuck',
  stuck: 'stuck',
  completed: 'completed',
  failed: 'failed',
};

interface MutableTerminalSessionSummary {
  id: string;
  status: string;
  chunkCount: number;
  latestText: string;
  latestTimestamp: number;
  attention: TerminalAttention;
  command?: string;
  runtime?: string;
  pid?: number;
  exitLabel?: string;
}

interface TerminalSessionSummary {
  readonly id: string;
  readonly status: string;
  readonly chunkCount: number;
  readonly latestText: string;
  readonly attention: TerminalAttention;
  readonly command?: string;
  readonly runtime?: string;
  readonly pid?: number;
  readonly exitLabel?: string;
}

interface TerminalMuxMetadata {
  readonly run: string;
  readonly worktree: string;
  readonly branch: string;
  readonly cwd: string;
  readonly latestCommand: string;
  readonly pid: string;
  readonly exit: string;
  readonly processes: string;
  readonly files: string;
  readonly ports: string;
}

interface TerminalProcessEvidenceRow {
  readonly pid: number;
  readonly ppid: number;
  readonly command: string;
  readonly args: string;
  readonly cpu: string;
  readonly memory: string;
}

interface TerminalFileEvidenceRow {
  readonly path: string;
  readonly changeType: string;
  readonly size: string;
}

interface TerminalInputHistoryRow {
  readonly sequence: number;
  readonly source: TerminalInputProjection['source'];
  readonly text: string;
}

function payloadRecord(event: DoorwayEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' ? value : undefined;
}

function trimTerminalText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

function terminalAttentionFromStatus(status: string): TerminalAttention {
  switch (status) {
    case 'running':
      return 'running';
    case 'waiting':
      return 'needs-input';
    case 'stopped':
      return 'completed';
    case 'crashed':
      return 'failed';
    case 'paused':
    case 'detached':
    case 'created':
    default:
      return 'quiet';
  }
}

function terminalAttentionFromEventState(state: string): TerminalAttention | undefined {
  switch (state) {
    case 'running':
      return 'running';
    case 'needs_input':
      return 'needs-input';
    case 'needs_approval':
      return 'needs-approval';
    case 'quiet':
      return 'quiet';
    case 'possibly_stuck':
      return 'possibly-stuck';
    case 'stuck':
      return 'stuck';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return undefined;
  }
}

function terminalAttentionFromText(text: string, isStderr: boolean): TerminalAttention | undefined {
  const normalized = text.toLowerCase();
  if (
    /needs?\s+(approval|permission)|permission\s+(required|request)|approve|authorize|allow\s+/.test(
      normalized
    )
  ) {
    return 'needs-approval';
  }
  if (
    /waiting\s+for\s+(input|reply|response)|press\s+enter|continue\?|proceed\?|yes\/no|\[y\/n\]|enter\s+(a\s+)?choice|select\s+an\s+option|password:|passphrase:/.test(
      normalized
    )
  ) {
    return 'needs-input';
  }
  if (/loop\s+detected|stuck|timed?\s*out|retrying|rate\s+limit|deadlock/.test(normalized)) {
    return 'stuck';
  }
  if (
    isStderr ||
    /\b(fatal|panic|exception|permission denied|command not found)\b/.test(normalized)
  ) {
    return 'failed';
  }
  return undefined;
}

function applyOutputAttention(
  summary: MutableTerminalSessionSummary,
  text: string,
  isStderr: boolean
): void {
  const detected = terminalAttentionFromText(text, isStderr);
  if (!detected) {
    return;
  }
  if (summary.attention === 'completed' && detected !== 'failed') {
    return;
  }
  summary.attention = detected;
}

function ensureSummary(
  summaries: Map<string, MutableTerminalSessionSummary>,
  sessionId: string
): MutableTerminalSessionSummary {
  const existing = summaries.get(sessionId);
  if (existing) {
    return existing;
  }

  const created: MutableTerminalSessionSummary = {
    id: sessionId,
    status: 'recorded',
    chunkCount: 0,
    latestText: '',
    latestTimestamp: 0,
    attention: 'quiet',
  };
  summaries.set(sessionId, created);
  return created;
}

export function terminalSessionSummaries({
  activeTerminalSessionId,
  terminalSessions,
  terminalTranscript,
  threadEvents,
}: {
  readonly activeTerminalSessionId: string | null;
  readonly terminalSessions: readonly TerminalProjection[];
  readonly terminalTranscript: readonly TranscriptChunk[];
  readonly threadEvents: readonly DoorwayEvent[];
}): readonly TerminalSessionSummary[] {
  const summaries = new Map<string, MutableTerminalSessionSummary>();

  for (const session of terminalSessions) {
    const summary = ensureSummary(summaries, session.id);
    summary.status = session.status;
    summary.attention = terminalAttentionFromStatus(session.status);
    summary.command = session.command;
    summary.runtime = session.runtime;
    summary.pid = session.pid;
    summary.exitLabel = session.exitClassification?.label;
    summary.latestText = trimTerminalText(session.lastOutput ?? '');
    applyOutputAttention(summary, session.lastOutput ?? '', false);
  }

  if (activeTerminalSessionId) {
    const active = ensureSummary(summaries, activeTerminalSessionId);
    if (active.status === 'recorded') {
      active.status = 'running';
      active.attention = 'running';
    }
  }

  for (const event of [...threadEvents].sort((left, right) => left.sequence - right.sequence)) {
    if (!event.type.startsWith('terminal.') && event.type !== 'agent.attention') {
      continue;
    }

    const payload = payloadRecord(event);
    const sessionId = payloadString(payload, 'sessionId');
    if (!sessionId) {
      continue;
    }

    const summary = ensureSummary(summaries, sessionId);
    summary.latestTimestamp = Math.max(summary.latestTimestamp, event.timestamp.getTime());

    if (event.type === 'agent.attention') {
      const attention = terminalAttentionFromEventState(payloadString(payload, 'state') ?? '');
      if (attention) {
        summary.attention = attention;
        if (attention === 'completed') {
          summary.status = 'stopped';
        }
        if (attention === 'failed') {
          summary.status = 'failed';
        }
      }
      summary.latestText =
        trimTerminalText(
          payloadString(payload, 'outputPreview') ?? payloadString(payload, 'reason') ?? ''
        ) || summary.latestText;
      continue;
    }

    const command = payloadString(payload, 'command');
    if (command) {
      summary.command = command;
    }

    const runtime = payloadString(payload, 'runtime');
    if (runtime) {
      summary.runtime = runtime;
    }

    const pid = payloadNumber(payload, 'pid');
    if (pid !== undefined) {
      summary.pid = pid;
    }

    if (event.type === 'terminal.started') {
      summary.status = 'running';
      summary.attention = 'running';
    }

    if (event.type === 'terminal.output') {
      const text = payloadString(payload, 'text') ?? '';
      summary.chunkCount += 1;
      summary.latestText = trimTerminalText(text);
      applyOutputAttention(summary, text, payload.isStderr === true);
      if (summary.attention === 'quiet') {
        summary.attention = 'running';
      }
    }

    if (event.type === 'terminal.stopped') {
      const exitCode = payloadNumber(payload, 'exitCode');
      summary.status = exitCode === 0 ? 'stopped' : 'failed';
      summary.attention = exitCode === 0 ? 'completed' : 'failed';
    }
  }

  for (const chunk of terminalTranscript) {
    const summary = ensureSummary(summaries, chunk.sessionId);
    summary.chunkCount += 1;
    summary.latestText = trimTerminalText(chunk.text) || summary.latestText;
    summary.latestTimestamp = Math.max(summary.latestTimestamp, chunk.timestamp.getTime());
    applyOutputAttention(summary, chunk.text, chunk.isStderr);
  }

  return Array.from(summaries.values())
    .map((summary) => {
      const result: TerminalSessionSummary = {
        id: summary.id,
        status: summary.status,
        chunkCount: summary.chunkCount,
        latestText: summary.latestText,
        attention: summary.attention,
        ...(summary.command ? { command: summary.command } : {}),
        ...(summary.runtime ? { runtime: summary.runtime } : {}),
        ...(summary.pid !== undefined ? { pid: summary.pid } : {}),
        ...(summary.exitLabel ? { exitLabel: summary.exitLabel } : {}),
      };
      return result;
    })
    .sort((left, right) => {
      if (left.id === activeTerminalSessionId) return -1;
      if (right.id === activeTerminalSessionId) return 1;
      return left.id.localeCompare(right.id);
    });
}

export function terminalMuxMetadata({
  activeProject,
  activeTerminalSessionId,
  selectedWorktreePath,
  terminalSessions,
  threadEvents,
  worktrees,
}: {
  readonly activeProject: ProjectProjection | null;
  readonly activeTerminalSessionId: string | null;
  readonly selectedWorktreePath: string | null;
  readonly terminalSessions: readonly TerminalProjection[];
  readonly threadEvents: readonly DoorwayEvent[];
  readonly worktrees: readonly WorktreeProjection[];
}): TerminalMuxMetadata {
  const selectedWorktree =
    worktrees.find((worktree) => worktree.path === selectedWorktreePath) ??
    worktrees.find((worktree) => worktree.isActive) ??
    null;
  const latestCommand = [...threadEvents]
    .sort((left, right) => right.sequence - left.sequence)
    .find((event) => {
      const payload = payloadRecord(event);
      return (
        payloadString(payload, 'command') &&
        (!activeTerminalSessionId ||
          payloadString(payload, 'sessionId') === activeTerminalSessionId)
      );
    });
  const latestCommandPayload = latestCommand ? payloadRecord(latestCommand) : undefined;
  const activeSession = activeTerminalSessionId
    ? terminalSessions.find((session) => session.id === activeTerminalSessionId)
    : undefined;

  return {
    run: activeSession?.runId ?? 'No run linked',
    worktree: selectedWorktree?.id ?? 'No worktree selected',
    branch: selectedWorktree?.branch.replace(/^refs\/heads\//, '') ?? 'No branch selected',
    cwd:
      activeSession?.workingDirectory ??
      selectedWorktree?.path ??
      activeProject?.path ??
      'No cwd recorded',
    latestCommand:
      activeSession?.command ??
      (latestCommandPayload
        ? (payloadString(latestCommandPayload, 'command') ?? 'Command unavailable')
        : 'Command unavailable'),
    pid: activeSession?.pid !== undefined ? String(activeSession.pid) : 'No pid recorded',
    exit: activeSession?.exitClassification?.label ?? 'No exit recorded',
    processes: activeSession?.latestProcessSnapshot
      ? `${activeSession.latestProcessSnapshot.nodes.length.toString()} observed`
      : 'No process snapshot',
    files: activeSession?.latestFileDeltaSnapshot
      ? `${activeSession.latestFileDeltaSnapshot.changes.length.toString()} changed`
      : 'No file delta',
    ports: 'No ports reported',
  };
}

export function terminalInputHistoryRows(
  terminalInputs: readonly TerminalInputProjection[]
): readonly TerminalInputHistoryRow[] {
  const rows: TerminalInputHistoryRow[] = [];
  let buffer = '';
  let source: TerminalInputProjection['source'] | undefined;
  let sequence = 0;

  const flush = () => {
    const text = buffer.trim();
    if (source && text) {
      rows.push({ sequence, source, text });
    }
    buffer = '';
    source = undefined;
  };

  for (const input of [...terminalInputs].sort((left, right) => left.sequence - right.sequence)) {
    if (source && source !== input.source) {
      flush();
    }
    if (!source) {
      source = input.source;
      sequence = input.sequence;
    }

    const text = input.text.replace(/\r/g, '\n');
    for (const char of text) {
      if (char === '\u0003') {
        flush();
        rows.push({ sequence: input.sequence, source: input.source, text: '^C' });
        continue;
      }
      if (char === '\n') {
        flush();
        continue;
      }
      buffer += char;
    }
  }

  flush();
  return rows;
}

export function terminalProcessEvidenceRows(
  terminalSession: TerminalProjection | null
): readonly TerminalProcessEvidenceRow[] {
  return (
    terminalSession?.latestProcessSnapshot?.nodes.map((node) => ({
      pid: node.pid,
      ppid: node.ppid,
      command: node.command,
      args: node.args,
      cpu: node.cpuPercent === undefined ? 'unknown' : `${node.cpuPercent.toFixed(1)}%`,
      memory: node.memoryPercent === undefined ? 'unknown' : `${node.memoryPercent.toFixed(1)}%`,
    })) ?? []
  );
}

export function terminalFileEvidenceRows(
  terminalSession: TerminalProjection | null
): readonly TerminalFileEvidenceRow[] {
  return (
    terminalSession?.latestFileDeltaSnapshot?.changes.map((change) => ({
      path: change.path,
      changeType: change.changeType,
      size:
        change.previousSize === undefined && change.currentSize === undefined
          ? 'unknown'
          : `${change.previousSize?.toString() ?? '-'} -> ${change.currentSize?.toString() ?? '-'}`,
    })) ?? []
  );
}

import { useHarnessState } from './HarnessContext';

export function TerminalMuxPanel() {
  const {
    activeProject,
    activeTerminalSessionId,
    terminalFallbackText: fallbackText,
    writeActiveTerminal: onInput,
    resizeActiveTerminal: onResize,
    selectTerminalSession: onSelectSession,
    stopActiveTerminal: onStopSession,
    selectedWorktreePath,
    terminalSessions,
    terminalTranscript,
    terminalInputs,
    terminalBlocks,
    threadEvents,
    worktrees,
    createTerminal: onCreateSession,
  } = useHarnessState();
  const sessions = terminalSessionSummaries({
    activeTerminalSessionId,
    terminalSessions,
    terminalTranscript,
    threadEvents,
  });
  const metadata = terminalMuxMetadata({
    activeProject,
    activeTerminalSessionId,
    selectedWorktreePath,
    terminalSessions,
    threadEvents,
    worktrees,
  });
  const activeSummary = sessions.find((session) => session.id === activeTerminalSessionId) ?? null;
  const activeTerminalSession = activeTerminalSessionId
    ? (terminalSessions.find((session) => session.id === activeTerminalSessionId) ?? null)
    : null;
  const canControlActiveTerminal =
    Boolean(activeTerminalSessionId) && activeSummary?.status === 'running';
  const inputHistoryRows = terminalInputHistoryRows(terminalInputs);

  return (
    <section className="terminal-mux" aria-label="Terminal mux">
      <div className="terminal-tab-bar">
        <div className="terminal-tabs-scroll-container" aria-label="Terminal sessions">
          <AnimatePresence initial={false}>
            {sessions.map((session) => {
              const isActive = session.id === activeTerminalSessionId;
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: -20, width: 0 }}
                  animate={{ opacity: 1, x: 0, width: 'auto' }}
                  exit={{ opacity: 0, scale: 0.85, width: 0 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  key={session.id}
                  className={`terminal-tab ${isActive ? 'terminal-tab--active' : ''}`}
                  onClick={() => onSelectSession(session.id)}
                  role="button"
                  aria-label={`Select terminal session ${session.id}`}
                  aria-pressed={isActive ? 'true' : 'false'}
                  data-attention={session.attention}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectSession(session.id);
                    }
                  }}
                >
                  <span
                    className={`terminal-tab-indicator terminal-tab-indicator--${session.attention}`}
                  />
                  {isActive && (
                    <motion.div
                      layoutId="active-terminal-tab"
                      className="absolute inset-0 bg-white/5 border-b-2 border-primary -z-10"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <span className="terminal-tab-title relative z-10">
                    {session.command ?? session.runtime ?? 'Doorway PTY'}
                  </span>
                  <span className="terminal-tab-id relative z-10">{session.id.slice(-6)}</span>
                  <span className="sr-only">{terminalAttentionLabels[session.attention]}</span>
                  <button
                    type="button"
                    className="terminal-tab-close relative z-10"
                    aria-label={`Close session ${session.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isActive) {
                        onStopSession();
                      } else {
                        onSelectSession(session.id);
                        setTimeout(() => {
                          onStopSession();
                        }, 0);
                      }
                    }}
                  >
                    ×
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {onCreateSession && (
            <button
              type="button"
              className="terminal-tab-add"
              aria-label="Create new terminal session"
              onClick={() => void onCreateSession()}
            >
              +
            </button>
          )}
        </div>

        <div className="terminal-tab-actions" aria-label="Terminal session actions">
          <button
            type="button"
            className="terminal-action-btn"
            disabled={!canControlActiveTerminal || !onInput}
            onClick={() => {
              void onInput?.('\u0003');
            }}
          >
            Interrupt
          </button>
          <button
            type="button"
            className="terminal-action-btn"
            disabled={!canControlActiveTerminal}
            onClick={() => {
              void onStopSession();
            }}
          >
            Stop
          </button>
        </div>
      </div>

      <div className="terminal-mux__main">
        <TerminalSurface
          terminalTranscript={terminalTranscript}
          terminalBlocks={terminalBlocks}
          fallbackText={fallbackText}
          activeTerminalSessionId={activeTerminalSessionId as TerminalSessionId | null}
          onInput={onInput}
          onResize={onResize}
        />

        <section className="terminal-input-history" aria-label="Terminal input history">
          <header>
            <strong>Input history</strong>
            <span>{inputHistoryRows.length.toString()}</span>
          </header>
          {inputHistoryRows.length === 0 ? (
            <p>No inputs recorded for this session</p>
          ) : (
            <ol>
              {inputHistoryRows.slice(-5).map((input) => (
                <li key={`${input.source}-${input.sequence}-${input.text}`}>
                  <span>{input.source}</span>
                  <code>{input.text}</code>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section
          className="terminal-evidence-strip"
          aria-label="Terminal evidence details"
          style={{ display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem' }}
        >
          <ProcessTreePanel
            terminalSessions={activeTerminalSession ? [activeTerminalSession] : []}
          />
          <FileDeltaPanel terminalSessions={activeTerminalSession ? [activeTerminalSession] : []} />
          <ExitTaxonomyPanel
            terminalSessions={activeTerminalSession ? [activeTerminalSession] : []}
          />
        </section>

        <footer className="terminal-mux__status" aria-label="Terminal metadata">
          <span>
            <strong>Run</strong>
            <code>{metadata.run}</code>
          </span>
          <span>
            <strong>Worktree</strong>
            <code>{metadata.worktree}</code>
          </span>
          <span>
            <strong>Branch</strong>
            <code>{metadata.branch}</code>
          </span>
          <span>
            <strong>Cwd</strong>
            <code>{metadata.cwd}</code>
          </span>
          <span>
            <strong>Command</strong>
            <code>{metadata.latestCommand}</code>
          </span>
          <span>
            <strong>PID</strong>
            <code>{metadata.pid}</code>
          </span>
          <span>
            <strong>Exit</strong>
            <code>{metadata.exit}</code>
          </span>
          <span>
            <strong>Processes</strong>
            <code>{metadata.processes}</code>
          </span>
          <span>
            <strong>Files</strong>
            <code>{metadata.files}</code>
          </span>
          <span>
            <strong>Ports</strong>
            <code>{metadata.ports}</code>
          </span>
        </footer>
      </div>
    </section>
  );
}
