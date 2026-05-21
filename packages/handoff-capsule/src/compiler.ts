/**
 * Capsule Compiler
 *
 * Compiles thread state into portable handoff capsules.
 * Supports JSON, Markdown, and minimal formats.
 */

import type { ThreadSummary, RunSummary } from '@doorway/protocol';
import type {
  HandoffCapsule,
  CapsuleOptions,
  CapsuleFormat,
  ChangedFile,
  TestStatus,
} from './types.js';

const DOORWAY_VERSION = '0.1.0';

export interface CapsuleCompileOptions {
  readonly threadId: string;
  readonly summary: ThreadSummary;
  readonly latestIntent: string;
  readonly runSummaries: readonly RunSummary[];
  readonly worktreePath?: string;
  readonly branch?: string;
  readonly changedFiles: readonly ChangedFile[];
  readonly diffSummary: string;
  readonly testStatus?: TestStatus;
  readonly openQuestions: readonly string[];
  readonly nextPrompt: string;
  readonly createdBy?: 'user' | 'agent';
  readonly targetProvider?: string;
}

/**
 * Compile thread state into a handoff capsule.
 */
export function compileCapsule(options: CapsuleCompileOptions): HandoffCapsule {
  const {
    threadId,
    summary,
    latestIntent,
    runSummaries,
    worktreePath,
    branch,
    changedFiles,
    diffSummary,
    testStatus,
    openQuestions,
    nextPrompt,
    createdBy = 'agent',
    targetProvider,
  } = options;

  const id = `capsule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    threadId: threadId as import('@doorway/protocol').ThreadId,
    createdAt: new Date(),
    summary,
    latestIntent,
    runSummaries,
    worktreePath,
    branch,
    changedFiles,
    diffSummary,
    testStatus,
    openQuestions,
    nextPrompt,
    metadata: {
      createdBy,
      targetProvider: targetProvider as import('@doorway/protocol').ProviderId | undefined,
      version: '1.0.0',
      doorwayVersion: DOORWAY_VERSION,
    },
  };
}

/**
 * Compile capsule to multiple formats.
 */
export function compileCapsuleFormats(options: CapsuleCompileOptions): CapsuleFormat {
  const capsule = compileCapsule(options);

  return {
    json: toJson(capsule),
    markdown: toMarkdown(capsule),
    minimal: toMinimal(capsule),
  };
}

/**
 * Convert capsule to JSON string.
 */
export function toJson(capsule: HandoffCapsule): string {
  return JSON.stringify(capsule, null, 2);
}

/**
 * Convert capsule to human-readable Markdown.
 */
export function toMarkdown(capsule: HandoffCapsule): string {
  const lines: string[] = [];

  // Header
  lines.push('# Handoff Capsule');
  lines.push('');
  lines.push(`**Created:** ${capsule.createdAt.toISOString()}`);
  if (capsule.metadata.targetProvider) {
    lines.push(`**Target:** ${capsule.metadata.targetProvider}`);
  }
  lines.push('');

  // Summary
  lines.push('## Thread Summary');
  lines.push('');
  lines.push(`- **Title:** ${capsule.summary.title}`);
  lines.push(`- **Messages:** ${capsule.summary.messageCount}`);
  lines.push(`- **Agent Runs:** ${capsule.summary.agentRunCount}`);
  if (capsule.summary.duration) {
    lines.push(`- **Duration:** ${formatDuration(capsule.summary.duration)}`);
  }
  lines.push('');

  // Latest Intent
  lines.push('## Latest Intent');
  lines.push('');
  lines.push(capsule.latestIntent);
  lines.push('');

  // Agent Runs
  if (capsule.runSummaries.length > 0) {
    lines.push('## Agent Runs');
    lines.push('');
    for (const run of capsule.runSummaries) {
      lines.push(`### ${run.role}`);
      lines.push(`- **Status:** ${run.status}`);
      if (run.exitCode !== undefined) {
        lines.push(`- **Exit Code:** ${run.exitCode}`);
      }
      lines.push(`- **Files Changed:** ${run.filesChanged}`);
      if (run.testsPassed !== undefined) {
        lines.push(`- **Tests Passed:** ${run.testsPassed ? '✅' : '❌'}`);
      }
      lines.push('');
    }
  }

  // Worktree
  if (capsule.worktreePath) {
    lines.push('## Worktree');
    lines.push('');
    lines.push(`- **Path:** \`${capsule.worktreePath}\``);
    if (capsule.branch) {
      lines.push(`- **Branch:** \`${capsule.branch}\``);
    }
    lines.push('');
  }

  // Changes
  if (capsule.changedFiles.length > 0) {
    lines.push('## Changed Files');
    lines.push('');
    lines.push(`| File | Status | Changes |`);
    lines.push('|------|--------|---------|');
    for (const file of capsule.changedFiles) {
      const statusIcon = file.status === 'added' ? '➕' : file.status === 'deleted' ? '🗑️' : '📝';
      lines.push(
        `| ${file.path} | ${statusIcon} ${file.status} | +${file.additions}/-${file.deletions} |`
      );
    }
    lines.push('');
    lines.push('**Diff Summary:**');
    lines.push('```');
    lines.push(capsule.diffSummary);
    lines.push('```');
    lines.push('');
  }

  // Test Status
  if (capsule.testStatus) {
    lines.push('## Test Status');
    lines.push('');
    const statusIcon =
      capsule.testStatus === 'pass'
        ? '✅'
        : capsule.testStatus === 'fail'
          ? '❌'
          : capsule.testStatus === 'pending'
            ? '⏳'
            : '⬜';
    lines.push(`${statusIcon} ${capsule.testStatus}`);
    lines.push('');
  }

  // Open Questions
  if (capsule.openQuestions.length > 0) {
    lines.push('## Open Questions');
    lines.push('');
    for (const q of capsule.openQuestions) {
      lines.push(`- [ ] ${q}`);
    }
    lines.push('');
  }

  // Next Prompt
  lines.push('## Next Prompt');
  lines.push('');
  lines.push('```');
  lines.push(capsule.nextPrompt);
  lines.push('```');
  lines.push('');

  // Footer
  lines.push('---');
  lines.push(`*Generated by Doorway v${DOORWAY_VERSION}*`);

  return lines.join('\n');
}

