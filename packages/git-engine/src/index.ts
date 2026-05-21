/**
 * Doorway Git Engine
 *
 * Handles git worktree lifecycle: detect git repo, check status,
 * create worktree, list Doorway worktrees, get diff, archive safely.
 */

export * from './worktree.js';
export * from './git.js';
export * from './diff.js';
export * from './diff-service.js';
export * from './integration-service.js';
export * from './discovery-service.js';
export * from './errors.js';
