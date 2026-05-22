/**
 * Terminal Streaming Hook
 *
 * Provides real-time streaming of terminal output via WebSocket/IPC.
 * This is the fast path - data arrives in milliseconds, not via DB polling.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export interface StreamMessage {
  readonly type: 'data' | 'exit' | 'resize' | 'error';
  readonly sessionId: string;
  readonly data?: string;
  readonly exitCode?: number;
  readonly signal?: string | null;
  readonly cols?: number;
  readonly rows?: number;
  readonly error?: string;
  readonly timestamp: string;
}

export interface UseTerminalStreamOptions {
  readonly sessionId: string;
  readonly onData?: (data: string) => void;
  readonly onExit?: (exitCode: number, signal: string | null) => void;
  readonly onResize?: (cols: number, rows: number) => void;
  readonly enabled?: boolean;
}

export interface UseTerminalStreamResult {
  readonly isStreaming: boolean;
  readonly lastMessage: StreamMessage | null;
  readonly messageCount: number;
  readonly error: string | null;
  readonly startStream: () => Promise<void>;
  readonly stopStream: () => Promise<void>;
}

/**
 * Hook for streaming terminal output in real-time.
 */
export function useTerminalStream(options: UseTerminalStreamOptions): UseTerminalStreamResult {
  const { sessionId, onData, onExit, onResize, enabled = true } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [lastMessage, setLastMessage] = useState<StreamMessage | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const startStream = useCallback(async () => {
    if (typeof window === 'undefined' || !window.doorway) {
      console.warn('[TerminalStream] window.doorway not available');
      return;
    }

    try {
      const result = await window.doorway.terminal.startStream(sessionIdRef.current);
      setIsStreaming(true);
      setError(null);
      console.log(
        `[TerminalStream] Started streaming ${sessionIdRef.current.slice(0, 8)} (${result.bufferedCount} buffered)`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('[TerminalStream] Failed to start stream:', err);
    }
  }, []);

  const stopStream = useCallback(async () => {
    if (typeof window === 'undefined' || !window.doorway) {
      return;
    }

    try {
      await window.doorway.terminal.stopStream(sessionIdRef.current);
      setIsStreaming(false);
      console.log(`[TerminalStream] Stopped streaming ${sessionIdRef.current.slice(0, 8)}`);
    } catch (err) {
      console.error('[TerminalStream] Failed to stop stream:', err);
    }
  }, []);

  // Subscribe to stream messages
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.doorway) {
      return;
    }

    // Auto-start streaming when enabled
    void startStream();

    const unsubscribe = window.doorway.terminal.onStream((message: StreamMessage) => {
      setLastMessage(message);
      setMessageCount((c) => c + 1);

      switch (message.type) {
        case 'data':
          onData?.(message.data ?? '');
          break;
        case 'exit':
          onExit?.(message.exitCode ?? 0, message.signal ?? null);
          setIsStreaming(false);
          break;
        case 'resize':
          if (message.cols !== undefined && message.rows !== undefined) {
            onResize?.(message.cols, message.rows);
          }
          break;
        case 'error':
          setError(message.error ?? 'Unknown error');
          break;
      }
    });

    return () => {
      unsubscribe();
      void stopStream();
    };
  }, [enabled, onData, onExit, onResize, startStream, stopStream]);

  return {
    isStreaming,
    lastMessage,
    messageCount,
    error,
    startStream,
    stopStream,
  };
}

// ============================================================================
// Terminal Stream Manager (for multiple sessions)
// ============================================================================

export interface StreamManager {
  readonly subscribe: (sessionId: string, callbacks: TerminalStreamCallbacks) => () => void;
  readonly startAll: () => Promise<void>;
  readonly stopAll: () => Promise<void>;
  readonly getActiveSessions: () => string[];
  readonly getStats: (sessionId: string) => StreamStats | undefined;
}

export interface TerminalStreamCallbacks {
  readonly onData?: (data: string) => void;
  readonly onExit?: (exitCode: number, signal: string | null) => void;
  readonly onResize?: (cols: number, rows: number) => void;
  readonly onError?: (error: string) => void;
}

export interface StreamStats {
  readonly messageCount: number;
  readonly bytesReceived: number;
  readonly lastTimestamp: string | null;
}

const MAX_BUFFER_SIZE = 10000;
const BUFFER_TTL_MS = 60000;

