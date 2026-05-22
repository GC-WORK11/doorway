import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionReviewService,
  createSessionReviewService,
  classifyError,
  calculateBackoff,
  type SessionReviewEvent,
} from './session-review.js';

describe('SessionReviewService', () => {
  let service: SessionReviewService;

  beforeEach(() => {
    service = createSessionReviewService();
  });

  describe('recordEvent', () => {
    it('should record task started event', () => {
      const event: SessionReviewEvent = {
        type: 'task_started',
        taskType: 'code_review',
        modelId: 'claude-sonnet',
        timestamp: new Date(),
      };

      service.recordEvent(event);
      // Task is pending, no completed task yet
      expect(service.getSessionReviews()).toHaveLength(0);
    });

    it('should record task completed event', () => {
      const startEvent: SessionReviewEvent = {
        type: 'task_started',
        taskType: 'code_review',
        timestamp: new Date(),
      };
      const completeEvent: SessionReviewEvent = {
        type: 'task_completed',
        taskType: 'code_review',
        success: true,
        retryCount: 0,
        duration: 5000,
        timestamp: new Date(),
      };

      service.recordEvent(startEvent);
      service.recordEvent(completeEvent);

      expect(service.getSessionReviews()).toHaveLength(0); // Session not finalized yet
    });

    it('should record task rejected event', () => {
      const event: SessionReviewEvent = {
        type: 'task_rejected',
        taskType: 'dangerous_command',
        reason: 'Permission denied',
        timestamp: new Date(),
      };

      service.recordEvent(event);
      // Check metrics
      const metrics = service.getMetrics();
      expect(metrics.totalSessions).toBe(0);
    });

    it('should finalize session and create review', () => {
      // Start and complete some tasks
      service.recordEvent({
        type: 'task_started',
        taskType: 'build',
        modelId: 'claude',
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'task_completed',
        taskType: 'build',
        success: true,
        retryCount: 0,
        duration: 10000,
        timestamp: new Date(),
      });

      // Complete session
      service.recordEvent({
        type: 'session_completed',
        overallSuccess: true,
        timestamp: new Date(),
      });

      const reviews = service.getSessionReviews();
      expect(reviews).toHaveLength(1);
      expect(reviews[0].overallSuccess).toBe(true);
      expect(reviews[0].tasks).toHaveLength(1);
    });
  });

  describe('getMetrics', () => {
    it('should return empty metrics initially', () => {
      const metrics = service.getMetrics();

      expect(metrics.totalSessions).toBe(0);
      expect(metrics.successfulSessions).toBe(0);
      expect(metrics.failedSessions).toBe(0);
      expect(metrics.averageTaskDuration).toBe(0);
      expect(metrics.averageRetryCount).toBe(0);
    });

    it('should calculate metrics from completed sessions', () => {
      // Session 1: success
      service.recordEvent({
        type: 'task_started',
        taskType: 'test',
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'task_completed',
        taskType: 'test',
        success: true,
        retryCount: 0,
        duration: 5000,
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'session_completed',
        overallSuccess: true,
        timestamp: new Date(),
      });

      const metrics = service.getMetrics();
      expect(metrics.totalSessions).toBe(1);
      expect(metrics.successfulSessions).toBe(1);
      expect(metrics.failedSessions).toBe(0);
      expect(metrics.averageTaskDuration).toBe(5000);
    });

    it('should track transient vs permanent failures', () => {
      // Transient failure
      service.recordEvent({
        type: 'task_started',
        taskType: 'network_task',
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'task_completed',
        taskType: 'network_task',
        success: false,
        errorType: 'transient',
        retryCount: 1,
        duration: 2000,
        timestamp: new Date(),
      });

      // Permanent failure
      service.recordEvent({
        type: 'task_started',
        taskType: 'syntax_task',
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'task_completed',
        taskType: 'syntax_task',
        success: false,
        errorType: 'permanent',
        retryCount: 0,
        duration: 1000,
        timestamp: new Date(),
      });

      service.recordEvent({
        type: 'session_completed',
        overallSuccess: false,
        timestamp: new Date(),
      });

      const metrics = service.getMetrics();
      expect(metrics.transientFailureRate).toBe(0.5);
      expect(metrics.permanentFailureRate).toBe(0.5);
    });
  });

  describe('getSuggestions', () => {
    it('should suggest retry with backoff for high transient failure rate', () => {
      // Create 10 tasks, 6 transient failures
      for (let i = 0; i < 4; i++) {
        service.recordEvent({
          type: 'task_started',
          taskType: 'unstable',
          timestamp: new Date(),
        });
        service.recordEvent({
          type: 'task_completed',
          taskType: 'unstable',
          success: true,
          retryCount: 0,
          duration: 1000,
          timestamp: new Date(),
        });
      }
      for (let i = 0; i < 6; i++) {
        service.recordEvent({
          type: 'task_started',
          taskType: 'unstable',
          timestamp: new Date(),
        });
        service.recordEvent({
          type: 'task_completed',
          taskType: 'unstable',
          success: false,
          errorType: 'transient',
          retryCount: 2,
          duration: 1000,
          timestamp: new Date(),
        });
      }

      service.recordEvent({
        type: 'session_completed',
        overallSuccess: false,
        timestamp: new Date(),
      });

      const suggestions = service.getSuggestions();
      const transientSuggestion = suggestions.find(s => s.includes('transient'));
      expect(transientSuggestion).toBeDefined();
    });

    it('should suggest investigation for high permanent failure rate', () => {
      for (let i = 0; i < 3; i++) {
        service.recordEvent({
          type: 'task_started',
          taskType: 'broken',
          timestamp: new Date(),
        });
        service.recordEvent({
          type: 'task_completed',
          taskType: 'broken',
          success: false,
          errorType: 'permanent',
          retryCount: 0,
          duration: 1000,
          timestamp: new Date(),
        });
      }

      service.recordEvent({
        type: 'session_completed',
        overallSuccess: false,
        timestamp: new Date(),
      });

      const suggestions = service.getSuggestions();
      const permanentSuggestion = suggestions.find(s => s.includes('permanent'));
      expect(permanentSuggestion).toBeDefined();
    });

    it('should return all tasks success message for successful session', () => {
      service.recordEvent({
        type: 'task_started',
        taskType: 'quick_task',
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'task_completed',
        taskType: 'quick_task',
        success: true,
        retryCount: 0,
        duration: 100,
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'session_completed',
        overallSuccess: true,
        timestamp: new Date(),
      });

      const reviews = service.getSessionReviews();
      expect(reviews[0].suggestions).toContain('All tasks completed successfully.');
    });
  });

  describe('getRetryRecommendation', () => {
    it('should recommend retry for unknown task types', () => {
      const rec = service.getRetryRecommendation('new_task');

      expect(rec.shouldRetry).toBe(true);
      expect(rec.backoffMs).toBe(1000);
      expect(rec.maxRetries).toBe(3);
    });

    it('should not retry permanent failures', () => {
      service.recordEvent({
        type: 'task_started',
        taskType: 'impossible',
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'task_completed',
        taskType: 'impossible',
        success: false,
        errorType: 'permanent',
        retryCount: 0,
        duration: 100,
        timestamp: new Date(),
      });

      const rec = service.getRetryRecommendation('impossible');
      expect(rec.shouldRetry).toBe(false);
      expect(rec.maxRetries).toBe(0);
    });

    it('should recommend retry with backoff for transient failures', () => {
      service.recordEvent({
        type: 'task_started',
        taskType: 'network',
        timestamp: new Date(),
      });
      service.recordEvent({
        type: 'task_completed',
        taskType: 'network',
        success: false,
        errorType: 'transient',
        retryCount: 1,
        duration: 500,
        timestamp: new Date(),
      });

      const rec = service.getRetryRecommendation('network');
      expect(rec.shouldRetry).toBe(true);
      expect(rec.backoffMs).toBe(2000); // 1000 * 2^1
      expect(rec.maxRetries).toBe(2);
    });
  });
});

