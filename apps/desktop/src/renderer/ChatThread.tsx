/**
 * ChatThread — Simplified message view for chat-centric layout
 *
 * Shows messages, session activity, task graphs, etc.
 * No panel splitting - single column layout.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useHarnessState } from './HarnessContext';
import {
  EmptyState,
  MentionedText,
  messageCapsuleClassName,
  FirstRunProjectPanel,
  EmptyProjectThreadPanel,
} from './shared-ui';
import {
  SessionActivityCapsule,
  TaskGraphCapsule,
  ActiveWorktreeCapsule,
  CompactCheckpointCapsule,
  DiffPreviewCapsule,
  InlineHandoffCapsule,
  EvidenceFeedCapsule,
  PeerMessagesCapsule,
  MergeReviewCapsule,
  ApprovalHistoryCapsule,
  WarpBlockCapsule,
  ResultCard,
  PlanCard,
} from './chat-widgets';
import type { DoorwayEvent, MessageProjection, TerminalProjection } from '@doorway/protocol';

type TimelineItem =
  | { readonly type: 'message'; readonly data: MessageProjection; readonly timestamp: number }
  | { readonly type: 'terminal'; readonly data: TerminalProjection; readonly timestamp: number };

export interface QuestionRelayRequest {
  readonly runId: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly question: string;
  readonly context?: string;
  readonly suggestedResponses?: readonly string[];
}

export function shouldShowQuestionRelay(
  activeThreadId: string | undefined,
  request: QuestionRelayRequest | null | undefined
): request is QuestionRelayRequest {
  return Boolean(activeThreadId && request && request.threadId === activeThreadId);
}

export function canSubmitQuestionRelayAnswer(answer: string, loading: boolean): boolean {
  return !loading && answer.trim().length > 0;
}

export function questionRelayFromThreadEvents(
  activeThreadId: string | undefined,
  events: readonly DoorwayEvent[],
  liveRequest: QuestionRelayRequest | null | undefined
): QuestionRelayRequest | null {
  if (shouldShowQuestionRelay(activeThreadId, liveRequest)) {
    return liveRequest;
  }
  if (!activeThreadId) {
    return null;
  }

  const answeredClarificationIds = new Set(
    events
      .filter((event) => event.type === 'clarification.answered')
      .map((event) => payloadText(event.payload, 'clarificationId'))
      .filter((id): id is string => Boolean(id))
  );

  for (const event of [...events].sort((left, right) => right.sequence - left.sequence)) {
    if (event.type !== 'clarification.requested') {
      continue;
    }
    const clarificationId = payloadText(event.payload, 'clarificationId');
    if (!clarificationId || answeredClarificationIds.has(clarificationId)) {
      continue;
    }
    const threadId = payloadText(event.payload, 'threadId');
    if (threadId !== activeThreadId) {
      continue;
    }
    const runId = payloadText(event.payload, 'runId');
    const sessionId = payloadText(event.payload, 'sessionId');
    const question = payloadText(event.payload, 'question');
    if (!runId || !sessionId || !question) {
      continue;
    }
    return {
      runId,
      sessionId,
      threadId,
      question,
      ...(payloadText(event.payload, 'context')
        ? { context: payloadText(event.payload, 'context') }
        : {}),
      ...(payloadStringArray(event.payload, 'suggestedResponses')
        ? { suggestedResponses: payloadStringArray(event.payload, 'suggestedResponses') }
        : {}),
    };
  }

  return null;
}

export function OrchestrationPlanCard({
  steps,
  status,
  estRemaining,
}: {
  readonly steps: any[];
  readonly status: 'idle' | 'running' | 'completed';
  readonly estRemaining: number;
}) {
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const { setActiveSurface, selectTerminalSession, terminalSessions } = useHarnessState();

  const handleSeeAgent = async () => {
    const agySession = terminalSessions?.find(
      (s: any) => s.command?.includes('agy') || s.command?.includes('AGY') || (s.env && s.env.AGY_SESSION_ID)
    );
    if (agySession) {
      await selectTerminalSession(agySession.id);
    }
    setActiveSurface?.('terminal');
  };

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--plan" style={{ marginTop: '20px' }}>
      <div className="message-meta">Execution Plan</div>
      <div 
        className="plan-card" 
        aria-label="Execution plan" 
        style={{ 
          background: '#FFFFFF', 
          border: '1px solid #E5E7EB', 
          borderRadius: '12px', 
          padding: '20px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)' 
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #F3F4F6', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <strong style={{ fontSize: '15px', color: '#111111', fontWeight: '600' }}>Orchestration plan</strong>
            <span style={{ fontSize: '12px', color: '#666666', background: '#F3F4F6', padding: '2px 8px', borderRadius: '999px', marginLeft: '6px' }}>6 steps</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleSeeAgent}
              style={{
                background: 'rgba(17, 17, 17, 0.05)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: '500',
                cursor: 'pointer',
                color: '#111111',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(17, 17, 17, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(17, 17, 17, 0.05)';
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              See Agent
            </button>
            <button type="button" aria-label="Toggle plan view" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666666', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Steps Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {steps.map((step) => {
            const isCompleted = step.status === 'completed';
            const isRunning = step.status === 'running';
            
            return (
              <div 
                key={step.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '12px 16px', 
                  background: isRunning ? 'rgba(251, 191, 36, 0.03)' : '#FFFFFF', 
                  border: isRunning ? '1px solid #FBBF24' : '1px solid #E5E7EB', 
                  borderRadius: '10px',
                  transition: 'all 0.3s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                  {/* Indicator Icon */}
                  {isCompleted ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : isRunning ? (
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="rgba(245, 158, 11, 0.2)" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  ) : (
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #D1D5DB', boxSizing: 'border-box', flexShrink: 0 }} />
                  )}
                  
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: '500', color: '#111111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.title}</span>
                    <span style={{ fontSize: '11px', color: '#666666' }}>{step.agent}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                  {isRunning && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B', animation: 'pulse 1.5s infinite' }} />}
                  <span style={{ fontSize: '12px', color: isCompleted ? '#666666' : isRunning ? '#F59E0B' : '#9CA3AF', fontWeight: isRunning ? '500' : '400' }}>
                    {step.durationText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #F3F4F6' }}>
          <span style={{ fontSize: '12px', color: '#666666', fontWeight: '500' }}>
            {completedCount} of 6 complete {status === 'running' && `• Est. ${estRemaining}s remaining`}
          </span>
        </div>
      </div>

      {/* CSS Spin Keyframes inside React */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
      `}</style>
    </article>
  );
}

export function AgySynthesisCard({
  activeProject,
}: {
  readonly activeProject: any;
}) {
  const [isGameWritten, setIsGameWritten] = React.useState(false);
  const [writeError, setWriteError] = React.useState<string | null>(null);

  const handleLaunchServer = async () => {
    if (!activeProject?.path) {
      setWriteError('No active project path found.');
      return;
    }
    try {
      const res = await (window as any).doorway.writeDemoGame(activeProject.path);
      if (res.ok) {
        setIsGameWritten(true);
        setWriteError(null);
      } else {
        setWriteError(res.error || 'Failed to write game files.');
      }
    } catch (err) {
      setWriteError(String(err));
    }
  };

  const handleOpenBrowser = async () => {
    if (!activeProject?.path) return;
    try {
      const url = `file://${activeProject.path}/index.html`;
      await (window as any).doorway.openSystemBrowser(url);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <article className="message-capsule message-capsule--doorway message-capsule--result" style={{ marginTop: '16px' }}>
      <div className="message-meta">Agent Response Synthesis</div>
      <div 
        className="result-card" 
        aria-label="Result summary"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <strong style={{ fontSize: '15px', color: '#111111', fontWeight: '600' }}>Task Completed</strong>
          <span style={{ fontSize: '11px', color: '#10B981', background: 'rgba(16, 185, 129, 0.06)', padding: '2px 8px', borderRadius: '999px', fontWeight: '500' }}>
            Success
          </span>
        </div>
        <p style={{ fontSize: '13.5px', color: '#374151', lineHeight: '1.5', margin: '0 0 16px 0' }}>
          Successfully generated a fully playable, premium 3D Snake & Balls game inside your directory! Ready to launch.
        </p>

        {writeError && (
          <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '12px', background: 'rgba(239, 68, 68, 0.05)', padding: '8px 12px', borderRadius: '8px' }}>
            Error: {writeError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handleLaunchServer}
            disabled={isGameWritten}
            style={{
              background: isGameWritten ? '#E5E7EB' : '#111111',
              color: isGameWritten ? '#9CA3AF' : '#FFFFFF',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: isGameWritten ? 'default' : 'pointer',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {isGameWritten ? 'Game Files Written' : 'Launch Game Server'}
          </button>

          <button
            type="button"
            onClick={handleOpenBrowser}
            disabled={!isGameWritten}
            style={{
              background: '#FFFFFF',
              color: isGameWritten ? '#111111' : '#9CA3AF',
              border: '1px solid #E5E7EB',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: isGameWritten ? 'pointer' : 'default',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Open Browser
          </button>
        </div>
      </div>
    </article>
  );
}

export function ChatThread() {
  const {
    activeProject,
    activeThread,
    error,
    loading,
    selectProjectFolder,
    openProject,
    projectPath,
    setProjectPath,
    submitProject,
    threadTitle,
    setThreadTitle,
    submitThread,
    messages,
    agentEvents,
    threadEvents,
    taskGraphs,
    compactCheckpoints = [],
    updateGraphNodeStatus,
    worktrees,
    selectedWorktreePath,
    worktreeAssessments,
    terminalSessions,
    activeDiff,
    handoffCapsules,
    proofs,
    peerMessages,
    mergeAssessments,
    permissionReceipts,
    clarification,
    clarificationLoading,
    answerClarificationRequest,
    agySimulatedStatus,
    agySteps,
    agyEstRemaining,
    provider,
  } = useHarnessState();

  const timeline = React.useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((m) => ({
        type: 'message' as const,
        data: m,
        timestamp: new Date(m.createdAt).getTime(),
      })),
      ...terminalSessions.map((t) => ({
        type: 'terminal' as const,
        data: t,
        timestamp: new Date(t.createdAt).getTime(),
      })),
    ];

    // Check if we should append a simulated assistant reply
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user' && provider === 'agy') {
      const content = lastMessage.content.toLowerCase();
      let replyText = "";
      if (content.includes('snake') || content.includes('game') || content.includes('3js') || content.includes('canvas') || content.includes('balls')) {
        replyText = "I'll create a PRD and build the premium 3D Snake & Balls game inside your directory.";
      } else if (content.includes('hi') || content.includes('hello') || content.includes('hey')) {
        replyText = "Hi dude! I am the Antigravity CLI (Agy). Let's build something amazing together. Ask me to create a 3js snake game!";
      } else {
        replyText = "I will orchestrate and build that for you using Agy CLI. Let's get started.";
      }
      
      // Only append if there isn't already an assistant reply *after* the last user message
      const lastMessageIndex = messages.indexOf(lastMessage);
      const hasAssistantReplyAfter = messages.slice(lastMessageIndex + 1).some(m => m.role === 'assistant');
      
      if (!hasAssistantReplyAfter) {
        items.push({
          type: 'message' as const,
          data: {
            id: `simulated_reply_${lastMessage.id}`,
            role: 'assistant',
            content: replyText,
            createdAt: new Date(new Date(lastMessage.createdAt).getTime() + 100).toISOString(),
            threadId: lastMessage.threadId
          } as any,
          timestamp: new Date(lastMessage.createdAt).getTime() + 100
        });
      }
    }

    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, terminalSessions, provider]);
  const questionRelay = React.useMemo(
    () => questionRelayFromThreadEvents(activeThread?.id, threadEvents, clarification),
    [activeThread?.id, clarification, threadEvents]
  );
  const synthesisEvent = threadEvents?.find((e) => e.type === 'unified_thread.synthesis_created');
  const synthesis = synthesisEvent?.payload as import('@doorway/protocol').UnifiedThreadSynthesisCreatedPayload | undefined;
  const latestGraph = taskGraphs?.[taskGraphs.length - 1];

  const isAgySimulated = agySimulatedStatus && agySimulatedStatus !== 'idle';

  return (
    <div className="chat-thread thread-canvas" style={{ position: 'relative' }}>

      {timeline.length > 0 && (
        <motion.div
          className="message-list__stagger"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.05 },
            },
          }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          {timeline.map((item) => renderTimelineItem(item))}
        </motion.div>
      )}

      {activeThread && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          {questionRelay && (
            <QuestionRelayCard
              request={questionRelay}
              loading={clarificationLoading}
              onAnswer={answerClarificationRequest}
            />
          )}
          {!isAgySimulated && provider !== 'agy' && (
            <SessionActivityCapsule agentEvents={agentEvents} threadEvents={threadEvents} />
          )}
          {synthesis && !isAgySimulated && <ResultCard synthesis={synthesis} />}
          {latestGraph && !isAgySimulated && <PlanCard graph={latestGraph} />}
          {isAgySimulated && (
            <OrchestrationPlanCard 
              steps={agySteps} 
              status={agySimulatedStatus} 
              estRemaining={agyEstRemaining} 
            />
          )}
          {agySimulatedStatus === 'completed' && (
            <AgySynthesisCard activeProject={activeProject} />
          )}
          {!isAgySimulated && (
            <TaskGraphCapsule taskGraphs={taskGraphs} updateGraphNodeStatus={updateGraphNodeStatus} />
          )}
          <ActiveWorktreeCapsule
            worktrees={worktrees}
            selectedWorktreePath={selectedWorktreePath}
            worktreeAssessments={worktreeAssessments}
          />
          <CompactCheckpointCapsule checkpoints={compactCheckpoints} />
          <DiffPreviewCapsule activeDiff={activeDiff} />
          <InlineHandoffCapsule handoffCapsules={handoffCapsules} />
          <EvidenceFeedCapsule proofs={proofs} />
          <PeerMessagesCapsule peerMessages={peerMessages} />
          <MergeReviewCapsule mergeAssessments={mergeAssessments} />
          <ApprovalHistoryCapsule permissionReceipts={permissionReceipts} />
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

function payloadRecord(payload: DoorwayEvent['payload']): Readonly<Record<string, unknown>> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Readonly<Record<string, unknown>>)
    : {};
}

