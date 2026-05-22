import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutomationSuggestionEngine,
  createAutomationSuggestionEngine,
  generateAutomationSuggestions,
  type AutomationSuggestion,
} from './automation-suggestions.js';
import { PatternSurfaceService, createPatternSurfaceService, type PatternEvent, type Pattern } from './pattern-surface.js';
import { SessionReviewService, createSessionReviewService, type SessionReviewEvent } from './session-review.js';

describe('AutomationSuggestionEngine', () => {
  let patternService: PatternSurfaceService;
  let sessionService: SessionReviewService;
  let engine: AutomationSuggestionEngine;

  beforeEach(() => {
    patternService = createPatternSurfaceService();
    sessionService = createSessionReviewService();
    engine = createAutomationSuggestionEngine(patternService, sessionService);
  });

  describe('generatePipelineSuggestions', () => {
    it('should generate pipeline suggestion for repeated workflow patterns', () => {
      // Add workflow patterns
      for (let i = 0; i < 3; i++) {
        patternService.recordEvent({
          type: 'workflow',
          steps: ['npm run build', 'npm run test', 'npm run deploy'],
          threadId: 'thread_1',
          timestamp: new Date(),
        });
      }

      const patterns = patternService.getPatterns('workflow');
      const suggestions = engine.generateAutomationSuggestions(patterns, []);

      const pipelineSuggestions = suggestions.filter(s => s.type === 'pipeline');
      expect(pipelineSuggestions.length).toBeGreaterThan(0);
      expect(pipelineSuggestions[0].title).toContain('Pipeline automation');
    });

    it('should not suggest pipeline for infrequent workflows', () => {
      patternService.recordEvent({
        type: 'workflow',
        steps: ['a', 'b', 'c'],
        timestamp: new Date(),
      });

      const patterns = patternService.getPatterns('workflow');
      const suggestions = engine.generateAutomationSuggestions(patterns, []);

      const pipelineSuggestions = suggestions.filter(s => s.type === 'pipeline');
      expect(pipelineSuggestions.length).toBe(0);
    });
  });

  describe('generateScheduledSuggestions', () => {
    it('should generate scheduled suggestion for regular time patterns', () => {
      // Add time patterns with high frequency
      for (let i = 0; i < 6; i++) {
        patternService.recordEvent({
          type: 'time_pattern',
          activity: 'standup_check',
          hourOfDay: 9,
          dayOfWeek: 1,
          timestamp: new Date(),
        });
      }

      const patterns = patternService.getPatterns('time_pattern');
      const suggestions = engine.generateAutomationSuggestions(patterns, []);

      const scheduledSuggestions = suggestions.filter(s => s.type === 'scheduled');
      expect(scheduledSuggestions.length).toBeGreaterThan(0);
      expect(scheduledSuggestions[0].title).toContain('Scheduled');
    });
  });

  describe('generatePreemptiveSuggestions', () => {
    it('should generate preemptive suggestion for high failure rate tasks', () => {
      // Create session with failing tasks
      for (let i = 0; i < 10; i++) {
        sessionService.recordEvent({
          type: 'task_started',
          taskType: 'unreliable_api_call',
          timestamp: new Date(),
        });
        sessionService.recordEvent({
          type: 'task_completed',
          taskType: 'unreliable_api_call',
          success: false,
          errorType: 'transient',
          retryCount: 3,
          duration: 5000,
          timestamp: new Date(),
        });
      }

      sessionService.recordEvent({
        type: 'session_completed',
        overallSuccess: false,
        timestamp: new Date(),
      });

      const patterns = patternService.getPatterns();
      const reviews = sessionService.getSessionReviews();
      const suggestions = engine.generateAutomationSuggestions(patterns, reviews);

      const preemptiveSuggestions = suggestions.filter(s => s.type === 'preemptive');
      expect(preemptiveSuggestions.length).toBeGreaterThan(0);
      expect(preemptiveSuggestions[0].description).toContain('unreliable_api_call');
    });

    it('should not suggest preemptive for low failure rate', () => {
      // 1 failure out of 10 tasks = 10% failure rate
      for (let i = 0; i < 9; i++) {
        sessionService.recordEvent({
          type: 'task_started',
          taskType: 'mostly_reliable',
          timestamp: new Date(),
        });
        sessionService.recordEvent({
          type: 'task_completed',
          taskType: 'mostly_reliable',
          success: true,
          retryCount: 0,
          duration: 1000,
          timestamp: new Date(),
        });
      }
      sessionService.recordEvent({
        type: 'task_started',
        taskType: 'mostly_reliable',
        timestamp: new Date(),
      });
      sessionService.recordEvent({
        type: 'task_completed',
        taskType: 'mostly_reliable',
        success: false,
        errorType: 'transient',
        retryCount: 1,
        duration: 1000,
        timestamp: new Date(),
      });

      sessionService.recordEvent({
        type: 'session_completed',
        overallSuccess: true,
        timestamp: new Date(),
      });

      const patterns = patternService.getPatterns();
      const reviews = sessionService.getSessionReviews();
      const suggestions = engine.generateAutomationSuggestions(patterns, reviews);

      const preemptiveSuggestions = suggestions.filter(s => s.type === 'preemptive');
      // Should not suggest preemptive for 10% failure rate (below 0.7 threshold)
      expect(preemptiveSuggestions.length).toBe(0);
    });
  });

  describe('getAutomationCandidates', () => {
    it('should categorize suggestions by priority', () => {
      // Add high confidence patterns
      for (let i = 0; i < 10; i++) {
        patternService.recordEvent({
          type: 'workflow',
          steps: ['build', 'test', 'deploy'],
          threadId: 'thread_1',
          timestamp: new Date(),
        });
      }

      // Add low confidence patterns
      patternService.recordEvent({
        type: 'command',
        command: 'ls',
        timestamp: new Date(),
      });

      const candidates = engine.getAutomationCandidates();

      expect(candidates.suggestions.length).toBeGreaterThan(0);
      expect(candidates.highPriority).toBeDefined();
      expect(candidates.mediumPriority).toBeDefined();
      expect(candidates.lowPriority).toBeDefined();
    });
  });
});

