import { describe, it, expect, beforeEach } from 'vitest';
import { PatternSurfaceService, createPatternSurfaceService, type PatternEvent } from './pattern-surface.js';

describe('PatternSurfaceService', () => {
  let service: PatternSurfaceService;

  beforeEach(() => {
    service = createPatternSurfaceService();
  });

  describe('recordEvent', () => {
    it('should record a command pattern event', () => {
      const event: PatternEvent = {
        type: 'command',
        command: 'pnpm test',
        threadId: 'thread_123',
        timestamp: new Date(),
      };

      service.recordEvent(event);
      const patterns = service.getPatterns('command');

      expect(patterns).toHaveLength(1);
      expect(patterns[0].trigger).toBe('pnpm test');
      expect(patterns[0].frequency).toBe(1);
      expect(patterns[0].confidence).toBeGreaterThan(0);
    });

    it('should increment frequency for repeated commands', () => {
      const event1: PatternEvent = {
        type: 'command',
        command: 'pnpm test',
        timestamp: new Date(),
      };
      const event2: PatternEvent = {
        type: 'command',
        command: 'pnpm test',
        timestamp: new Date(),
      };

      service.recordEvent(event1);
      service.recordEvent(event2);

      const patterns = service.getPatterns('command');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe(2);
    });

    it('should record model preference events', () => {
      const event: PatternEvent = {
        type: 'model_preference',
        taskType: 'complex_task',
        modelId: 'claude-sonnet',
        timestamp: new Date(),
      };

      service.recordEvent(event);
      const pref = service.getModelPreference('complex_task');

      expect(pref).toBe('claude-sonnet');
    });

    it('should track tool success rates', () => {
      const successEvent: PatternEvent = {
        type: 'tool_success_rate',
        toolId: 'git-push',
        success: true,
        timestamp: new Date(),
      };
      const failEvent: PatternEvent = {
        type: 'tool_success_rate',
        toolId: 'git-push',
        success: false,
        errorType: 'pre-commit',
        timestamp: new Date(),
      };

      service.recordEvent(successEvent);
      service.recordEvent(failEvent);

      const patterns = service.getPatterns('tool_success_rate');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].trigger).toBe('git-push');
      expect(patterns[0].frequency).toBe(2);
    });

    it('should record time patterns', () => {
      const event: PatternEvent = {
        type: 'time_pattern',
        activity: 'pr_review',
        hourOfDay: 10,
        dayOfWeek: 3,
        timestamp: new Date(),
      };

      service.recordEvent(event);
      const patterns = service.getPatterns('time_pattern');

      expect(patterns).toHaveLength(1);
      expect(patterns[0].trigger).toBe('pr_review');
    });

    it('should record workflow patterns', () => {
      const event: PatternEvent = {
        type: 'workflow',
        steps: ['git add .', 'git commit -m', 'git push'],
        threadId: 'thread_456',
        timestamp: new Date(),
      };

      service.recordEvent(event);
      const patterns = service.getPatterns('workflow');

      expect(patterns).toHaveLength(1);
      expect(patterns[0].trigger).toContain('git add');
      expect(patterns[0].evidence).toContain('thread:thread_456');
    });
  });

  describe('getPatterns', () => {
    it('should return all patterns when no type specified', () => {
      service.recordEvent({ type: 'command', command: 'ls', timestamp: new Date() });
      service.recordEvent({ type: 'model_preference', taskType: 't1', modelId: 'm1', timestamp: new Date() });

      const patterns = service.getPatterns();
      expect(patterns).toHaveLength(2);
    });

    it('should filter patterns by type', () => {
      service.recordEvent({ type: 'command', command: 'ls', timestamp: new Date() });
      service.recordEvent({ type: 'command', command: 'cat', timestamp: new Date() });
      service.recordEvent({ type: 'model_preference', taskType: 't1', modelId: 'm1', timestamp: new Date() });

      const commandPatterns = service.getPatterns('command');
      expect(commandPatterns).toHaveLength(2);

      const modelPatterns = service.getPatterns('model_preference');
      expect(modelPatterns).toHaveLength(1);
    });

    it('should sort patterns by confidence descending', () => {
      service.recordEvent({ type: 'command', command: 'low', timestamp: new Date() });
      service.recordEvent({ type: 'command', command: 'medium', timestamp: new Date() });
      service.recordEvent({ type: 'command', command: 'high', timestamp: new Date() });

      // Add more events to increase confidence
      for (let i = 0; i < 5; i++) {
        service.recordEvent({ type: 'command', command: 'high', timestamp: new Date() });
      }

      const patterns = service.getPatterns('command');
      expect(patterns[0].trigger).toBe('high');
    });
  });

  describe('getSuggestions', () => {
    it('should suggest automation for frequently used commands', () => {
      for (let i = 0; i < 5; i++) {
        service.recordEvent({ type: 'command', command: 'pnpm test', timestamp: new Date() });
      }

      const suggestions = service.getSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].suggestion).toContain('pnpm test');
    });

    it('should not suggest for infrequent commands', () => {
      service.recordEvent({ type: 'command', command: 'rare', timestamp: new Date() });

      const suggestions = service.getSuggestions();
      expect(suggestions).toHaveLength(0);
    });

    it('should suggest pipeline for workflow patterns', () => {
      for (let i = 0; i < 3; i++) {
        service.recordEvent({
          type: 'workflow',
          steps: ['npm run build', 'npm run test', 'npm run deploy'],
          timestamp: new Date(),
        });
      }

      const suggestions = service.getSuggestions();
      const pipelineSuggestion = suggestions.find(s => s.suggestion.includes('pipeline'));
      expect(pipelineSuggestion).toBeDefined();
    });
  });

  describe('getModelPreference', () => {
    it('should return null for unknown task types', () => {
      const pref = service.getModelPreference('unknown_task');
      expect(pref).toBeNull();
    });

    it('should return model for known task type with high confidence', () => {
      for (let i = 0; i < 5; i++) {
        service.recordEvent({
          type: 'model_preference',
          taskType: 'complex',
          modelId: 'claude-sonnet',
          timestamp: new Date(),
        });
      }

      const pref = service.getModelPreference('complex');
      expect(pref).toBe('claude-sonnet');
    });

    it('should return null for low confidence preferences', () => {
      service.recordEvent({
        type: 'model_preference',
        taskType: 'simple',
        modelId: 'codex',
        timestamp: new Date(),
      });

      const pref = service.getModelPreference('simple');
      // With only 1 sample, confidence is below threshold
      expect(pref).toBeNull();
    });
  });

  describe('model preference learning', () => {
    it('should learn consistent model preference', () => {
      for (let i = 0; i < 4; i++) {
        service.recordEvent({
          type: 'model_preference',
          taskType: 'analysis',
          modelId: 'claude-opus',
          timestamp: new Date(),
        });
      }

      expect(service.getModelPreference('analysis')).toBe('claude-opus');
    });

    it('should switch preference when confidence drops', () => {
      // Initially prefer claude
      for (let i = 0; i < 3; i++) {
        service.recordEvent({
          type: 'model_preference',
          taskType: 'quick',
          modelId: 'claude-sonnet',
          timestamp: new Date(),
        });
      }

      // Switch to codex multiple times
      for (let i = 0; i < 5; i++) {
        service.recordEvent({
          type: 'model_preference',
          taskType: 'quick',
          modelId: 'codex',
          timestamp: new Date(),
        });
      }

      // After enough switches, should prefer codex
      const pref = service.getModelPreference('quick');
      expect(pref).toBe('codex');
    });
  });

  describe('tool failure tracking', () => {
    it('should generate suggestion for high failure rate tools', () => {
      // Record 7 successes and 3 failures
      for (let i = 0; i < 7; i++) {
        service.recordEvent({
          type: 'tool_success_rate',
          toolId: 'unreliable-tool',
          success: true,
          timestamp: new Date(),
        });
      }
      for (let i = 0; i < 3; i++) {
        service.recordEvent({
          type: 'tool_success_rate',
          toolId: 'unreliable-tool',
          success: false,
          errorType: 'timeout',
          timestamp: new Date(),
        });
      }

      const suggestions = service.getSuggestions();
      const toolSuggestion = suggestions.find(s => s.suggestion.includes('unreliable-tool'));
      expect(toolSuggestion).toBeDefined();
      expect(toolSuggestion?.suggestion).toContain('failure rate');
    });
  });
});

describe('PatternSurfaceService with Database', () => {
  it('should be instantiable without database', () => {
    const service = createPatternSurfaceService();
    expect(service).toBeDefined();
  });
});
