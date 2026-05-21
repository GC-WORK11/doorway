type EventCallback = (payload: any) => void;

export class DoorwayEventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: string, payload: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }

    // Emit wildcard event if someone is listening to everything
    const wildcardCallbacks = this.listeners.get('*');
    if (wildcardCallbacks) {
      for (const callback of wildcardCallbacks) {
        try {
          callback({ event, payload });
        } catch (error) {
          console.error(`Error in wildcard event listener:`, error);
        }
      }
    }
  }
}

// Global singleton for the core package to emit and apps to listen
export const dbEventBus = new DoorwayEventBus();