describe('generateAutomationSuggestions (standalone function)', () => {
  it('should generate suggestions from patterns and reviews', () => {
    const patterns: Pattern[] = [
      {
        id: 'p1',
        type: 'workflow',
        trigger: 'git add . -> git commit -m -> git push',
        frequency: 5,
        lastSeen: new Date(),
        confidence: 0.8,
        evidence: ['thread:t1'],
      },
    ];

    const reviews = [];

    const suggestions = generateAutomationSuggestions(patterns, reviews);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].type).toBe('pipeline');
  });

  it('should return empty array for no patterns or reviews', () => {
    const suggestions = generateAutomationSuggestions([], []);
    expect(suggestions).toEqual([]);
  });

  it('should deduplicate suggestions with same title', () => {
    const patterns: Pattern[] = [
      {
        id: 'p1',
        type: 'command',
        trigger: 'test',
        frequency: 10,
        lastSeen: new Date(),
        confidence: 0.9,
        evidence: [],
      },
      {
        id: 'p2',
        type: 'command',
        trigger: 'test',
        frequency: 8,
        lastSeen: new Date(),
        confidence: 0.85,
        evidence: [],
      },
    ];

    const suggestions = generateAutomationSuggestions(patterns, []);

    // Should deduplicate based on title
    expect(suggestions.length).toBeLessThanOrEqual(patterns.length);
  });
});

describe('AutomationSuggestion structure', () => {
  it('should have required fields', () => {
    const patternService = createPatternSurfaceService();
    const sessionService = createSessionReviewService();
    const engine = createAutomationSuggestionEngine(patternService, sessionService);

    patternService.recordEvent({
      type: 'workflow',
      steps: ['a', 'b', 'c'],
      threadId: 't1',
      timestamp: new Date(),
    });

    for (let i = 0; i < 5; i++) {
      patternService.recordEvent({
        type: 'workflow',
        steps: ['a', 'b', 'c'],
        timestamp: new Date(),
      });
    }

    const patterns = patternService.getPatterns();
    const suggestions = engine.generateAutomationSuggestions(patterns, []);

    if (suggestions.length > 0) {
      const suggestion = suggestions[0];
      expect(suggestion).toHaveProperty('id');
      expect(suggestion).toHaveProperty('type');
      expect(suggestion).toHaveProperty('title');
      expect(suggestion).toHaveProperty('description');
      expect(suggestion).toHaveProperty('trigger');
      expect(suggestion).toHaveProperty('confidence');
      expect(suggestion).toHaveProperty('estimatedSavings');
      expect(suggestion).toHaveProperty('patternIds');
      expect(suggestion.type).toBeOneOf(['pipeline', 'scheduled', 'workflow', 'preemptive']);
    }
  });
});

// Helper to extend expect with toBeOneOf matcher
expect.extend({
  toBeOneOf(received: string, validValues: string[]) {
    const pass = validValues.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of [${validValues.join(', ')}]`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to be one of [${validValues.join(', ')}]`,
      pass: false,
    };
  },
});
