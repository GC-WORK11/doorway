import { describe, expect, it } from 'vitest';
import type { AgentRunId, TerminalSessionId, ThreadId } from '@doorway/protocol';
import { createClarificationHandler } from './clarification-handler.js';

describe('ClarificationHandler', () => {
  it('detects question prompts from fresh terminal chunks after earlier output', () => {
    const handler = createClarificationHandler({ timeoutMs: 10 });
    const sessionId = 'term_clarification_chunk' as TerminalSessionId;
    const runId = 'run_clarification_chunk' as AgentRunId;
    const threadId = 'thread_clarification_chunk' as ThreadId;

    expect(
      handler.processOutput(sessionId, runId, threadId, 'govinda@host:~/repo$ ')
    ).toBeNull();

    const request = handler.processOutput(
      sessionId,
      runId,
      threadId,
      'Should I proceed? [y/n]\n> '
    );

    expect(request).toMatchObject({
      sessionId,
      runId,
      threadId,
      question: expect.stringContaining('Should I proceed?'),
      status: 'pending',
    });
    expect(handler.answerRequest(request!.id, 'yes')).toEqual({
      requestId: request!.id,
      response: 'yes',
    });
  });

  it('detects a question split across terminal chunks once the prompt is visible', () => {
    const handler = createClarificationHandler({ timeoutMs: 1000 });
    const sessionId = 'term_clarification_split' as TerminalSessionId;
    const runId = 'run_clarification_split' as AgentRunId;
    const threadId = 'thread_clarification_split' as ThreadId;

    expect(handler.processOutput(sessionId, runId, threadId, 'Should I proceed')).toBeNull();

    const request = handler.processOutput(sessionId, runId, threadId, '? [y/n]\n> ');

    expect(request).toMatchObject({
      sessionId,
      runId,
      threadId,
      question: 'Should I proceed? [y/n]',
      status: 'pending',
    });
  });

  it('keeps rolling question buffers isolated by terminal session', () => {
    const handler = createClarificationHandler({ timeoutMs: 1000 });
    const firstSessionId = 'term_clarification_first' as TerminalSessionId;
    const secondSessionId = 'term_clarification_second' as TerminalSessionId;
    const runId = 'run_clarification_isolated' as AgentRunId;
    const threadId = 'thread_clarification_isolated' as ThreadId;

    expect(
      handler.processOutput(firstSessionId, runId, threadId, 'Should I update tests')
    ).toBeNull();
    expect(handler.processOutput(secondSessionId, runId, threadId, '? [y/n]\n> ')).toBeNull();

    const request = handler.processOutput(firstSessionId, runId, threadId, '? [y/n]\n> ');

    expect(request?.sessionId).toBe(firstSessionId);
    expect(request?.question).toBe('Should I update tests? [y/n]');
    expect(handler.getPendingClarification(secondSessionId)).toBeNull();
  });

  it('does not create duplicate pending requests when the same prompt repaints', () => {
    const handler = createClarificationHandler({ timeoutMs: 1000 });
    const sessionId = 'term_clarification_duplicate' as TerminalSessionId;
    const runId = 'run_clarification_duplicate' as AgentRunId;
    const threadId = 'thread_clarification_duplicate' as ThreadId;

    const first = handler.processOutput(sessionId, runId, threadId, 'Proceed? [y/n]\n> ');
    const second = handler.processOutput(sessionId, runId, threadId, 'Proceed? [y/n]\n> ');

    expect(first).toMatchObject({ question: 'Proceed? [y/n]', status: 'pending' });
    expect(second).toBeNull();
    expect(handler.getPendingClarifications()).toHaveLength(1);
  });
});
