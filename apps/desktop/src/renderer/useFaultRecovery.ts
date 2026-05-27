/**
 * Fault Recovery Hook
 *
 * Provides access to fault recovery events in the renderer.
 */

import { useEffect, useCallback, useState } from 'react';
import type { FaultRecoveryAction, ClarificationRequest } from './useTerminalStream';

// Re-export for convenience
export type { FaultRecoveryAction, ClarificationRequest };

export type FaultRecoveryActionType = FaultRecoveryAction['type'];

export interface UseFaultRecoveryOptions {
  readonly onAction?: (action: FaultRecoveryAction) => void;
  readonly onClarification?: (request: ClarificationRequest) => void;
}

export interface UseFaultRecoveryResult {
  readonly lastAction: FaultRecoveryAction | null;
  readonly lastClarification: ClarificationRequest | null;
  readonly actionHistory: readonly FaultRecoveryAction[];
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for fault recovery events.
 */
export function useFaultRecovery(options: UseFaultRecoveryOptions = {}): UseFaultRecoveryResult {
  const { onAction, onClarification } = options;

  const [lastAction, setLastAction] = useState<FaultRecoveryAction | null>(null);
  const [lastClarification, setLastClarification] = useState<ClarificationRequest | null>(null);
  const [actionHistory, setActionHistory] = useState<readonly FaultRecoveryAction[]>([]);

  // Subscribe to fault recovery actions
  useEffect(() => {
    if (typeof window === 'undefined' || !window.doorway?.faultRecovery) {
      return;
    }

    const unsubscribe = window.doorway.faultRecovery.onAction((action: FaultRecoveryAction) => {
      setLastAction(action);
      setActionHistory((prev) => [...prev.slice(-49), action]);
      onAction?.(action);
    });

    return unsubscribe;
  }, [onAction]);

  // Subscribe to clarification requests
  useEffect(() => {
    if (typeof window === 'undefined' || !window.doorway?.faultRecovery) {
      return;
    }

    const unsubscribe = window.doorway.faultRecovery.onClarification(
      (request: ClarificationRequest) => {
        setLastClarification(request);
        onClarification?.(request);
      }
    );

    return unsubscribe;
  }, [onClarification]);

  return {
    lastAction,
    lastClarification,
    actionHistory,
  };
}

// ============================================================================
// Fault Recovery UI Components
// ============================================================================

/**
 * Format delay for display
 */
export function formatDelay(delayMs?: number): string {
  if (!delayMs) return '';
  if (delayMs < 1000) return `${delayMs}ms`;
  if (delayMs < 60000) return `${Math.round(delayMs / 1000)}s`;
  return `${Math.round(delayMs / 60000)}m`;
}

/**
 * Get action label for display
 */
export function getActionLabel(type: FaultRecoveryActionType): string {
  switch (type) {
    case 'retry':
      return 'Retrying...';
    case 'reprompt':
      return 'Re-prompting...';
    case 'switch_model':
      return 'Switching model...';
    case 'ask_user':
      return 'Waiting for input...';
    case 'halt':
      return 'Stopped';
    default:
      return 'Unknown';
  }
}

/**
 * Get action color for display
 */
export function getActionColor(type: FaultRecoveryActionType): string {
  switch (type) {
    case 'retry':
      return 'text-yellow-500';
    case 'reprompt':
      return 'text-blue-500';
    case 'switch_model':
      return 'text-purple-500';
    case 'ask_user':
      return 'text-orange-500';
    case 'halt':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}
