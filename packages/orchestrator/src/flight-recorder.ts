import type { Database } from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { scrubHandoffSecrets } from './handoff-service.js';

export interface FlightEvent {
  id: string;
  timestamp: string;
  type: string;
  data: any;
  hash: string;
  prevHash: string;
}

function isSecretField(name: string): boolean {
  return /password|secret/i.test(name);
}

export function scrubFlightEventData(data: unknown): unknown {
  if (typeof data === 'string') {
    return scrubHandoffSecrets(data);
  }
  if (Array.isArray(data)) {
    return data.map((item) => scrubFlightEventData(item));
  }
  if (data instanceof Date || data === null || typeof data !== 'object') {
    return data;
  }

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      isSecretField(key) && typeof value === 'string' ? '[REDACTED]' : scrubFlightEventData(value),
    ])
  );
}

/**
 * FlightRecorderService
 *
 * Manages verifiable audit logs for all agent and user actions.
 */
export class FlightRecorderService {
  private lastHash: string = '0'.repeat(64);

  constructor(private db: Database) {}

  /**
   * Record a new event into the flight recorder and SQLite.
   */
  async record(taskId: string, type: string, data: any): Promise<FlightEvent> {
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();
    const cleanData = scrubFlightEventData(data);

    // Hash Chaining (V1 Directive 24)
    const content = JSON.stringify({
      id,
      timestamp,
      type,
      data: cleanData,
      prevHash: this.lastHash,
    });
    const hash = createHash('sha256').update(content).digest('hex');

    const event: FlightEvent = {
      id,
      timestamp,
      type,
      data: cleanData,
      hash,
      prevHash: this.lastHash,
    };

    const payload =
      cleanData !== null && typeof cleanData === 'object' && !Array.isArray(cleanData)
        ? { ...cleanData, hash, prevHash: this.lastHash }
        : { data: cleanData, hash, prevHash: this.lastHash };

    // Store in SQLite
    this.db
      .prepare(
        `
      INSERT INTO events (id, thread_id, type, payload, sequence, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(id, taskId, type, JSON.stringify(payload), 0, timestamp);

    this.lastHash = hash;
    return event;
  }
}
