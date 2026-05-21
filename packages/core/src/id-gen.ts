/**
 * ID Generation Utilities
 * Generates unique IDs with type branding for Doorway entities.
 */

let counter = 0;

/**
 * Generate a unique ID with a given prefix.
 * Format: {prefix}_{timestamp}_{random}
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const instance = process.pid?.toString(36) ?? '0';
  counter = (counter + 1) % 1000;

  return `${prefix}_${timestamp}_${instance}_${random}_${counter.toString(36)}`;
}

/**
 * Convert a Date to ISO string, handling edge cases.
 */
export function toISOString(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

/**
 * Parse an ISO date string to Date.
 */
export function parseDate(value: string): Date {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}
