/**
 * Compaction Tests
 */

import { describe, expect, it } from 'vitest';
import {
  estimateContextTokens,
  shouldCompact,
  compact,
  CompactionManager,
  createCompactionManager,
  type CompactionSettings,
} from './compaction.js';
import type { MessageProjection } from '@doorway/protocol';

describe('Compaction Module', () => {
  const createMessage = (id: string, role: string, content: string): MessageProjection => ({
    id,
    role: role as MessageProjection['role'],
    content,
    createdAt: new Date(),
  });

  const longContent = 'Lorem ipsum dolor sit amet '.repeat(100); // ~2700 chars

  describe('estimateContextTokens', () => {
    it('returns zero for empty messages', () => {
      const result = estimateContextTokens([]);
      expect(result.tokens).toBe(0);
      expect(result.usageTokens).toBe(0);
      expect(result.lastUsageIndex).toBeNull();
    });

    it('estimates tokens from message content', () => {
      const messages = [
        createMessage('1', 'system', 'You are helpful'),
        createMessage('2', 'user', 'Hello'),
        createMessage('3', 'assistant', 'Hi there!'),
      ];

      const result = estimateContextTokens(messages);
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.usageTokens).toBeGreaterThan(0);
      expect(result.lastUsageIndex).toBe(2);
    });

    it('calculates trailing tokens', () => {
      const messages = [
        createMessage('1', 'system', 'System'),
        createMessage('2', 'assistant', 'First response'),
        createMessage('3', 'user', 'Follow up'),
        createMessage('4', 'assistant', 'Second response'),
      ];

      const result = estimateContextTokens(messages);
      expect(result.trailingTokens).toBeGreaterThan(0);
    });
  });

  describe('shouldCompact', () => {
    const settings: CompactionSettings = {
      enabled: true,
      reserveTokens: 8192,
      contextWindow: 200000,
    };

    it('returns false when disabled', () => {
      const disabledSettings = { ...settings, enabled: false };
      expect(shouldCompact(190000, 200000, disabledSettings)).toBe(false);
    });

    it('returns false when under threshold', () => {
      expect(shouldCompact(100000, 200000, settings)).toBe(false);
    });

    it('returns true when over threshold', () => {
      expect(shouldCompact(195000, 200000, settings)).toBe(true);
    });
  });

  describe('compact', () => {
    const settings: CompactionSettings = {
      enabled: true,
      reserveTokens: 1000,
      contextWindow: 5000, // Small window to trigger compaction
    };

    it('returns unchanged when no messages', async () => {
      const result = await compact([], settings);
      expect(result.entriesDropped).toBe(0);
      expect(result.summary).toBe('');
    });

    it('keeps small message sets unchanged', async () => {
      const messages = [
        createMessage('1', 'system', 'System prompt'),
        createMessage('2', 'user', 'Hi'),
      ];

      const result = await compact(messages, settings);
      expect(result.entriesDropped).toBe(0);
    });

    it('condenses large message sets', async () => {
      const messages = [
        createMessage('1', 'system', 'System prompt'),
        createMessage('2', 'user', longContent),
        createMessage('3', 'assistant', longContent),
        createMessage('4', 'user', longContent),
        createMessage('5', 'assistant', longContent),
        createMessage('6', 'user', 'Latest request'),
        createMessage('7', 'assistant', 'Latest response'),
      ];

      const result = await compact(messages, settings);
      expect(result.entriesDropped).toBeGreaterThan(0);
      expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
      expect(result.summary).toContain('condensed');
    });

    it('preserves first message as anchor', async () => {
      const messages = [
        createMessage('1', 'system', 'System prompt'),
        createMessage('2', 'user', longContent),
        createMessage('3', 'assistant', longContent),
        createMessage('4', 'user', longContent),
        createMessage('5', 'assistant', longContent),
        createMessage('6', 'user', 'Recent'),
        createMessage('7', 'assistant', 'Recent response'),
      ];

      const result = await compact(messages, settings);
      expect(result.firstKeptEntryId).toBe('1');
    });
  });

  describe('CompactionManager', () => {
    it('creates with default settings', () => {
      const manager = createCompactionManager();
      const settings = manager.getSettings();

      expect(settings.enabled).toBe(false);
      expect(settings.reserveTokens).toBe(8192);
      expect(settings.contextWindow).toBe(200000);
    });

    it('creates with custom settings', () => {
      const manager = createCompactionManager({
        enabled: true,
        reserveTokens: 16384,
      });

      const settings = manager.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.reserveTokens).toBe(16384);
    });

    it('notifies on compaction', async () => {
      const compactions: Array<{ threadId: string; dropped: number }> = [];

      const manager = createCompactionManager(
        { enabled: true, contextWindow: 1000 }, // Small window to force compaction
        (threadId, result) => {
          compactions.push({ threadId, dropped: result.entriesDropped });
        }
      );

      const messages = [
        createMessage('1', 'system', 'System'),
        createMessage('2', 'user', longContent),
        createMessage('3', 'assistant', longContent),
        createMessage('4', 'user', longContent),
        createMessage('5', 'assistant', longContent),
        createMessage('6', 'user', longContent),
        createMessage('7', 'assistant', 'Final'),
      ];

      manager.enqueue('thread-1', messages);
      await manager.processQueue();

      expect(compactions).toHaveLength(1);
      expect(compactions[0].threadId).toBe('thread-1');
      expect(compactions[0].dropped).toBeGreaterThan(0);
    });

    it('updates settings dynamically', () => {
      const manager = createCompactionManager({ enabled: false });
      expect(manager.needsCompaction('t1', [])).toBe(false);

      manager.updateSettings({ enabled: true });
      expect(manager.getSettings().enabled).toBe(true);
    });
  });
});