/**
 * Create a stream manager for handling multiple terminal sessions.
 */
export function createStreamManager(): StreamManager {
  const subscriptions = new Map<string, Set<TerminalStreamCallbacks>>();
  const unsubscribes = new Map<string, () => void>();
  const stats = new Map<string, { messageCount: number; bytesReceived: number; lastTimestamp: string | null }>();
  const messageBuffer = new Map<string, StreamMessage[]>();

  let globalUnsubscribe: (() => void) | null = null;
  let isInitialized = false;

  function handleMessage(message: StreamMessage) {
    const { sessionId } = message;

    // Update stats
    const stat = stats.get(sessionId) ?? { messageCount: 0, bytesReceived: 0, lastTimestamp: null };
    stat.messageCount++;
    stat.bytesReceived += message.data?.length ?? 0;
    stat.lastTimestamp = message.timestamp;
    stats.set(sessionId, stat);

    // Buffer message
    const buffer = messageBuffer.get(sessionId) ?? [];
    buffer.push(message);
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
    }
    messageBuffer.set(sessionId, buffer);

    // Dispatch to subscribers
    const subs = subscriptions.get(sessionId);
    if (subs) {
      for (const cb of subs) {
        switch (message.type) {
          case 'data':
            cb.onData?.(message.data ?? '');
            break;
          case 'exit':
            cb.onExit?.(message.exitCode ?? 0, message.signal ?? null);
            break;
          case 'resize':
            if (message.cols !== undefined && message.rows !== undefined) {
              cb.onResize?.(message.cols, message.rows);
            }
            break;
          case 'error':
            cb.onError?.(message.error ?? 'Unknown error');
            break;
        }
      }
    }
  }

  function initialize() {
    if (isInitialized || typeof window === 'undefined' || !window.doorway) {
      return;
    }

    globalUnsubscribe = window.doorway.terminal.onStream(handleMessage);
    isInitialized = true;
  }

  return {
    subscribe(sessionId: string, callbacks: TerminalStreamCallbacks): () => void {
      initialize();

      if (!subscriptions.has(sessionId)) {
        subscriptions.set(sessionId, new Set());

        // Subscribe to IPC
        if (typeof window !== 'undefined' && window.doorway) {
          void window.doorway.terminal.startStream(sessionId);
        }
      }

      subscriptions.get(sessionId)!.add(callbacks);
      stats.set(sessionId, { messageCount: 0, bytesReceived: 0, lastTimestamp: null });

      return () => {
        const subs = subscriptions.get(sessionId);
        if (subs) {
          subs.delete(callbacks);
          if (subs.size === 0) {
            subscriptions.delete(sessionId);
            stats.delete(sessionId);
            messageBuffer.delete(sessionId);

            // Unsubscribe from IPC
            if (typeof window !== 'undefined' && window.doorway) {
              void window.doorway.terminal.stopStream(sessionId);
            }
          }
        }
      };
    },

    async startAll() {
      if (typeof window === 'undefined' || !window.doorway) {
        return;
      }

      initialize();

      for (const sessionId of subscriptions.keys()) {
        await window.doorway.terminal.startStream(sessionId);
      }
    },

    async stopAll() {
      if (typeof window === 'undefined' || !window.doorway) {
        return;
      }

      for (const sessionId of subscriptions.keys()) {
        await window.doorway.terminal.stopStream(sessionId);
      }
    },

    getActiveSessions() {
      return Array.from(subscriptions.keys());
    },

    getStats(sessionId: string) {
      return stats.get(sessionId);
    },
  };
}

// ============================================================================
// Global Stream Manager
// ============================================================================

let globalStreamManager: StreamManager | null = null;

export function getStreamManager(): StreamManager {
  if (!globalStreamManager) {
    globalStreamManager = createStreamManager();
  }
  return globalStreamManager;
}

// ============================================================================
// Type augmentation for window.doorway
// ============================================================================

declare global {
  interface Window {
    doorway: {
      terminal: {
        startStream: (sessionId: string) => Promise<{ success: boolean; sessionId: string; bufferedCount: number }>;
        stopStream: (sessionId: string) => Promise<{ success: boolean }>;
        getActiveStreams: () => Promise<{ sessionId: string; subscriptionCount: number }[]>;
        onStream: (callback: (message: StreamMessage) => void) => () => void;
      };
      // ... other doorway APIs
    };
  }
}
