import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  AutoCompactor,
  MODEL_CONTEXT_WINDOWS,
  createAutoCompactorIntegration,
} from './auto-compactor';
import type { MessageProjection } from '@doorway/protocol';

// Mock database
const mockDb = {
  prepare: vi.fn(() => ({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(() => []),
  })),
} as any;

describe('AutoCompactor', () => {
  let compactor: AutoCompactor;

  beforeEach(() => {
    compactor = new AutoCompactor(mockDb, { threshold: 0.8 });
  });

  describe('getContextWindow', () => {
    it('returns default context window for unknown models', () => {
      expect(compactor.getContextWindow('unknown-model-v999')).toBe(200000);
    });

    it('returns correct window for Claude models', () => {
      expect(compactor.getContextWindow('claude-3-5-sonnet-20240620')).toBe(200000);
      expect(compactor.getContextWindow('claude-3-opus')).toBe(200000);
      expect(compactor.getContextWindow('claude-3-haiku')).toBe(200000);
    });

    it('returns correct window for OpenAI models', () => {
      expect(compactor.getContextWindow('gpt-4o')).toBe(128000);
      expect(compactor.getContextWindow('gpt-4o-mini')).toBe(128000);
      expect(compactor.getContextWindow('gpt-3.5-turbo')).toBe(16385);
    });

    it('returns correct window for Gemini models', () => {
      expect(compactor.getContextWindow('gemini-1.5-pro')).toBe(128000);
      expect(compactor.getContextWindow('gemini-2.5-flash')).toBe(1000000);
    });

    it('uses custom context windows when provided', () => {
      const customCompactor = new AutoCompactor(mockDb, {
        modelContextWindows: { 'custom-model': 500000 },
      });
      expect(customCompactor.getContextWindow('custom-model')).toBe(500000);
    });
  });

  describe('getContextUsagePercent', () => {
    it('returns 0 for empty messages', () => {
      expect(compactor.getContextUsagePercent([], 'gpt-4o')).toBe(0);
    });

    it('calculates usage correctly based on content length', () => {
      // ~1000 chars * 0.75 = ~750 tokens
      const messages = [
        {
          id: 'msg1' as any,
          role: 'user' as const,
          content: 'a'.repeat(1000),
          createdAt: new Date(),
        },
      ];
      // 750 tokens / 128000 context window = ~0.006
      const usage = compactor.getContextUsagePercent(messages, 'gpt-4o');
      expect(usage).toBeGreaterThan(0);
      expect(usage).toBeLessThan(0.01);
    });
  });

  describe('shouldAutoCompact', () => {
    it('returns false when under threshold', () => {
      const messages = [
        {
          id: 'msg1' as any,
          role: 'user' as const,
          content: 'short message',
          createdAt: new Date(),
        },
      ];
      expect(compactor.shouldAutoCompact(messages, 'gpt-4o')).toBe(false);
    });

    it('returns true when at or above threshold', () => {
      // Create messages that will exceed 80% of context window
      // GPT-4o: 128K tokens, 80% = 102K tokens
      // 102K tokens * 4 chars/token / 0.75 = ~544K chars
      const longContent = 'a'.repeat(600000);
      const messages = [
        {
          id: 'msg1' as any,
          role: 'user' as const,
          content: longContent,
          createdAt: new Date(),
        },
      ];
      expect(compactor.shouldAutoCompact(messages, 'gpt-4o')).toBe(true);
    });
  });

  describe('getCompactableMessages', () => {
    it('returns no compaction needed for short messages', () => {
      const messages = [
        {
          id: 'msg1' as any,
          role: 'user' as const,
          content: 'hello',
          createdAt: new Date(),
        },
      ];
      const result = compactor.getCompactableMessages(messages);
      expect(result.dropCount).toBe(0);
      expect(result.keepCount).toBe(1);
    });

    it('identifies messages to drop for long threads', () => {
      // Create 10 messages
      const messages = Array.from({ length: 10 }, (_, i) => ({
        id: `msg${i}` as any,
        role: (i % 2 === 0 ? 'user' : 'assistant') as const,
        content: 'x'.repeat(10000), // ~7500 tokens per message
        createdAt: new Date(),
      }));

      // 10 * 7500 = 75K tokens, still under 80% of 128K (102K)
      // But we test the method regardless
      const result = compactor.getCompactableMessages(messages);
      expect(result.keepCount).toBeGreaterThan(0);
      expect(result.keepCount).toBeLessThanOrEqual(messages.length);
    });
  });

  describe('isCompacting', () => {
    it('returns false initially', () => {
      expect(compactor.isCompacting('thread-123')).toBe(false);
    });
  });
});

describe('createAutoCompactorIntegration', () => {
  let compactor: AutoCompactor;
  let integration: ReturnType<typeof createAutoCompactorIntegration>;

  beforeEach(() => {
    compactor = new AutoCompactor(mockDb);
    integration = createAutoCompactorIntegration(compactor);
  });

  describe('checkAndCompact', () => {
    it('returns false for short messages (no compaction needed)', async () => {
      const messages = [
        {
          id: 'msg1' as any,
          role: 'user' as const,
          content: 'hello',
          createdAt: new Date(),
        },
      ];
      const result = await integration.checkAndCompact('thread-1' as any, messages);
      expect(result).toBe(false);
    });
  });

  describe('getUsagePercent', () => {
    it('returns usage percentage', () => {
      const messages = [
        {
          id: 'msg1' as any,
          role: 'user' as const,
          content: 'a'.repeat(1000),
          createdAt: new Date(),
        },
      ];
      const usage = integration.getUsagePercent(messages, 'gpt-4o');
      expect(usage).toBeGreaterThan(0);
      expect(usage).toBeLessThan(1);
    });
  });

  describe('isCompacting', () => {
    it('returns false initially', () => {
      expect(integration.isCompacting('thread-1')).toBe(false);
    });
  });
});

describe('MODEL_CONTEXT_WINDOWS', () => {
  it('has entries for major providers', () => {
    expect(MODEL_CONTEXT_WINDOWS['claude-3-5-sonnet']).toBe(200000);
    expect(MODEL_CONTEXT_WINDOWS['gpt-4o']).toBe(128000);
    expect(MODEL_CONTEXT_WINDOWS['gemini-1.5-pro']).toBe(128000);
  });

  it('has sensible defaults', () => {
    expect(MODEL_CONTEXT_WINDOWS.default).toBe(200000);
  });
});
