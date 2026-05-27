/**
 * Skill Registry
 * Centralized skill management with discovery and hot-reloading support.
 */

import { EventEmitter } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadSkillsFromPlugin,
  loadAllPluginSkills,
  findSkillById,
  searchSkills,
  type SkillDefinition,
  type PluginSkillsResult,
} from '@doorway/adapters';
import type { PluginManager } from './PluginManager.js';

export interface RegisteredSkill extends SkillDefinition {
  readonly loadedAt: Date;
  readonly source: 'plugin' | 'builtin';
}

export interface SkillRegistryStats {
  readonly totalSkills: number;
  readonly skillsByPlugin: Record<string, number>;
  readonly lastReload: Date | null;
}

/**
 * SkillRegistry provides centralized skill management with hot-reloading support.
 * It integrates with PluginManager to discover and load skills from plugins.
 */
export class SkillRegistry extends EventEmitter {
  private readonly skillsByPlugin = new Map<string, readonly PluginSkillsResult>();
  private readonly skillIndex = new Map<string, SkillDefinition>();
  private lastReload: Date | null = null;
  private reloadIntervalMs = 0;
  private reloadTimer: ReturnType<typeof setInterval> | null = null;
  private pluginManager: PluginManager | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize the registry with a PluginManager instance for auto-discovery.
   */
  attachToPluginManager(manager: PluginManager): void {
    this.pluginManager = manager;

    manager.on('plugin:discovered', () => {
      this.reloadFromPlugins();
    });

    manager.on('plugin:reloaded', () => {
      this.reloadFromPlugins();
    });

    manager.on('plugin:enabled', () => {
      this.reloadFromPlugins();
    });

    manager.on('plugin:disabled', () => {
      this.reloadFromPlugins();
    });
  }

  /**
   * Load skills from a specific plugin path.
   */
  loadSkillsFromPath(pluginPath: string, pluginId: string): readonly PluginSkillsResult {
    const result = loadSkillsFromPlugin(pluginPath, pluginId);
    this.skillsByPlugin.set(pluginId, result);
    this.rebuildIndex();
    this.lastReload = new Date();
    this.emit('skills:loaded', { pluginId, count: result.skills.length });
    return result;
  }

  /**
   * Load skills from multiple plugin paths.
   */
  loadSkillsFromPaths(
    paths: readonly { path: string; id: string }[]
  ): readonly PluginSkillsResult[] {
    const results = loadAllPluginSkills(paths);

    for (const result of results) {
      this.skillsByPlugin.set(result.pluginId, result);
    }

    this.rebuildIndex();
    this.lastReload = new Date();
    this.emit('skills:reloaded', { totalCount: results.reduce((sum, r) => sum + r.skills.length, 0) });

    return results;
  }

  /**
   * Reload skills from the attached PluginManager.
   */
  reloadFromPlugins(): readonly PluginSkillsResult[] {
    if (!this.pluginManager) {
      return [];
    }

    const skillPaths = this.pluginManager.getPluginSkillPaths();
    return this.loadSkillsFromPaths(skillPaths);
  }

  /**
   * Rebuild the skill index for fast lookups.
   */
  private rebuildIndex(): void {
    this.skillIndex.clear();

    for (const [, pluginResult] of this.skillsByPlugin) {
      for (const skill of pluginResult.skills) {
        this.skillIndex.set(skill.id, skill);
      }
    }
  }

  /**
   * Get a skill by ID.
   */
  getSkill(skillId: string): SkillDefinition | undefined {
    return this.skillIndex.get(skillId);
  }

  /**
   * Get all registered skills.
   */
  getAllSkills(): readonly SkillDefinition[] {
    return Array.from(this.skillIndex.values());
  }

  /**
   * Get skills organized by plugin.
   */
  getSkillsByPlugin(): ReadonlyMap<string, readonly PluginSkillsResult> {
    return new Map(this.skillsByPlugin);
  }

  /**
   * Search skills by query string.
   */
  search(query: string): readonly SkillDefinition[] {
    const results = searchSkills(query, Array.from(this.skillsByPlugin.values()));
    return results;
  }

  /**
   * Find skills by tag.
   */
  findByTag(tag: string): readonly SkillDefinition[] {
    const normalizedTag = tag.toLowerCase();
    return this.getAllSkills().filter((skill) =>
      skill.tags.some((t) => t.toLowerCase() === normalizedTag)
    );
  }

  /**
   * Find skills by trigger.
   */
  findByTrigger(trigger: string): readonly SkillDefinition[] {
    const normalizedTrigger = trigger.toLowerCase();
    return this.getAllSkills().filter((skill) =>
      skill.triggers.some((t) => t.toLowerCase() === normalizedTrigger)
    );
  }

  /**
   * Get statistics about the registry.
   */
  getStats(): SkillRegistryStats {
    const skillsByPlugin: Record<string, number> = {};

    for (const [pluginId, result] of this.skillsByPlugin) {
      skillsByPlugin[pluginId] = result.skills.length;
    }

    return {
      totalSkills: this.skillIndex.size,
      skillsByPlugin,
      lastReload: this.lastReload,
    };
  }

  /**
   * Enable hot-reloading of skills at a given interval.
   */
  enableHotReload(intervalMs: number): void {
    if (intervalMs <= 0) {
      throw new Error('Hot reload interval must be positive');
    }

    this.reloadIntervalMs = intervalMs;
    this.stopHotReload();

    this.reloadTimer = setInterval(() => {
      this.reloadFromPlugins();
    }, intervalMs);

    this.emit('hotreload:enabled', { intervalMs });
  }

  /**
   * Disable hot-reloading.
   */
  stopHotReload(): void {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = null;
      this.emit('hotreload:disabled');
    }
  }

  /**
   * Check if hot-reloading is enabled.
   */
  isHotReloadEnabled(): boolean {
    return this.reloadTimer !== null;
  }

  /**
   * Get the hot-reload interval in milliseconds.
   */
  getHotReloadInterval(): number {
    return this.reloadIntervalMs;
  }

  /**
   * Clear all skills from the registry.
   */
  clear(): void {
    this.skillsByPlugin.clear();
    this.skillIndex.clear();
    this.lastReload = new Date();
    this.emit('skills:cleared');
  }

  /**
   * Remove skills from a specific plugin.
   */
  removePluginSkills(pluginId: string): boolean {
    if (!this.skillsByPlugin.has(pluginId)) {
      return false;
    }

    this.skillsByPlugin.delete(pluginId);
    this.rebuildIndex();
    this.lastReload = new Date();
    this.emit('skills:removed', { pluginId });
    return true;
  }
}