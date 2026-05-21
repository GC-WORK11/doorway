/**
 * Handoff Capsule Service
 *
 * High-level API for creating, storing, and retrieving handoff capsules.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { ThreadSummary, RunSummary } from '@doorway/protocol';
import type {
  HandoffCapsule,
  CapsuleOptions,
  CapsuleFormat,
  ChangedFile,
  TestStatus,
} from './types.js';
import type { CapsuleCompileOptions } from './compiler.js';
import {
  compileCapsule,
  compileCapsuleFormats,
  toJson,
  toMarkdown,
  toMinimal,
  parseJsonCapsule,
} from './compiler.js';
import { CapsuleWriteError, CapsuleNotFoundError } from './errors.js';

export interface CapsuleStorageOptions {
  readonly basePath?: string;
}

export interface CapsuleQuery {
  readonly threadId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Capsule Service for managing handoff capsules.
 */
export class CapsuleService {
  private readonly basePath: string;

  constructor(options: CapsuleStorageOptions = {}) {
    this.basePath = options.basePath ?? '.doorway/capsules';
  }

  /**
   * Create a new handoff capsule from thread state.
   */
  createCapsule(
    options: Omit<CapsuleCompileOptions, 'threadId'> & { threadId: string }
  ): HandoffCapsule {
    return compileCapsule(options as CapsuleCompileOptions);
  }

  /**
   * Create capsule in multiple formats.
   */
  createCapsuleFormats(
    options: Omit<CapsuleCompileOptions, 'threadId'> & { threadId: string }
  ): CapsuleFormat {
    return compileCapsuleFormats(options as CapsuleCompileOptions);
  }

  /**
   * Save a capsule to disk.
   */
  async save(capsule: HandoffCapsule): Promise<void> {
    const dir = this.getCapsuleDir(capsule.threadId);
    const filePath = join(dir, `${capsule.id}.json`);

    try {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(filePath, toJson(capsule), 'utf-8');
    } catch (error) {
      throw new CapsuleWriteError(
        `Failed to save capsule: ${error instanceof Error ? error.message : String(error)}`,
        { capsuleId: capsule.id, path: filePath }
      );
    }
  }

  /**
   * Load a capsule by ID.
   */
  async load(capsuleId: string, threadId: string): Promise<HandoffCapsule> {
    const filePath = join(this.getCapsuleDir(threadId), `${capsuleId}.json`);

    if (!existsSync(filePath)) {
      throw new CapsuleNotFoundError(capsuleId);
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      return parseJsonCapsule(content);
    } catch (error) {
      throw new CapsuleWriteError(
        `Failed to load capsule: ${error instanceof Error ? error.message : String(error)}`,
        { capsuleId, path: filePath }
      );
    }
  }

  /**
   * List capsules for a thread.
   */
  async list(
    threadId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<readonly HandoffCapsule[]> {
    const dir = this.getCapsuleDir(threadId);

    if (!existsSync(dir)) {
      return [];
    }

    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(dir);
      const jsonFiles = files
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();

      const capsules: HandoffCapsule[] = [];
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      for (let i = offset; i < jsonFiles.length && capsules.length < limit; i++) {
        try {
          const content = await readFile(join(dir, jsonFiles[i]!), 'utf-8');
          capsules.push(parseJsonCapsule(content));
        } catch {
          // Skip invalid capsules
        }
      }

      return capsules;
    } catch (error) {
      return [];
    }
  }

  /**
   * Export capsule in a specific format.
   */
  async export(
    capsuleId: string,
    threadId: string,
    format: 'json' | 'markdown' | 'minimal'
  ): Promise<string> {
    const capsule = await this.load(capsuleId, threadId);

    switch (format) {
      case 'json':
        return toJson(capsule);
      case 'markdown':
        return toMarkdown(capsule);
      case 'minimal':
        return toMinimal(capsule);
    }
  }

  private getCapsuleDir(threadId: string): string {
    // Sanitize thread ID for filesystem
    const sanitized = threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.basePath, sanitized);
  }
}

/**
 * Create a capsule service instance.
 */
export function createCapsuleService(options?: CapsuleStorageOptions): CapsuleService {
  return new CapsuleService(options);
}

/**
 * Quick helper to create and save a capsule.
 */
export async function createAndSaveCapsule(
  options: Omit<CapsuleCompileOptions, 'threadId'> & { threadId: string },
  storageOptions?: CapsuleStorageOptions
): Promise<HandoffCapsule> {
  const service = createCapsuleService(storageOptions);
  const capsule = service.createCapsule(options);
  await service.save(capsule);
  return capsule;
}
