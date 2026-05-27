/**
 * Plugin Manager
 * Discovers, loads, validates, and manages plugins for Doorway.
 */

import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parsePluginManifest, getPluginManifestPath, type DoorwayPluginManifest } from '@doorway/core';

export interface DiscoveredPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly path: string;
  readonly manifestPath: string;
  readonly manifest: DoorwayPluginManifest;
}

export interface PluginLoadResult {
  readonly plugin: DiscoveredPlugin;
  readonly success: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface PluginError {
  readonly pluginId: string;
  readonly error: string;
}

export type PluginStatus = 'discovered' | 'loaded' | 'failed' | 'disabled';

/**
 * PluginManager handles discovery and lifecycle management of Doorway plugins.
 */
export class PluginManager extends EventEmitter {
  private readonly discoveredPlugins = new Map<string, DiscoveredPlugin>();
  private readonly pluginStatuses = new Map<string, PluginStatus>();
  private readonly pluginErrors = new Map<string, readonly string[]>();

  private watchHandles: readonly string[] = [];
  private isWatching = false;

  /**
   * Discover plugins in a directory. Looks for subdirectories containing
   * doorway.plugin.json manifest files.
   */
  discoverPlugins(pluginRootPath: string): readonly DiscoveredPlugin[] {
    this.discoveredPlugins.clear();
    this.pluginStatuses.clear();
    this.pluginErrors.clear();

    if (!existsSync(pluginRootPath)) {
      return [];
    }

    let entries: { name: string; path: string; isDirectory: boolean }[];
    try {
      entries = readdirSync(pluginRootPath, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        path: resolve(pluginRootPath, entry.name),
        isDirectory: entry.isDirectory(),
      }));
    } catch (error) {
      console.error(`Failed to read plugin directory: ${pluginRootPath}`, error);
      return [];
    }

    const plugins: DiscoveredPlugin[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory) {
        continue;
      }

      const manifestPath = resolve(entry.path, 'doorway.plugin.json');
      if (!existsSync(manifestPath)) {
        continue;
      }

      const result = parsePluginManifest(manifestPath);
      if (result.errors.length > 0) {
        this.pluginStatuses.set(entry.name, 'failed');
        this.pluginErrors.set(entry.name, result.errors);
        this.emit('plugin:invalid', { pluginId: entry.name, errors: result.errors });
        continue;
      }

      if (!result.manifest) {
        continue;
      }

      const plugin: DiscoveredPlugin = {
        id: result.manifest.id,
        name: result.manifest.name,
        version: result.manifest.version,
        path: entry.path,
        manifestPath,
        manifest: result.manifest,
      };

      this.discoveredPlugins.set(plugin.id, plugin);
      this.pluginStatuses.set(plugin.id, 'discovered');
      plugins.push(plugin);

      if (result.warnings.length > 0) {
        this.emit('plugin:warning', { pluginId: plugin.id, warnings: result.warnings });
      }

