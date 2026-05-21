import type { ProjectPluginProjection } from '@doorway/protocol';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const pluginManifestRoot = '.doorway/plugins';
const pluginManifestName = 'doorway.plugin.json';

type PluginManifest = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly version?: unknown;
  readonly capabilities?: unknown;
  readonly permissions?: {
    readonly filesystem?: {
      readonly read?: unknown;
      readonly write?: unknown;
    };
    readonly network?: {
      readonly allowed_hosts?: unknown;
    };
  };
  readonly entry?: {
    readonly command?: unknown;
  };
};

export function listProjectPlugins(projectPath: string): readonly ProjectPluginProjection[] {
  const rootPath = resolve(projectPath, pluginManifestRoot);
  if (!existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readProjectPlugin(resolve(rootPath, entry.name)))
    .filter((plugin): plugin is ProjectPluginProjection => Boolean(plugin))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function readProjectPlugin(pluginPath: string): ProjectPluginProjection | undefined {
  const manifestPath = resolve(pluginPath, pluginManifestName);
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest;
  } catch (error) {
    return invalidPlugin(manifestPath, `Manifest JSON is invalid: ${errorMessage(error)}`);
  }

  const problem = validateManifest(manifest);
  if (problem) {
    return invalidPlugin(manifestPath, problem, manifest);
  }

  return {
    id: manifest.id as string,
    name: manifest.name as string,
    version: manifest.version as string,
    manifestPath,
    status: 'ready',
    capabilities: manifest.capabilities as readonly string[],
    filesystemRead: manifest.permissions?.filesystem?.read as readonly string[],
    filesystemWrite: manifest.permissions?.filesystem?.write as readonly string[],
    networkHosts: manifest.permissions?.network?.allowed_hosts as readonly string[],
    entryCommand: manifest.entry?.command as string,
  };
}

function invalidPlugin(
  manifestPath: string,
  problem: string,
  manifest: PluginManifest = {}
): ProjectPluginProjection {
  const fallbackName = basename(resolve(manifestPath, '..'));
  return {
    id: stringField(manifest.id) ?? fallbackName,
    name: stringField(manifest.name) ?? fallbackName,
    version: stringField(manifest.version) ?? 'unknown',
    manifestPath,
    status: 'invalid',
    capabilities: stringList(manifest.capabilities),
    filesystemRead: stringList(manifest.permissions?.filesystem?.read),
    filesystemWrite: stringList(manifest.permissions?.filesystem?.write),
    networkHosts: stringList(manifest.permissions?.network?.allowed_hosts),
    entryCommand: stringField(manifest.entry?.command),
    problem,
  };
}

function validateManifest(manifest: PluginManifest): string | undefined {
  if (!stringField(manifest.id)) return 'Manifest id is required.';
  if (!stringField(manifest.name)) return 'Manifest name is required.';
  if (!stringField(manifest.version)) return 'Manifest version is required.';
  if (!isStringList(manifest.capabilities)) return 'Manifest capabilities must be a string array.';
  if (!isStringList(manifest.permissions?.filesystem?.read)) {
    return 'Manifest permissions.filesystem.read must be a string array.';
  }
  if (!isStringList(manifest.permissions?.filesystem?.write)) {
    return 'Manifest permissions.filesystem.write must be a string array.';
  }
  if (!isStringList(manifest.permissions?.network?.allowed_hosts)) {
    return 'Manifest permissions.network.allowed_hosts must be a string array.';
  }
  if (!stringField(manifest.entry?.command)) return 'Manifest entry.command is required.';
  return undefined;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function stringList(value: unknown): readonly string[] {
  return isStringList(value) ? value : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
