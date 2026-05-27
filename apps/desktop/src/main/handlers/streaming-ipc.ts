/**
 * Streaming IPC for Terminal
 *
 * Provides real-time streaming of terminal output to renderer via WebSocket.
 * This bypasses DB polling for live terminal updates.
 *
 * Architecture:
 *   PTY → SessionManager → [DB + StreamHub] → WebSocket → Renderer
 *                                   ↑
 *                          Direct IPC emit (fast)
 *                                   ↓
 *                          Persistence (async, not blocking)
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { TerminalSessionId } from '@doorway/protocol';

// ============================================================================
// Types
// ============================================================================

export interface StreamMessage {
  readonly type: 'data' | 'exit' | 'resize' | 'error' | 'clarification';
  readonly sessionId: TerminalSessionId;
  readonly data?: string;
  readonly exitCode?: number;
  readonly signal?: string | null;
  readonly cols?: number;
  readonly rows?: number;
  readonly error?: string;
  readonly timestamp: string;
  // Clarification fields
  readonly clarificationId?: string;
  readonly question?: string;
  readonly context?: string;
  readonly suggestedResponses?: string[];
}

export interface StreamSubscription {
  readonly sessionId: TerminalSessionId;
  readonly webContentsId: number;
  readonly subscribedAt: Date;
}

// ============================================================================
// Stream Hub
// ============================================================================

/**
 * Central hub for terminal streaming.
 * Manages subscriptions and broadcasts to renderers.
 */
export class TerminalStreamHub {
  private readonly subscriptions = new Map<TerminalSessionId, Set<number>>();
  private readonly messageBuffer = new Map<TerminalSessionId, StreamMessage[]>();
  private readonly bufferSize = 100;
  private readonly bufferTtl = 60000; // 1 minute

  /**
   * Subscribe a renderer to terminal session output.
   */
  subscribe(sessionId: TerminalSessionId, webContentsId: number): void {
    if (!this.subscriptions.has(sessionId)) {
      this.subscriptions.set(sessionId, new Set());
    }
    this.subscriptions.get(sessionId)!.add(webContentsId);
    console.log(`[StreamHub] Subscribed ${webContentsId} to session ${sessionId.slice(0, 8)}`);
  }

  /**
   * Unsubscribe a renderer from terminal session output.
   */
  unsubscribe(sessionId: TerminalSessionId, webContentsId: number): void {
    const subs = this.subscriptions.get(sessionId);
    if (subs) {
      subs.delete(webContentsId);
      if (subs.size === 0) {
        this.subscriptions.delete(sessionId);
        this.messageBuffer.delete(sessionId);
        console.log(`[StreamHub] All renderers unsubscribed from ${sessionId.slice(0, 8)}`);
      }
    }
  }

  /**
   * Broadcast a message to all subscribed renderers.
   */
  broadcast(message: StreamMessage): void {
    const { sessionId, type } = message;
    const subs = this.subscriptions.get(sessionId);

    // Buffer message for late subscribers
    this.bufferMessage(sessionId, message);

    if (!subs || subs.size === 0) {
      return;
    }

    // Send to all windows
    for (const webContentsId of subs) {
      const window = BrowserWindow.fromId(webContentsId);
      if (window && !window.isDestroyed()) {
        window.webContents.send('terminal:stream', message);
      } else {
        // Window gone, clean up
        subs.delete(webContentsId);
      }
    }
  }

  /**
   * Buffer a message for late subscribers.
   */
  private bufferMessage(sessionId: TerminalSessionId, message: StreamMessage): void {
    if (!this.messageBuffer.has(sessionId)) {
      this.messageBuffer.set(sessionId, []);
    }

    const buffer = this.messageBuffer.get(sessionId)!;
    buffer.push(message);

    // Trim buffer if too large
    if (buffer.length > this.bufferSize) {
      buffer.splice(0, buffer.length - this.bufferSize);
    }
  }

  /**
   * Get buffered messages for a session (for late subscribers).
   */
  getBufferedMessages(sessionId: TerminalSessionId): StreamMessage[] {
    const buffer = this.messageBuffer.get(sessionId) ?? [];
    const cutoff = Date.now() - this.bufferTtl;

    // Filter out old messages
    return buffer.filter((msg) => new Date(msg.timestamp).getTime() > cutoff);
  }

  /**
   * Get all active session IDs.
   */
  getActiveSessions(): TerminalSessionId[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get subscription count for a session.
   */
  getSubscriptionCount(sessionId: TerminalSessionId): number {
    return this.subscriptions.get(sessionId)?.size ?? 0;
  }
}

// ============================================================================
// Global Stream Hub
// ============================================================================

export const terminalStreamHub = new TerminalStreamHub();

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Register streaming IPC handlers.
 */
export function registerStreamingHandlers(): void {
  // Start streaming for a session
  ipcMain.handle(
    'terminal:stream-start',
    (event, { sessionId }: { sessionId: TerminalSessionId }) => {
      const webContentsId = event.sender.id;

      terminalStreamHub.subscribe(sessionId, webContentsId);

      // Send buffered messages to catch up
      const buffered = terminalStreamHub.getBufferedMessages(sessionId);
      for (const msg of buffered) {
        event.sender.send('terminal:stream', msg);
      }

      console.log(
        `[StreamHandler] Started streaming session ${sessionId.slice(0, 8)} (${buffered.length} buffered)`
      );

      return {
        success: true,
        sessionId,
        bufferedCount: buffered.length,
      };
    }
  );

  // Stop streaming for a session
  ipcMain.handle(
    'terminal:stream-stop',
    (event, { sessionId }: { sessionId: TerminalSessionId }) => {
      const webContentsId = event.sender.id;

      terminalStreamHub.unsubscribe(sessionId, webContentsId);

      console.log(`[StreamHandler] Stopped streaming session ${sessionId.slice(0, 8)}`);

      return { success: true };
    }
  );

  // Get active streaming sessions
  ipcMain.handle('terminal:stream-active-sessions', () => {
    const sessions = terminalStreamHub.getActiveSessions();
    return sessions.map((sessionId) => ({
      sessionId,
      subscriptionCount: terminalStreamHub.getSubscriptionCount(sessionId),
    }));
  });

  console.log('[StreamHandler] Registered streaming IPC handlers');
}

// ============================================================================
// Bridge: SessionManager → StreamHub
// ============================================================================

/**
 * Create a streaming bridge for SessionManager.
 * Wraps the callback to also broadcast to StreamHub.
 */
export function createStreamingBridge(
  sessionId: TerminalSessionId,
  onData: (data: string) => void,
  onExit: (exitCode: number, signal: string | null) => void
): {
  onData: (data: string) => void;
  onExit: (exitCode: number, signal: string | null) => void;
  onResize: (cols: number, rows: number) => void;
} {
  return {
    onData: (data: string) => {
      // Call original handler
      onData(data);

      // Broadcast to stream hub
      terminalStreamHub.broadcast({
        type: 'data',
        sessionId,
        data,
        timestamp: new Date().toISOString(),
      });
    },

    onExit: (exitCode: number, signal: string | null) => {
      // Call original handler
      onExit(exitCode, signal);

      // Broadcast to stream hub
      terminalStreamHub.broadcast({
        type: 'exit',
        sessionId,
        exitCode,
        signal,
        timestamp: new Date().toISOString(),
      });
    },

    onResize: (cols: number, rows: number) => {
      // Broadcast resize to stream hub
      terminalStreamHub.broadcast({
        type: 'resize',
        sessionId,
        cols,
        rows,
        timestamp: new Date().toISOString(),
      });
    },
  };
}