      this.emit('plugin:discovered', plugin);
    }

    return plugins;
  }

  /**
   * Get all discovered plugins.
   */
  getDiscoveredPlugins(): readonly DiscoveredPlugin[] {
    return Array.from(this.discoveredPlugins.values());
  }

  /**
   * Get a specific plugin by ID.
   */
  getPlugin(pluginId: string): DiscoveredPlugin | undefined {
    return this.discoveredPlugins.get(pluginId);
  }

  /**
   * Get the status of a plugin.
   */
  getPluginStatus(pluginId: string): PluginStatus | undefined {
    return this.pluginStatuses.get(pluginId);
  }

  /**
   * Get errors for a failed plugin.
   */
  getPluginErrors(pluginId: string): readonly string[] | undefined {
    return this.pluginErrors.get(pluginId);
  }

  /**
   * Enable a plugin (marks it as loaded if it was previously disabled).
   */
  enablePlugin(pluginId: string): boolean {
    const plugin = this.discoveredPlugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    this.pluginStatuses.set(pluginId, 'loaded');
    this.emit('plugin:enabled', plugin);
    return true;
  }

  /**
   * Disable a plugin.
   */
  disablePlugin(pluginId: string): boolean {
    const plugin = this.discoveredPlugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    this.pluginStatuses.set(pluginId, 'disabled');
    this.emit('plugin:disabled', { pluginId });
    return true;
  }

  /**
   * Get all enabled plugins.
   */
  getEnabledPlugins(): readonly DiscoveredPlugin[] {
    return this.getDiscoveredPlugins().filter(
      (plugin) => this.pluginStatuses.get(plugin.id) === 'loaded'
    );
  }

  /**
   * Get plugins by capability.
   */
  getPluginsByCapability(capability: string): readonly DiscoveredPlugin[] {
    return this.getEnabledPlugins().filter((plugin) =>
      plugin.manifest.capabilities.includes(capability)
    );
  }

  /**
   * Get all unique capabilities across loaded plugins.
   */
  getAllCapabilities(): readonly string[] {
    const capabilities = new Set<string>();
    for (const plugin of this.getDiscoveredPlugins()) {
      for (const cap of plugin.manifest.capabilities) {
        capabilities.add(cap);
      }
    }
    return Array.from(capabilities);
  }

  /**
   * Validate all discovered plugins.
   */
  validatePlugins(): readonly PluginError[] {
    const errors: PluginError[] = [];

    for (const [pluginId, errorList] of this.pluginErrors) {
      if (errorList.length > 0) {
        errors.push({ pluginId, error: errorList.join('; ') });
      }
    }

    return errors;
  }

  /**
   * Reload a specific plugin by re-parsing its manifest.
   */
  reloadPlugin(pluginId: string): DiscoveredPlugin | undefined {
    const existing = this.discoveredPlugins.get(pluginId);
    if (!existing) {
      return undefined;
    }

    const result = parsePluginManifest(existing.manifestPath);
    if (result.errors.length > 0 || !result.manifest) {
      this.pluginStatuses.set(pluginId, 'failed');
      this.pluginErrors.set(pluginId, result.errors);
      this.emit('plugin:invalid', { pluginId, errors: result.errors });
      return undefined;
    }

    const updated: DiscoveredPlugin = {
      id: result.manifest.id,
      name: result.manifest.name,
      version: result.manifest.version,
      path: existing.path,
      manifestPath: existing.manifestPath,
      manifest: result.manifest,
    };

    this.discoveredPlugins.set(pluginId, updated);
    this.pluginStatuses.set(pluginId, 'loaded');
    this.pluginErrors.delete(pluginId);
    this.emit('plugin:reloaded', updated);

    return updated;
  }

  /**
   * Watch the plugin directory for changes and reload manifests.
   * This is a no-op stub - file watching should be implemented at the app level.
   */
  startWatching(_pluginRootPath: string): void {
    if (this.isWatching) {
      return;
    }
    this.isWatching = true;
    this.emit('watching:started');
  }

  /**
   * Stop watching for changes.
   */
  stopWatching(): void {
    if (!this.isWatching) {
      return;
    }
    this.isWatching = false;
    this.emit('watching:stopped');
  }

  /**
   * Check if watching is active.
   */
  isWatchActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get the MCP server configurations from all enabled plugins.
   */
  getMcpServerConfigs() {
    const configs: { id: string; name: string; command: string; args?: readonly string[]; env?: Record<string, string>; url?: string }[] = [];

    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.manifest.mcpServers) {
        for (const server of plugin.manifest.mcpServers) {
          configs.push({
            id: `${plugin.id}:${server.id}`,
            name: server.name,
            command: server.command,
            args: server.args,
            env: server.env,
            url: server.url,
          });
        }
      }
    }

    return configs;
  }

  /**
   * Get the skill directories from all enabled plugins.
   */
  getPluginSkillPaths(): readonly { pluginId: string; pluginPath: string }[] {
    const paths: { pluginId: string; pluginPath: string }[] = [];

    for (const plugin of this.getEnabledPlugins()) {
      const skillsDir = resolve(plugin.path, 'skills');
      if (existsSync(skillsDir)) {
        paths.push({ pluginId: plugin.id, pluginPath: plugin.path });
      }
    }

    return paths;
  }
}