/**
 * BlockList - Manages TerminalBlocks for a session.
 *
 * Provides ordered access to blocks and supports partial updates
 * for streaming block data.
 */

import type { TerminalSessionId } from '@doorway/protocol';
import type { TerminalBlock } from './types.js';

function generateBlockId(): string {
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class BlockList {
  private blocks: TerminalBlock[] = [];
  private blockMap: Map<string, TerminalBlock> = new Map();
  private sessionId: TerminalSessionId;

  constructor(sessionId: TerminalSessionId) {
    this.sessionId = sessionId;
  }

  /**
   * Add a new block to the list. Returns the created block.
   */
  addBlock(block: Omit<TerminalBlock, 'id' | 'sessionId' | 'index'>): TerminalBlock {
    const id = generateBlockId();
    const index = this.blocks.length;

    const newBlock: TerminalBlock = {
      ...block,
      id,
      sessionId: this.sessionId,
      index,
    };

    this.blocks.push(newBlock);
    this.blockMap.set(id, newBlock);

    return newBlock;
  }

  /**
   * Get a block by its index in the list.
   */
  getBlock(index: number): TerminalBlock | undefined {
    return this.blocks[index];
  }

  /**
   * Get a block by its unique ID.
   */
  getBlockById(id: string): TerminalBlock | undefined {
    return this.blockMap.get(id);
  }

  /**
   * Get all blocks in order.
   */
  getBlocks(): readonly TerminalBlock[] {
    return this.blocks;
  }

  /**
   * Update a block with partial updates. Creates a new block object.
   * Returns the updated block or undefined if not found.
   */
  updateBlock(id: string, updates: Partial<Omit<TerminalBlock, 'id' | 'sessionId' | 'index'>>): TerminalBlock | undefined {
    const block = this.blockMap.get(id);
    if (!block) {
      return undefined;
    }

    const updatedBlock: TerminalBlock = {
      ...block,
      ...updates,
    };

    // Update in array
    const index = block.index;
    this.blocks[index] = updatedBlock;
    this.blockMap.set(id, updatedBlock);

    return updatedBlock;
  }

  /**
   * Get the current block count.
   */
  getBlockCount(): number {
    return this.blocks.length;
  }

  /**
   * Get the most recently added block (for streaming).
   */
  getLatestBlock(): TerminalBlock | undefined {
    if (this.blocks.length === 0) {
      return undefined;
    }
    return this.blocks[this.blocks.length - 1];
  }

  /**
   * Clear all blocks.
   */
  clear(): void {
    this.blocks = [];
    this.blockMap.clear();
  }
}
