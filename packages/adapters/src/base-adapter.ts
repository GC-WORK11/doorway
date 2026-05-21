/**
 * Base Adapter
 *
 * Abstract base class providing common functionality for all adapters.
 */

import type {
  AgentCapabilities,
  AdapterId,
  TerminalEvent,
  TranscriptChunk,
} from '@doorway/protocol';
import type {
  AgentAdapter,
  AdapterContext,
  DetectionResult,
  LaunchSpec,
  LaunchContext,
  PromptContext,
  FollowupContext,
  ParseContext,
  TerminalSnapshot,
  NeedInputResult,
  CompletionResult,
} from './types.js';

export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly id: AdapterId;
  abstract readonly displayName: string;
  abstract readonly capabilities: AgentCapabilities;

  abstract detectInstalled(ctx: AdapterContext): Promise<DetectionResult>;
  abstract buildLaunch(ctx: LaunchContext): Promise<LaunchSpec>;
  abstract buildInitialPrompt(ctx: PromptContext): Promise<string>;
  abstract buildFollowupPrompt(ctx: FollowupContext): Promise<string>;

  /**
   * Default implementation: parse terminal chunk for events.
   * Subclasses can override for more sophisticated parsing.
   */
  parseTerminalChunk(ctx: ParseContext): readonly TerminalEvent[] {
    const events: TerminalEvent[] = [];
    const { chunk, buffer } = ctx;

    // Detect command execution
    const commandPatterns = [/(?:^|\n)\$\s+(.+)/gm, /(?:^|\n)>\s+(.+)/gm];

    for (const pattern of commandPatterns) {
      const match = chunk.text.match(pattern);
      if (match && match[1]) {
        events.push({
          type: 'command_detected',
          command: match[1]!,
        });
        break;
      }
    }

    // Detect test results
    if (chunk.text.includes('PASS') || chunk.text.includes('✓')) {
      events.push({
        type: 'test_result',
        status: 'pass',
        summary: chunk.text.trim(),
      });
    }

    if (chunk.text.includes('FAIL') || chunk.text.includes('✗')) {
      events.push({
        type: 'test_result',
        status: 'fail',
        summary: chunk.text.trim(),
      });
    }

    // Detect approval requests
    const approvalPatterns = [
      /please confirm|approve|confirm|dangerous/i,
      /y\/n|yes\/no|continue\?/i,
      /warning:|caution:/i,
    ];

    for (const pattern of approvalPatterns) {
      if (pattern.test(chunk.text)) {
        events.push({
          type: 'approval_needed',
          prompt: chunk.text.trim(),
        });
        break;
      }
    }

    // Detect errors
    if (chunk.isStderr || /error|exception|failed/i.test(chunk.text)) {
      events.push({
        type: 'error',
        message: chunk.text.trim(),
      });
    }

    return events;
  }

  /**
   * Default implementation: check for common completion patterns.
   */
  detectNeedsInput(_ctx: TerminalSnapshot): NeedInputResult {
    return { needsInput: false };
  }

  /**
   * Default implementation: check for common completion patterns.
   */
  detectCompletion(ctx: TerminalSnapshot): CompletionResult {
    const { output, exitCode } = ctx;

    // Check exit code
    if (exitCode !== undefined) {
      return {
        isComplete: true,
        exitCode,
        reason: exitCode === 0 ? 'Exit code 0' : `Exit code ${exitCode}`,
      };
    }

    // Check for common completion patterns
    const completePatterns = [
      /done\.?$/i,
      /complete\.?$/i,
      /finished\.?$/i,
      /all tests passed/i,
      /✅/g,
      /Process exited with code 0/i,
    ];

    for (const pattern of completePatterns) {
      if (pattern.test(output)) {
        return {
          isComplete: true,
          reason: 'Completion pattern detected',
        };
      }
    }

    return { isComplete: false };
  }
}