describe('classifyError', () => {
  it('should classify timeout errors as transient', () => {
    expect(classifyError('Connection timeout after 30000ms')).toBe('transient');
    expect(classifyError('ETIMEDOUT')).toBe('transient');
  });

  it('should classify network errors as transient', () => {
    expect(classifyError('Network connection failed')).toBe('transient');
    expect(classifyError('ECONNREFUSED')).toBe('transient');
  });

  it('should classify rate limit errors as transient', () => {
    expect(classifyError('Rate limit exceeded (429)')).toBe('transient');
    expect(classifyError('503 Service Unavailable')).toBe('transient');
  });

  it('should classify syntax errors as permanent', () => {
    expect(classifyError('SyntaxError: Unexpected token')).toBe('permanent');
    expect(classifyError('TypeError: Cannot read property')).toBe('permanent');
  });

  it('should classify permission errors as permanent', () => {
    expect(classifyError('Permission denied')).toBe('permanent');
    expect(classifyError('EACCES: access denied')).toBe('permanent');
  });

  it('should classify not found errors as permanent', () => {
    expect(classifyError('ENOENT: file not found')).toBe('permanent');
    expect(classifyError('Cannot find module')).toBe('permanent');
  });

  it('should return unknown for unrecognized errors', () => {
    expect(classifyError('Something went wrong')).toBe('unknown');
    expect(classifyError('An error occurred')).toBe('unknown');
  });
});

describe('calculateBackoff', () => {
  it('should calculate exponential backoff', () => {
    expect(calculateBackoff(0)).toBe(1000);
    expect(calculateBackoff(1)).toBe(2000);
    expect(calculateBackoff(2)).toBe(4000);
    expect(calculateBackoff(3)).toBe(8000);
  });

  it('should cap backoff at 30 seconds', () => {
    expect(calculateBackoff(10)).toBe(30000);
    expect(calculateBackoff(20)).toBe(30000);
  });

  it('should respect custom base', () => {
    expect(calculateBackoff(2, 500)).toBe(2000);
  });
});
