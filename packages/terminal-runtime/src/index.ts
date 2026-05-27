/**
 * Doorway Terminal Runtime
 *
 * Handles terminal session lifecycle: create, launch, send input, capture output,
 * record transcript chunks, stop process, and record exit code.
 *
 * Supports multiple backends: node-pty (primary), tmux (future), ConPTY (future).
 */

export * from './session.js';
export * from './pty-backend.js';
export * from './exit-taxonomy.js';
export * from './terminal-decoder.js';
export * from './state-detector.js';
export * from './process-tracker.js';
export * from './file-delta.js';
export * from './types.js';
export * from './errors.js';
export { BlockList } from './block-list.js';