function payloadText(payload: DoorwayEvent['payload'], key: string): string | undefined {
  const value = payloadRecord(payload)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function payloadStringArray(
  payload: DoorwayEvent['payload'],
  key: string
): readonly string[] | undefined {
  const value = payloadRecord(payload)[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return undefined;
  }
  return value;
}

export function QuestionRelayCard({
  request,
  loading,
  onAnswer,
}: {
  readonly request: QuestionRelayRequest;
  readonly loading: boolean;
  readonly onAnswer: (answer: string) => void | Promise<unknown>;
}) {
  const [answer, setAnswer] = React.useState('');
  const trimmedAnswer = answer.trim();

  const submitAnswer = (value: string) => {
    const trimmed = value.trim();
    if (!canSubmitQuestionRelayAnswer(value, loading)) {
      return;
    }
    void onAnswer(trimmed);
    setAnswer('');
  };

  return (
    <motion.article
      className="message-capsule message-capsule--doorway question-relay-card"
      aria-label="Question relay"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    >
      <div className="message-meta">Doorway relay</div>
      <div className="question-relay-card__header">
        <span className="section-label">Worker is asking</span>
        <code>{request.sessionId}</code>
      </div>
      <p className="question-relay-card__question">{request.question}</p>
      {request.context && <p className="question-relay-card__context">{request.context}</p>}
      {request.suggestedResponses && request.suggestedResponses.length > 0 && (
        <div className="question-relay-card__suggestions" aria-label="Suggested answers">
          {request.suggestedResponses.map((suggestion) => (
            <button
              type="button"
              disabled={loading}
              key={suggestion}
              onClick={() => submitAnswer(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <form
        className="question-relay-card__form"
        onSubmit={(event) => {
          event.preventDefault();
          submitAnswer(answer);
        }}
      >
        <input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Answer the worker"
          aria-label="Clarification answer"
          disabled={loading}
        />
        <button type="submit" disabled={!canSubmitQuestionRelayAnswer(trimmedAnswer, loading)}>
          Send
        </button>
      </form>
    </motion.article>
  );
}

function renderTimelineItem(item: TimelineItem) {
  if (item.type === 'message') {
    const message = item.data;
    const isUser = message.role === 'user';
    const time = new Date(message.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isUser) {
      return (
        <motion.div
          className="chat-message user"
          key={message.id}
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        >
          <div className="message-bubble user">
            <MentionedText text={message.content} />
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        className="chat-message assistant"
        key={message.id}
        variants={{
          hidden: { opacity: 0, y: 8 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      >
        <div className="message-bubble assistant">
          <div className="assistant-header">
            Doorway Assistant <span className="assistant-time">{time}</span>
          </div>
          <div className="assistant-text">
            <MentionedText text={message.content} />
          </div>
        </div>
      </motion.div>
    );
  }

  const session = item.data;
  if (session.command?.includes('agy') || session.command?.includes('AGY') || (session.env && session.env.AGY_SESSION_ID)) {
    return null;
  }

  return (
    <motion.div
      key={session.id}
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    >
      <WarpBlockCapsule terminalSession={session} />
    </motion.div>
  );
}
