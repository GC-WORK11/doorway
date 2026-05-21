import { describe, expect, it } from 'vitest';
import type { MessageProjection, ThreadId } from '@doorway/protocol';
import { readPersistedThreadState, type ThreadStateReader } from './thread-refresh';

describe('readPersistedThreadState', () => {
  it('loads launch state from persisted thread readers only once', async () => {
    const threadId = 'thread_launch' as ThreadId;
    const calls: Record<keyof ThreadStateReader, number> = {
      getMessages: 0,
      getThreadEvents: 0,
      getThreadProofs: 0,
      getThreadPermissionReceipts: 0,
      getThreadMergeAssessments: 0,
      getThreadHandoffCapsules: 0,
      getThreadPeerMessages: 0,
      getThreadTaskGraphs: 0,
    };
    const persistedMessage: MessageProjection = {
      id: 'message_user',
      threadId,
      role: 'user',
      content: 'Build the persisted path',
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
    } as MessageProjection;
    const reader: ThreadStateReader = {
      async getMessages(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getMessages += 1;
        return [persistedMessage];
      },
      async getThreadEvents(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getThreadEvents += 1;
        return [];
      },
      async getThreadProofs(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getThreadProofs += 1;
        return [];
      },
      async getThreadPermissionReceipts(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getThreadPermissionReceipts += 1;
        return [];
      },
      async getThreadMergeAssessments(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getThreadMergeAssessments += 1;
        return [];
      },
      async getThreadHandoffCapsules(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getThreadHandoffCapsules += 1;
        return [];
      },
      async getThreadPeerMessages(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getThreadPeerMessages += 1;
        return [];
      },
      async getThreadTaskGraphs(requestedThreadId) {
        expect(requestedThreadId).toBe(threadId);
        calls.getThreadTaskGraphs += 1;
        return [];
      },
    };

    const snapshot = await readPersistedThreadState(reader, threadId);

    expect(snapshot.messages).toEqual([persistedMessage]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.peerMessages).toEqual([]);
    expect(calls).toEqual({
      getMessages: 1,
      getThreadEvents: 1,
      getThreadProofs: 1,
      getThreadPermissionReceipts: 1,
      getThreadMergeAssessments: 1,
      getThreadHandoffCapsules: 1,
      getThreadPeerMessages: 1,
      getThreadTaskGraphs: 1,
    });
  });
});
