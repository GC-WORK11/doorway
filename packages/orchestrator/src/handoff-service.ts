import type { Database } from 'better-sqlite3';
import { generateId, recordEvent } from '@doorway/core';
import type { AgentRunId, HandoffCapsuleId, ThreadId } from '@doorway/protocol';
import type { AgentEvent } from './index.js';
import type { BrainService } from './brain/brain-service.js';

const HANDOFF_TERMINAL_EVENT_LIMIT = 80;
const HANDOFF_SUMMARY_OUTPUT_CHAR_LIMIT = 4000;

export interface HandoffPacket {
  id: string;
  threadId: string;
  runId: string;
  goal: string;
  summary: string;
  changedFiles: string[];
  testFailures?: string;
  lastTerminalLines: string;
  riskFlags: string[];
  nextAction: string;
  providerType: string;
  worktreePath?: string;
  branch?: string;
}

export function lastTerminalOutput(events: readonly AgentEvent[]): string {
  return events
    .filter((event) => event.type === 'stdout' || event.type === 'stderr')
    .slice(-HANDOFF_TERMINAL_EVENT_LIMIT)
    .map((event) => (event.type === 'stderr' ? `[stderr] ${event.data}` : event.data))
    .join('\n');
}

export function terminalOutputForSummary(output: string): string {
  return output.slice(-HANDOFF_SUMMARY_OUTPUT_CHAR_LIMIT);
}

export function handoffLocationLines(
  packet: Pick<HandoffPacket, 'worktreePath' | 'branch'>
): string {
  return [
    packet.worktreePath ? `WORKTREE: ${packet.worktreePath}` : undefined,
    packet.branch ? `BRANCH: ${packet.branch}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export function scrubHandoffSecrets(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9]{32,}/g, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]')
    .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED]')
    .replace(/("password":\s*)".*?"/g, '$1"[REDACTED]"')
    .replace(/("secret":\s*)".*?"/g, '$1"[REDACTED]"');
}

/**
 * HandoffPacketService
 *
 * Manages the creation and storage of provider-aware handoff packets.
 */
export class HandoffPacketService {
  constructor(private db: Database) {}

  /**
   * Create a handoff packet from an agent run.
   */
  async createPacket(options: {
    threadId: string;
    runId: string;
    goal: string;
    events: AgentEvent[];
    changedFiles: string[];
    providerType: string;
    worktreePath?: string;
    branch?: string;
    brain?: BrainService;
  }): Promise<HandoffPacket> {
    const packetId = generateId('hnd');
    const now = new Date().toISOString();

    // 1. Context Pruning
    const lastLines = lastTerminalOutput(options.events);

    // 2. Local Secret Scrubber
    const cleanLines = scrubHandoffSecrets(lastLines);

    // 3. LLM-based Summary (Phase 7A)
    let summary = `Agent finished ${options.goal}. Touched ${options.changedFiles.length} files.`;

    if (options.brain) {
      try {
        summary = await options.brain.executeRole('handoff_summarizer', {
          messages: [
            {
              role: 'system',
              content:
                'You are the Doorway Handoff Summarizer. Summarize the progress of an agent run based on its goal, files changed, and terminal output. Be concise.',
            },
            {
              role: 'user',
              content: `GOAL: ${options.goal}\nFILES: ${options.changedFiles.join(', ')}\nOUTPUT:\n${terminalOutputForSummary(cleanLines)}`,
            },
          ],
        });
      } catch (err) {
        console.warn('[Handoff] Brain summarization failed, falling back to deterministic:', err);
      }
    }

    const packet: HandoffPacket = {
      id: packetId,
      threadId: options.threadId,
      runId: options.runId,
      goal: options.goal,
      summary,
      changedFiles: options.changedFiles,
      lastTerminalLines: cleanLines,
      riskFlags: options.changedFiles.some((f) => f.includes('lock') || f.includes('.env'))
        ? ['high-risk-files']
        : [],
      nextAction: 'Continue implementation or verify changes.',
      providerType: options.providerType,
      ...(options.worktreePath ? { worktreePath: options.worktreePath } : {}),
      ...(options.branch ? { branch: options.branch } : {}),
    };

    // Store in DB
    this.db
      .prepare(
        `
      INSERT INTO handoff_capsules (
        id, thread_id, source_run_id, target_provider, summary, latest_intent, run_summary,
        worktree_path, branch, changed_files, diff_summary, next_prompt, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        packet.id,
        packet.threadId,
        packet.runId,
        packet.providerType,
        packet.summary,
        packet.goal,
        packet.summary,
        packet.worktreePath ?? null,
        packet.branch ?? null,
        JSON.stringify(packet.changedFiles),
        packet.lastTerminalLines,
        packet.nextAction,
        now
      );

    recordEvent(this.db, packet.threadId as ThreadId, 'handoff.created', {
      capsuleId: packet.id as HandoffCapsuleId,
      threadId: packet.threadId as ThreadId,
      sourceRunId: packet.runId as AgentRunId,
    });

    return packet;
  }

  /**
   * Format a packet for a specific provider.
   */
  formatForProvider(packet: HandoffPacket, target: string): string {
    const locationLines = handoffLocationLines(packet);
    const locationBlock = locationLines ? `${locationLines}\n` : '';

    if (target === 'codex') {
      return `
=== CODEX HANDOFF ===
GOAL: ${packet.goal}
${locationBlock}RUN: ${packet.runId}
FILES: ${packet.changedFiles.join(', ')}
LAST COMMANDS:
${packet.lastTerminalLines}
NEXT: ${packet.nextAction}
      `.trim();
    }

    if (target === 'reviewer') {
      return `
=== REVIEW REQUEST ===
GOAL: ${packet.goal}
${locationBlock}RUN: ${packet.runId}
CHANGES TO REVIEW: ${packet.changedFiles.join(', ')}
RISKS: ${packet.riskFlags.join(', ')}
SUMMARY: ${packet.summary}
      `.trim();
    }

    // Default Claude-style (rich reasoning)
    return `
=== CROSS-AGENT CONTINUITY ===
I am handing off a task to you. 
ORIGINAL GOAL: ${packet.goal}
PREVIOUS SUMMARY: ${packet.summary}
${locationBlock}RUN: ${packet.runId}
FILES MODIFIED: ${packet.changedFiles.join(', ')}

TRANSCRIPT SNIPPET (LAST 80 LINES):
---
${packet.lastTerminalLines}
---

INSTRUCTION: ${packet.nextAction}
    `.trim();
  }
}
