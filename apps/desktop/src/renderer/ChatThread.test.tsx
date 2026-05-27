import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentRunId,
  DoorwayEvent,
  EventId,
  TerminalSessionId,
  ThreadId,
} from '@doorway/protocol';
import {
  QuestionRelayCard,
  canSubmitQuestionRelayAnswer,
  questionRelayFromThreadEvents,
  shouldShowQuestionRelay,
  type QuestionRelayRequest,
} from './ChatThread';

const questionRelayRequest = {
  runId: 'run_question',
  sessionId: 'term_question',
  threadId: 'thread_question',
  question: 'Should I update PaymentService tests too?',
  context: 'Codex asked while the PTY was waiting for input.',
  suggestedResponses: ['yes', 'no'],
} satisfies QuestionRelayRequest;

describe('QuestionRelayCard', () => {
  it('renders a real active-thread CLI question as an inline relay card', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuestionRelayCard, {
        request: questionRelayRequest,
        loading: false,
        onAnswer: vi.fn(),
      })
    );

    expect(html).toContain('aria-label="Question relay"');
    expect(html).toContain('Doorway relay');
    expect(html).toContain('Worker is asking');
    expect(html).toContain('term_question');
    expect(html).toContain('Should I update PaymentService tests too?');
    expect(html).toContain('Codex asked while the PTY was waiting for input.');
    expect(html).toContain('aria-label="Suggested answers"');
    expect(html).toContain('Answer the worker');
    expect(html).toContain('Send');
  });

  it('only shows relay prompts for the active thread', () => {
    expect(shouldShowQuestionRelay('thread_question', questionRelayRequest)).toBe(true);
    expect(shouldShowQuestionRelay('thread_other', questionRelayRequest)).toBe(false);
    expect(shouldShowQuestionRelay('thread_question', null)).toBe(false);
  });

  it('recovers the active relay from unanswered persisted thread events', () => {
    const events = [
      clarificationRequestedEvent({
        id: 'evt_old' as EventId,
        sequence: 1,
        clarificationId: 'clarification_old',
        question: 'Old question?',
      }),
      clarificationAnsweredEvent({
        id: 'evt_old_answer' as EventId,
        sequence: 2,
        clarificationId: 'clarification_old',
      }),
      clarificationRequestedEvent({
        id: 'evt_new' as EventId,
        sequence: 3,
        clarificationId: 'clarification_new',
        question: 'Should I update integration tests too?',
      }),
    ];

    expect(questionRelayFromThreadEvents('thread_question', events, null)).toMatchObject({
      runId: 'run_question' as AgentRunId,
      sessionId: 'term_question' as TerminalSessionId,
      threadId: 'thread_question',
      question: 'Should I update integration tests too?',
      suggestedResponses: ['yes', 'no'],
    });
  });

  it('prefers the live relay payload over persisted events for the active thread', () => {
    const events = [
      clarificationRequestedEvent({
        id: 'evt_persisted' as EventId,
        sequence: 1,
        clarificationId: 'clarification_persisted',
        question: 'Persisted question?',
      }),
    ];
    const liveRequest = {
      ...questionRelayRequest,
      question: 'Live question?',
    };

    expect(questionRelayFromThreadEvents('thread_question', events, liveRequest)?.question).toBe(
      'Live question?'
    );
  });

  it('requires a non-empty answer and disables while submitting', () => {
    expect(canSubmitQuestionRelayAnswer('  yes  ', false)).toBe(true);
    expect(canSubmitQuestionRelayAnswer('   ', false)).toBe(false);
    expect(canSubmitQuestionRelayAnswer('yes', true)).toBe(false);
  });
});

function clarificationRequestedEvent(input: {
  readonly id: EventId;
  readonly sequence: number;
  readonly clarificationId: string;
  readonly question: string;
}): DoorwayEvent {
  return {
    id: input.id,
    threadId: 'thread_question' as ThreadId,
    type: 'clarification.requested',
    payload: {
      clarificationId: input.clarificationId,
      threadId: 'thread_question' as ThreadId,
      runId: 'run_question' as AgentRunId,
      sessionId: 'term_question' as TerminalSessionId,
      question: input.question,
      context: 'Persisted terminal context.',
      suggestedResponses: ['yes', 'no'],
      requestedAt: '2026-05-25T10:00:00.000Z',
    },
    timestamp: new Date('2026-05-25T10:00:00.000Z'),
    sequence: input.sequence,
  };
}

function clarificationAnsweredEvent(input: {
  readonly id: EventId;
  readonly sequence: number;
  readonly clarificationId: string;
}): DoorwayEvent {
  return {
    id: input.id,
    threadId: 'thread_question' as ThreadId,
    type: 'clarification.answered',
    payload: {
      clarificationId: input.clarificationId,
      threadId: 'thread_question' as ThreadId,
      runId: 'run_question' as AgentRunId,
      sessionId: 'term_question' as TerminalSessionId,
      answer: 'yes',
      answeredAt: '2026-05-25T10:01:00.000Z',
    },
    timestamp: new Date('2026-05-25T10:01:00.000Z'),
    sequence: input.sequence,
  };
}