/**
 * Convert capsule to minimal format for quick handoff.
 */
export function toMinimal(capsule: HandoffCapsule): string {
  const lines: string[] = [];

  lines.push(`# ${capsule.summary.title}`);
  lines.push('');
  lines.push(`**Goal:** ${capsule.latestIntent}`);
  lines.push('');

  if (capsule.worktreePath) {
    lines.push(
      `**Worktree:** \`${capsule.worktreePath}\` ${capsule.branch ? `(branch: ${capsule.branch})` : ''}`
    );
    lines.push('');
  }

  if (capsule.changedFiles.length > 0) {
    lines.push(
      `**Files:** ${capsule.changedFiles.length} changed (+${getTotalAdditions(capsule.changedFiles)}/-${getTotalDeletions(capsule.changedFiles)})`
    );
    lines.push('');
  }

  if (capsule.testStatus) {
    const statusIcon =
      capsule.testStatus === 'pass'
        ? '✅'
        : capsule.testStatus === 'fail'
          ? '❌'
          : capsule.testStatus === 'pending'
            ? '⏳'
            : '⬜';
    lines.push(`**Tests:** ${statusIcon} ${capsule.testStatus}`);
    lines.push('');
  }

  lines.push('**Next:**');
  lines.push(capsule.nextPrompt);

  return lines.join('\n');
}

/**
 * Parse a capsule from JSON format.
 */
export function parseJsonCapsule(json: string): HandoffCapsule {
  try {
    const parsed = JSON.parse(json);

    // Validate required fields
    if (!parsed.id || !parsed.threadId || !parsed.summary || !parsed.latestIntent) {
      throw new Error('Missing required fields');
    }

    // Convert date strings back to Date objects
    parsed.createdAt = new Date(parsed.createdAt);
    if (parsed.summary.duration) {
      // duration is a number, no conversion needed
    }

    return parsed as HandoffCapsule;
  } catch (error) {
    throw new Error(
      `Failed to parse capsule JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Helper functions
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function getTotalAdditions(files: readonly ChangedFile[]): number {
  return files.reduce((sum, f) => sum + f.additions, 0);
}

function getTotalDeletions(files: readonly ChangedFile[]): number {
  return files.reduce((sum, f) => sum + f.deletions, 0);
}
